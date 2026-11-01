import { canonical } from '../vendor/broker/src/protocol.mjs';
import { loadApprovalHelper } from './approval-helper.mjs';
import { installationDirectory, readSelection, readPending, savePending, updatePending, selectInstallation } from './installation.mjs';
import { withV2Lock } from './v2-lock.mjs';
import { createToolScope } from './tool-scope.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const publicState = value => ({ state: value?.state ?? 'setup_needed',
  ...(value?.requestId ? { request_id: value.requestId } : {}),
  ...(value?.approvalUrl ? { approval_url: value.approvalUrl } : {}),
  ...(value?.requestExpiresAt ? { request_expires_at: value.requestExpiresAt } : {}) });
export const V2_SETUP_TOOLS = [
  { name: 'broker_setup', description: 'Explicit user-requested URL-only Psst setup. Provide only the HTTPS broker URL. Creates or resumes one private request for human approval in the broker admin UI. Never call on startup or replace an existing denied/expired request automatically.',
    input: { type: 'object', properties: { broker_url: { type: 'string', maxLength: 2048 } }, required: ['broker_url'], additionalProperties: false } },
  { name: 'broker_setup_status', description: 'Read public Psst setup/connection status. Does not create approval requests or disclose credentials/private files.',
    input: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'broker_cancel_setup', description: 'Pause this session\'s local pending Psst setup. Preserves the prior authorization and durable request; does not revoke credentials.',
    input: { type: 'object', properties: {}, required: [], additionalProperties: false } },
];

/** One explicit URL flow per installation; subsequent continuation is GET-only.
 * Helper writes are awaited/drained even after host cancellation: the durable
 * original request must be reconciled rather than recreated.
 */
export function createV2Setup({ storage, verify, connect, status, signal, directory = installationDirectory(),
  loadHelper = loadApprovalHelper, select = selectInstallation, pollMs = 2000 }) {
  if (!Number.isSafeInteger(pollMs) || pollMs < 10) throw new Error('setup_interval_invalid');
  const scope = createToolScope(), lifetime = new AbortController();
  let running, owner, ownerController = new AbortController(), beginning=false, last={state:'setup_needed'}, stopped=false;
  const alive = () => !stopped && !signal.aborted && !lifetime.signal.aborted;
  const binding = info => canonical({ id: info.id, projectID: info.projectID, location: info.location, created: info.time.created });
  const bound = async id => { if (!alive() || owner?.sessionID === id && ownerController.signal.aborted) return false; const info = await verify(id); return !!info && (!owner?.binding || owner.sessionID !== id || binding(info) === owner.binding); };
  async function pauseOwned() {
    if (!owner) return;
    const pending=readPending(directory);
    if (pending?.flowId===owner.flowId) updatePending({directory,flowId:owner.flowId,paused:true});
  }
  async function finish(result, pending, sessionID, operationSignal) {
    if (!await bound(sessionID)) return;
    if (operationSignal?.aborted) { await pauseOwned(); return; }
    const activePending = readPending(directory);
    if (!activePending || activePending.paused || activePending.flowId !== pending.flowId) return;
    if (result.requestId!==pending.requestId) throw new Error('approval_request_mismatch');
    last=publicState(result);
    if (result.state==='approved') {
      try { await select({directory,connectionFile:result.connectionFile,expectedRevision:pending.expectedRevision,pendingFlowId:pending.flowId,verify:()=>bound(sessionID),signal:AbortSignal.any([signal,lifetime.signal,ownerController.signal,...(operationSignal ? [operationSignal] : [])])}); }
      finally { if (operationSignal?.aborted || ownerController.signal.aborted) await pauseOwned(); }
      if (!operationSignal?.aborted && await bound(sessionID)) await connect(sessionID);
    } else if (result.state!=='pending') updatePending({directory,flowId:pending.flowId,paused:true});
  }
  function watch(pending, sessionID) {
    if (running) return;
    running=(async()=>{
      const helper=await loadHelper();
      while(await bound(sessionID)) {
        const current=readPending(directory);
        if(!current||current.flowId!==pending.flowId||current.paused)return;
        const options={directory,brokerUrl:current.brokerUrl,clientType:'opencode'};
        let waitMs = pollMs;
        try {
          const result=await helper.pollApproval(options); // never begin/create here
          if(!await bound(sessionID))return;
          await finish(result,current,sessionID);
          if(result.state!=='pending')return;
        } catch(error) { if(!error.retryable){last={state:'setup_blocked'};return;} waitMs=Math.min(300000,Math.max(pollMs,error.retryAfterMs||pollMs)); }
        await delay(waitMs,undefined,{signal:AbortSignal.any([signal,lifetime.signal])}).catch(()=>{});
      }
    })().catch(()=>{last={state:'setup_blocked'};}).finally(()=>{running=null;});
  }
  async function invoke(name,args,context) {
    return scope.run(async operationSignal=>{
      if(!(context?.signal instanceof AbortSignal)||context.signal.aborted||!await bound(context.sessionID))throw new Error('session_mismatch');
      if(name==='broker_cancel_setup') {
        if(owner?.sessionID===context.sessionID) { await pauseOwned(); last={...last,state:'paused'}; }
        return {...last,...status(context.sessionID)};
      }
      if(name==='broker_setup_status') return {...last,...status(context.sessionID)};
      if(name!=='broker_setup'||!args||Object.keys(args).join(',')!=='broker_url')throw new Error('invalid_configuration');
      const url=new URL(args.broker_url);
      if(typeof args.broker_url!=='string'||args.broker_url.length>2048||/[\x00-\x20\x7f]/.test(args.broker_url)
        ||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('https_origin_required');
      if(beginning||running||owner&&owner.sessionID!==context.sessionID)throw new Error('setup_owner_conflict');
      beginning=true;
      try { return await withV2Lock(directory, 'setup', async () => {
      const priorOwner = await storage.get('psst-v2-setup-owner');
      const activePending = readPending(directory);
      if (activePending && !activePending.paused && priorOwner?.flowId === activePending.flowId && priorOwner.sessionID !== context.sessionID) throw new Error('setup_owner_conflict');
      const helper=await loadHelper();
      const options={directory,brokerUrl:url.href,clientType:'opencode'};
      const previous=helper.readApprovalState(options);
      if(previous&&previous.state!=='pending')return {...publicState(previous),...status(context.sessionID),replacement_requires_explicit_setup_repair:true};
      const selected=readSelection(directory);
      const pending=savePending({directory,brokerUrl:url.href,expectedRevision:selected?.revision??null,requestId:previous?.requestId??null});
      owner={flowId:pending.flowId,sessionID:context.sessionID,binding:binding(await verify(context.sessionID))};
      ownerController = new AbortController();
      await storage.set('psst-v2-setup-owner',owner);
      // Abort before begin means definitely no host request. After begin may be
      // ambiguous and must retain the helper's private ID and candidate token.
      if(operationSignal.aborted||!await bound(context.sessionID)){await pauseOwned();throw new Error('setup_cancelled');}
      let result;
      try { result=await helper.beginApproval(options); }
      catch(error) {
        const saved=helper.readApprovalState(options);
        if(saved?.requestId) { updatePending({directory,flowId:pending.flowId,requestId:saved.requestId}); last=publicState(saved);
          if(error.retryable && !operationSignal.aborted && await bound(context.sessionID)) watch({...pending,requestId:saved.requestId},context.sessionID);
          else if(operationSignal.aborted || !await bound(context.sessionID)) await pauseOwned();
        }
        throw error;
      }
      if(previous?.requestId&&result.requestId!==previous.requestId)throw new Error('approval_request_mismatch');
      updatePending({directory,flowId:pending.flowId,requestId:result.requestId});
      const current={...pending,requestId:result.requestId};
      if(operationSignal.aborted||!await bound(context.sessionID)){await pauseOwned();return{state:'paused',request_id:result.requestId};}
      await finish(result,current,context.sessionID,operationSignal);
      if(result.state==='pending')watch(current,context.sessionID);
      return {...publicState(result),...status(context.sessionID)};
      }); } finally { beginning=false; }
    },context.signal);
  }
  async function resume() {
    // Explicit durable requests only; never infer a request from an empty install.
    const saved=await storage.get('psst-v2-setup-owner');
    if(!saved||typeof saved.sessionID!=='string')return;
    const pending=readPending(directory);
    if(!pending||pending.paused||pending.flowId!==saved.flowId||!pending.requestId)return;
    owner=saved;if(await bound(saved.sessionID))watch(pending,saved.sessionID);
  }
  return {invoke,resume,event(event){
    if (owner?.sessionID === event?.data?.sessionID && ['session.deleted','session.archived','session.moved'].includes(event.type)) {
      ownerController.abort(); void pauseOwned().catch(()=>{});
    }
  },async stop(){stopped=true;lifetime.abort();await scope.close();await running;}};
}
