import { randomUUID, createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { canonical } from '../vendor/broker/src/protocol.mjs';
import { createOpenCodeAdapter } from './opencode-adapter.mjs';
import { createV2Delivery, v2SessionBinding, V2_HOST_VERSION } from './v2-delivery.mjs';
import { openV2Inbox } from './v2-inbox.mjs';
import { withV2Lock } from './v2-lock.mjs';
import { installationDirectory } from './installation.mjs';
import { createToolScope } from './tool-scope.mjs';
import { createV2Setup, V2_SETUP_TOOLS } from './v2-setup.mjs';

const validID = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,256}$/.test(value);
const display = value => JSON.stringify(value).replace(/[\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
  char => `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`);

/** Optional V2-only setup. Never migrates, attaches to, or upgrades a classic host.
 * No receive/ack fallback is registered: incoming delivery is native automatic.
 */
export async function setupV2Plugin({ ctx, reference, tool, loadSettings, clientFactory,
  setupOptions = {}, setupEnabled = true, deliveryFactory = createV2Delivery, adapterFactory = createOpenCodeAdapter, onDiagnostic = () => {} }) {
  if (ctx?.app?.version !== V2_HOST_VERSION || ['get', 'synthetic', 'context', 'hook'].some(k => typeof ctx?.session?.[k] !== 'function')
    || typeof ctx?.storage?.get !== 'function' || typeof ctx?.storage?.set !== 'function' || typeof ctx?.storage?.scan !== 'function'
    || typeof ctx?.tool?.transform !== 'function' || typeof ctx?.event?.subscribe !== 'function') throw new Error('psst_v2_host_capability_unavailable');
  const directory = realpathSync(ctx.location.directory);
  const hostID = await withV2Lock(setupOptions.directory ?? installationDirectory(), 'host-anchor', async () => {
    let value = await ctx.storage.get('psst-v2-host-id');
    if (value === undefined) { value = randomUUID(); await ctx.storage.set('psst-v2-host-id', value); }
    return value;
  });
  const registryPrefix = 'psst-v2-session:' + createHash('sha256').update(canonical({ directory, workspaceID: ctx.location.workspaceID ?? null })).digest('hex') + ':';
  if (!validID(hostID)) throw new Error('psst_v2_host_binding_unavailable');
  const sessions = new Map(), blocked = new Set(), controller = new AbortController(), registrations = [], toolScope = createToolScope();
  let disposed = false, events, setup;
  const diagnostic = code => { try { onDiagnostic({ code }); } catch {} };
  async function getInfo(sessionID, signal = controller.signal) {
    if (!validID(sessionID) || signal.aborted || disposed) throw new Error('v2_session_mismatch');
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(2000)]);
    let listener;
    const info = await Promise.race([
      ctx.session.get({ sessionID }, { signal: bounded }),
      new Promise((_, reject) => { listener = () => reject(new Error('v2_session_unavailable'));
        if (bounded.aborted) listener(); else bounded.addEventListener('abort', listener, { once: true }); }),
    ]).finally(() => bounded.removeEventListener('abort', listener));
    if (bounded.aborted || disposed || info?.id !== sessionID || info.parentID || info.time?.archived
      || realpathSync(info.location.directory) !== directory || info.location.workspaceID !== ctx.location.workspaceID) throw new Error('v2_session_mismatch');
    return info;
  }
  async function close(sessionID) {
    const state = sessions.get(sessionID);
    if (!state) return;
    if (state.closing) return state.closing;
    state.controller.abort();
    state.closing = (async () => {
      await state.starting?.catch(() => {});
      await state.delivery?.stop();
      await state.adapter?.stop();
      if (!state.adapter) state.inbox?.close();
      if (sessions.get(sessionID) === state) sessions.delete(sessionID);
    })();
    return state.closing;
  }
  async function connect(sessionID) {
    if (disposed || blocked.has(sessionID)) throw new Error('v2_plugin_closed');
    let state = sessions.get(sessionID);
    if (state) { await state.starting; if (state.closing) throw new Error('v2_session_closing'); return state; }
    if (sessions.size >= 64) throw new Error('v2_session_limit');
    state = { controller: new AbortController(), lifetime: Symbol('v2 host session') };
    sessions.set(sessionID, state);
    state.starting = (async () => {
      const info = await getInfo(sessionID, state.controller.signal);
      const nativeBinding = v2SessionBinding(info, hostID);
      const settings = await loadSettings();
      if (!settings || disposed || state.controller.signal.aborted) throw new Error('psst_connect_required');
      const valid = async () => {
        if (disposed || state.controller.signal.aborted || sessions.get(sessionID) !== state
          || settings.enrollment && Date.parse(settings.enrollment.expiresAt) <= Date.now()) return null;
        try {
          const now = await getInfo(sessionID, state.controller.signal);
          return canonical(v2SessionBinding(now, hostID)) === canonical(nativeBinding) ? now : null;
        } catch { return null; }
      };
      state.inbox = openV2Inbox({ reference, settings, binding: nativeBinding });
      await ctx.storage.set(registryPrefix + sessionID, { sessionID, binding: nativeBinding, enabled: true });
      if (!await valid()) throw new Error('v2_session_mismatch');
      state.client = clientFactory ? clientFactory(state.inbox) : new reference.BrokerClient({ ...settings.broker, inbox: state.inbox });
      const binding = { sessionID, directory, worktree: directory, lifetime: state.lifetime, signal: state.controller.signal };
      state.adapter = adapterFactory({ reference, tool, client: state.client, binding,
        currentBinding: async () => await valid() ? binding : null, closeSessionOnStop: false,
        operationContext: context => ({ operationId: canonical({ hostID, sessionID, messageID: context.messageID, callID: context.callID }), operationStartedAt: context.operationStartedAt }),
        onDiagnostic: entry => {
          diagnostic(entry.code);
          if (['unauthenticated', 'forbidden'].includes(entry.code)) { blocked.add(sessionID); queueMicrotask(() => void close(sessionID).catch(() => {})); }
        } });
      await state.adapter.start({ name: settings.name ?? 'OpenCode V2', model: { provider: null, id: null, source: 'unknown' }, project: null });
      if (!await valid()) throw new Error('v2_session_mismatch');
      state.delivery = deliveryFactory({ session: ctx.session, inbox: state.inbox, binding: nativeBinding,
        signal: state.controller.signal, verify: valid, onDiagnostic: entry => { state.deliveryStatus = entry.code; diagnostic(entry.code); } });
      state.delivery.start();
      return state;
    })();
    try { return await state.starting; }
    catch (error) {
      state.controller.abort(); await state.delivery?.stop(); await state.adapter?.stop();
      if (!state.adapter) state.inbox?.close();
      if (sessions.get(sessionID) === state) sessions.delete(sessionID);
      throw error;
    }
  }
  const catalog = reference.TOOL_DEFINITIONS.filter(def => def.name !== 'broker_receive');
  async function dispose() {
    if (disposed) return;
    disposed = true; controller.abort();
    for (const state of sessions.values()) state.controller.abort();
    await setup?.stop();
    await toolScope.close();
    await Promise.all([...sessions.keys()].map(close));
    await Promise.all(registrations.map(item => item.dispose()));
    await events?.catch(() => {});
  }
  const status = sessionID => { const state = sessions.get(sessionID); return { host_version: V2_HOST_VERSION, mode: 'native_automatic', connected: !!state?.delivery, client_id: state?.client?.inbox?.identity?.client_id ?? null, last_delivery_status: state?.deliveryStatus ?? null, receipt_semantics: 'durable_native_admission_not_model_read' }; };
  if (setupEnabled) setup = createV2Setup({ storage: ctx.storage, verify: async id => { try { return await getInfo(id); } catch { return null; } }, connect, status, signal: controller.signal, ...setupOptions });
  try {
    registrations.push(await ctx.tool.transform(editor => {
      // Preflight the entire catalog before mutating the host editor.
      for (const definition of [...(setup ? V2_SETUP_TOOLS : []), ...catalog]) if (editor.get(definition.name)) throw new Error('psst_v2_tool_conflict');
      for (const definition of setup ? V2_SETUP_TOOLS : []) {
        if (editor.get(definition.name)) throw new Error('psst_v2_tool_conflict');
        editor.add({ ...definition, async execute(args, context) {
          try { return { content: display(await setup.invoke(definition.name, args, context)) }; }
          catch { return { content: display({ state: 'setup_blocked', next_step: 'Check setup status; do not paste credentials or automatically replace the request.' }) }; }
        } });
      }
      for (const definition of catalog) {
        if (editor.get(definition.name)) throw new Error('psst_v2_tool_conflict');
        editor.add({ name: definition.name, description: definition.description, input: definition.inputSchema,
          async execute(args, context) {
            return toolScope.run(async operationSignal => {
            try {
              if (!(context?.signal instanceof AbortSignal) || context.signal.aborted || !validID(context.messageID) || !validID(context.id)) throw new Error('v2_session_mismatch');
              const state = await connect(context.sessionID);
              let operationStartedAt;
              if (['broker_send', 'broker_resend'].includes(definition.name)) {
                const bounded = AbortSignal.any([context.signal, operationSignal, controller.signal, AbortSignal.timeout(2000)]);
                let listener;
                const messages = await Promise.race([ctx.session.context({ sessionID: context.sessionID }, { signal: bounded }),
                  new Promise((_, reject) => { listener = () => reject(new Error('v2_context_unavailable')); if (bounded.aborted) listener(); else bounded.addEventListener('abort', listener, { once: true }); })
                ]).finally(() => bounded.removeEventListener('abort', listener));
                const message = messages.find(item => item.id === context.messageID && item.type === 'assistant');
                const call = message?.content?.find(item => item.type === 'tool' && item.id === context.id && item.name === definition.name);
                operationStartedAt = call?.time?.created;
                if (!Number.isSafeInteger(operationStartedAt) || operationStartedAt <= 0) throw new Error('v2_original_tool_timestamp_unavailable');
              }
              const content = await state.adapter.tools[definition.name].execute(args, { sessionID: context.sessionID,
                messageID: context.messageID, callID: context.id, ...(operationStartedAt ? { operationStartedAt } : {}), directory, worktree: directory, abort: AbortSignal.any([context.signal, operationSignal, controller.signal]) });
              return { content };
            } catch { return { content: display({ error: { code: 'session_mismatch', effect: 'unknown' } }) }; }
            }, context?.signal).catch(() => ({ content: display({ error: { code: 'session_mismatch', effect: 'unknown' } }) }));
          } });
      }
    }));
    // Prompt observation only, no mutation of human draft, selection or prompt.
    registrations.push(await ctx.session.hook('prompt', event => { void connect(event.sessionID).catch(() => diagnostic('v2_connection_unavailable')); }));
    events = (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (disposed) break;
        if (event.type === 'location.shutdown' && event.location?.directory === directory) { void dispose(); break; }
        const sessionID = event.data?.sessionID;
        setup?.event(event);
        const state = sessions.get(sessionID);
        state?.delivery?.event(event);
        if (['session.deleted', 'session.archived', 'session.moved'].includes(event.type)) {
          blocked.add(sessionID);
          if (validID(sessionID)) await ctx.storage.set(registryPrefix + sessionID, { sessionID, enabled: false });
          await close(sessionID);
        }
        if (event.type === 'session.created') void connect(sessionID).catch(() => diagnostic('v2_connection_unavailable'));
      }
    })().catch(() => { if (!disposed) { diagnostic('v2_event_stream_unavailable'); void dispose(); } });
    let cursor, restoreCount = 0;
    do {
      const saved = await ctx.storage.scan({ prefix: registryPrefix, limit: 64, ...(cursor ? { after: cursor } : {}) });
      for (const entry of saved.entries) {
        const record = entry.value;
        if (record?.enabled === true && validID(record.sessionID) && restoreCount < 64) { restoreCount++; void connect(record.sessionID).catch(() => diagnostic('v2_restore_unavailable')); }
        else if (validID(record?.sessionID) && record?.enabled === false) blocked.add(record.sessionID);
      }
      cursor = saved.next;
    } while (cursor && restoreCount < 64 && !disposed);
    void setup?.resume().catch(() => diagnostic('v2_setup_restore_unavailable'));
    return { dispose, connect, status };
  } catch (error) { await dispose(); throw error; }
}
