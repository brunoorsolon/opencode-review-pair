import { loadApprovalHelper } from './approval-helper.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { installationDirectory, readSelection, selectInstallation, savePending, updatePending } from './installation.mjs';

/** Host-owned form, not a model tool or a conversation command. */
export async function installSetupUI(api, { directory = installationDirectory(), loadHelper = loadApprovalHelper,
  select = selectInstallation, pause = (signal, ms = 2000) => delay(ms, undefined, { signal }) } = {}) {
  let current, pending;
  const cancel = (pause = true) => {
    current?.abort(); current = undefined;
    if (pause && pending) { try { updatePending({ directory, flowId: pending.flowId, paused: true }); } catch {} }
    pending = undefined;
  };
  api.lifecycle.onDispose(() => cancel(false));
  function toast(message, variant = 'info') { api.ui.toast({ title: 'Psst', message, variant, duration: 6000 }); }
  function start() {
    cancel();
    const controller = new AbortController(); current = controller;
    const alive = () => current === controller && !controller.signal.aborted && !api.lifecycle.signal.aborted;
    let submitted = false, transitioning = false;
    const close = () => { if (!transitioning && current === controller) cancel(); };
    function replace(render) { transitioning = true; try { api.ui.dialog.replace(render, close); } finally { transitioning = false; } }
    replace(() => api.ui.DialogPrompt({
      title: 'Psst setup — broker URL', placeholder: 'https://broker.example',
      onCancel: close,
      onConfirm: async value => {
        if (!alive() || submitted) return;
        submitted = true;
        try {
          const brokerUrl = new URL(value.trim());
          if (brokerUrl.protocol !== 'https:' || brokerUrl.username || brokerUrl.password || brokerUrl.search || brokerUrl.hash || brokerUrl.pathname !== '/') throw new Error();
          const helper = await loadHelper();
          if (!alive()) return;
          const selected = readSelection(directory);
          const expectedRevision = selected?.revision ?? null;
          const options = { directory, brokerUrl: brokerUrl.href, clientType: 'opencode' };
          const prior = helper.readApprovalState(options);
          async function enroll(replaceRequestId) {
            if (!alive()) return;
            pending = savePending({ directory, brokerUrl: brokerUrl.href, expectedRevision, requestId: replaceRequestId ? null : prior?.requestId ?? null });
            const flowId = pending.flowId;
            replace(() => api.ui.DialogAlert({ title: 'Psst approval pending',
              message: 'Preparing the durable request. Close to pause; setup resumes the same request.',
              onConfirm: close }));
            async function retry(operation) {
              while (alive()) {
                try { return await operation(); }
                catch (error) { if (!error.retryable) throw error; await pause(controller.signal, Math.min(300000, Math.max(2000, error.retryAfterMs || 2000))); }
              }
              throw new Error('psst_setup_cancelled');
            }
            let result = await retry(() => helper.beginApproval({ ...options, ...(replaceRequestId ? { replaceRequestId } : {}) }));
            const requestId = result.requestId;
            if (!replaceRequestId && prior?.state === 'pending' && requestId !== prior.requestId) throw new Error('psst_request_changed');
            if (alive()) {
              updatePending({ directory, flowId, requestId });
              if (result.state === 'pending') replace(() => api.ui.DialogAlert({
                title: 'Psst approval pending',
                message: `Open ${new URL('/admin', brokerUrl).href}
Request ID: ${requestId}
Approve only the matching OpenCode request. Close to pause; setup resumes this same request.`,
                onConfirm: close }));
            }
            while (alive() && result.state === 'pending') {
              await pause(controller.signal);
              if (alive()) {
                result = await retry(() => helper.pollApproval(options));
                if (result.requestId !== requestId) throw new Error('psst_request_changed');
              }
            }
            if (!alive()) return;
            if (result.state !== 'approved') { toast(`Request ${result.state}. Run setup explicitly to request replacement.`, 'warning'); close(); api.ui.dialog.clear(); return; }
            await select({ directory, connectionFile: result.connectionFile, expectedRevision, signal: controller.signal, pendingFlowId: flowId });
            if (!alive()) return;
            close(); api.ui.dialog.clear();
            toast(process.env.PSST_CONFIG_FILE
              ? 'Approved installation saved. The explicit PSST_CONFIG_FILE override still takes precedence; restart without it to use the saved approval. Existing connections are unchanged.'
              : 'Approved installation saved; transport can reconnect. Automatic messaging is blocked on this classic host; /psst-status explains the missing capability. Manual receive is diagnostic/test-only.', 'warning');
          }
          if (prior && prior.state !== 'pending' && (prior.state !== 'approved' || selected?.connectionFile === prior.connectionFile)) {
            replace(() => api.ui.DialogConfirm({ title: 'Replace Psst authorization?',
              message: 'Request a new authorization? The current connection and unread messages remain unchanged until approval; existing sessions keep their connection.',
              onCancel: close, onConfirm: () => {
                // The native confirmation clears its dialog after this callback.
                transitioning = true; queueMicrotask(() => { transitioning = false; void enroll(prior.requestId).catch(failed); });
              } }));
          } else await enroll();
        } catch { failed(); }
        function failed() {
          if (!alive()) return;
          toast('Setup paused. Check the URL, private configuration and broker availability; retry setup to resume the same request. No credentials were replaced.', 'warning');
          cancel(false); api.ui.dialog.clear();
        }
      },
    }));
  }
  api.keymap.registerLayer({ commands: [{ name: 'psst.setup', title: 'Psst: setup broker connection',
    category: 'Psst', namespace: 'palette', slashName: 'psst-setup', run: start }],
    bindings: [{ key: 'ctrl+alt+p', cmd: 'psst.setup', desc: 'Set up Psst broker connection' }] });
}
