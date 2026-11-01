import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createNativeSetup } from '../src/native-setup.mjs';
import { readPending } from '../src/installation.mjs';
async function fixture(t, overrides={}) {
 const directory=mkdtempSync(join(tmpdir(),'psst-native-setup-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const stored=new Map(),calls=[],ctrl=new AbortController();let result={state:'pending',requestId:'same-request',approvalUrl:'https://fixture.invalid/admin'};
 const helper={readApprovalState:()=>null,beginApproval:async()=>{calls.push('begin');return result;},pollApproval:async()=>{calls.push('poll');return result;},...overrides};
 const options={directory,storage:{get:async k=>stored.get(k),set:async(k,v)=>stored.set(k,v)},verify:async id=>({id,projectID:'project',location:{directory},time:{created:1}}),connect:async()=>calls.push('connect'),status:()=>({connected:calls.includes('connect')}),signal:ctrl.signal,loadHelper:async()=>helper,select:async()=>calls.push('select'),pollMs:10};
 const setup=createNativeSetup(options);t.after(()=>setup.stop());const context={sessionID:'one',signal:new AbortController().signal};return{setup,options,calls,context,directory,ctrl,stored,setResult:r=>result=r};
}
test('URL setup never starts on load/status; approval is human action, result contains no private files',async t=>{
 const f=await fixture(t);await f.setup.resume();assert.deepEqual(f.calls,[]);await f.setup.invoke('broker_setup_status',{},f.context);assert.deepEqual(f.calls,[]);
 const r=await f.setup.invoke('broker_setup',{broker_url:'https://fixture.invalid'},f.context);assert.equal(r.request_id,'same-request');assert.equal(r.state,'pending');assert.equal(JSON.stringify(r).includes('connectionFile'),false);
 f.setResult({state:'approved',requestId:'same-request',connectionFile:'/private/token-not-output'});await delay(30);assert.ok(f.calls.includes('select'));assert.ok(f.calls.includes('connect'));
});
test('same pending setup cancellation retains request and never selects late approval',async t=>{
 const f=await fixture(t);await f.setup.invoke('broker_setup',{broker_url:'https://fixture.invalid'},f.context);await f.setup.invoke('broker_cancel_setup',{},f.context);f.setResult({state:'approved',requestId:'same-request',connectionFile:'/private'});await delay(30);assert.equal(f.calls.includes('select'),false);assert.equal(readPending(f.directory).paused,true);assert.equal(readPending(f.directory).requestId,'same-request');
});
test('second session cannot overwrite pending request, denial cannot silently create replacement',async t=>{
 const f=await fixture(t);await f.setup.invoke('broker_setup',{broker_url:'https://fixture.invalid'},f.context);await assert.rejects(()=>f.setup.invoke('broker_setup',{broker_url:'https://elsewhere.invalid'},{...f.context,sessionID:'two'}),/owner/);assert.equal(f.calls.filter(x=>x==='begin').length,1);
 const denied=await fixture(t,{readApprovalState:()=>({state:'denied',requestId:'old'})});const r=await denied.setup.invoke('broker_setup',{broker_url:'https://fixture.invalid'},denied.context);assert.equal(r.state,'denied');assert.equal(denied.calls.length,0);
});
test('setup shutdown drains unknown begin and preserves durable request, without selecting',async t=>{
 let release;const f=await fixture(t,{beginApproval:()=>new Promise(r=>release=r)});const call=f.setup.invoke('broker_setup',{broker_url:'https://fixture.invalid'},f.context);while(!release)await delay(0);const stop=f.setup.stop();release({state:'pending',requestId:'original'});await call;await stop;assert.equal(readPending(f.directory).requestId,'original');assert.equal(readPending(f.directory).paused,true);assert.equal(f.calls.includes('select'),false);
});
test('reloaded explicit pending flow resumes with GET only and exact native binding',async t=>{
 const f=await fixture(t);await f.setup.invoke('broker_setup',{broker_url:'https://fixture.invalid'},f.context);await f.setup.stop();const second=createNativeSetup(f.options);t.after(()=>second.stop());await second.resume();await delay(15);assert.equal(f.calls.filter(x=>x==='begin').length,1);assert.ok(f.calls.filter(x=>x==='poll').length>0);
});
test('unsafe URL rejected before any enrollment effect',async t=>{
 const f=await fixture(t);for(const url of ['http://fixture.invalid','https://secret@fixture.invalid','https://fixture.invalid/path'])await assert.rejects(()=>f.setup.invoke('broker_setup',{broker_url:url},f.context));assert.deepEqual(f.calls,[]);
});
test('caller cancellation during approval selection validation cannot commit or connect',async t=>{
 const f=await fixture(t);await f.setup.stop();let entered,release;const validating=new Promise(r=>entered=r);const options={...f.options,select:async({signal})=>{entered();await new Promise(r=>release=r);if(signal.aborted)throw new Error('selection_cancelled');f.calls.push('select');}};
 f.setResult({state:'approved',requestId:'same-request',connectionFile:'/private'});const setup=createNativeSetup(options);t.after(()=>setup.stop());const caller=new AbortController();const pending=setup.invoke('broker_setup',{broker_url:'https://fixture.invalid'},{...f.context,signal:caller.signal});await validating;caller.abort();release();await assert.rejects(()=>pending,/selection_cancelled/);assert.equal(f.calls.includes('select'),false);assert.equal(f.calls.includes('connect'),false);assert.equal(readPending(f.directory).paused,true);
});
test('owner native-session deletion fences background approval activation during async validation',async t=>{
 const f=await fixture(t);await f.setup.stop();let entered,release;const validating=new Promise(r=>entered=r);const options={...f.options,select:async({signal})=>{entered();await new Promise(r=>release=r);if(signal.aborted)throw new Error('owner_cancelled');f.calls.push('select');}};
 const setup=createNativeSetup(options);t.after(()=>setup.stop());await setup.invoke('broker_setup',{broker_url:'https://fixture.invalid'},f.context);f.setResult({state:'approved',requestId:'same-request',connectionFile:'/private'});await validating;setup.event({type:'session.deleted',data:{sessionID:'one'}});release();await delay(20);assert.equal(f.calls.includes('select'),false);assert.equal(f.calls.includes('connect'),false);assert.equal(readPending(f.directory).paused,true);
});
test('actual installation selector rechecks native binding after private-file validation',async t=>{
 const {selectInstallation,readSelection}=await import('../src/installation.mjs');const {writeFileSync}=await import('node:fs');const f=await fixture(t);const connectionFile=join(f.directory,'connection.json');writeFileSync(connectionFile,JSON.stringify({broker:{url:'https://fixture.invalid/',tokenFile:join(f.directory,'token')},stateDirectory:join(f.directory,'state')}),{mode:0o600});let checked=false;
 await assert.rejects(()=>selectInstallation({directory:f.directory,connectionFile,expectedRevision:null,verify:async()=>{checked=true;return false;}}),/binding_changed/);assert.equal(checked,true);assert.equal(readSelection(f.directory),null);
});

test('renamed namespace cannot resume or replace a pending request whose native owner is unavailable',async t=>{
 const {readFileSync}=await import('node:fs');const f=await fixture(t);await f.setup.invoke('broker_setup',{broker_url:'https://fixture.invalid'},f.context);await f.setup.stop();
 const before=readFileSync(join(f.directory,'pending.json'));f.stored.clear();f.calls.length=0;
 const second=createNativeSetup(f.options);t.after(()=>second.stop());await second.resume();
 assert.equal((await second.invoke('broker_setup_status',{},f.context)).state,'setup_owner_recovery_required');
 await assert.rejects(()=>second.invoke('broker_setup',{broker_url:'https://fixture.invalid'},f.context),/setup_owner_recovery_required/);
 assert.deepEqual(f.calls,[]);assert.deepEqual(readFileSync(join(f.directory,'pending.json')),before);
});
