import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installSetupUI } from '../src/setup-ui.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t, overrides = {}) {
 const directory=mkdtempSync(join(tmpdir(),'psst-setup-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 let command, dialog, onClose, dispose;const calls=[],toasts=[];
 const api={lifecycle:{signal:new AbortController().signal,onDispose:fn=>dispose=fn},keymap:{registerLayer:layer=>command=layer.commands[0]},ui:{toast:x=>toasts.push(x),DialogPrompt:props=>({kind:'prompt',...props}),DialogConfirm:props=>({kind:'confirm',...props}),DialogAlert:props=>({kind:'alert',...props}),dialog:{replace(render,close){onClose?.();dialog=render();onClose=close;},clear(){onClose?.();dialog=null;onClose=null;}}}};
 const helper={readApprovalState:()=>null,beginApproval:async opts=>{calls.push(['begin',opts]);return {state:'pending',requestId:'request'};},pollApproval:async opts=>{calls.push(['poll',opts]);return {state:'approved',requestId:'request',connectionFile:'/private/connection.json'};},...overrides.helper};
 await installSetupUI(api,{directory,loadHelper:async()=>helper,pause:async()=>{},select:async opts=>calls.push(['select',opts]),...overrides});
 return {directory,api,calls,toasts,helper,open:()=>command.run(),dialog:()=>dialog,dispose:()=>dispose()};
}
test('native URL form never enrolls on load; own dialog transition does not cancel approval',async t=>{
 const f=await fixture(t);assert.equal(f.calls.length,0);f.open();assert.equal(f.dialog().kind,'prompt');
 await f.dialog().onConfirm('https://broker.example');assert.deepEqual(f.calls.map(x=>x[0]),['begin','poll','select']);
 assert.equal(f.calls[0][1].clientType,'opencode');assert.equal(f.calls[0][1].brokerUrl,'https://broker.example/');assert.equal(f.toasts.at(-1).variant,'warning');assert.match(f.toasts.at(-1).message,/Automatic messaging is blocked/);
});
test('close and repeated setup fence late approval without selecting another installation',async t=>{
 let release;const f=await fixture(t,{helper:{beginApproval:()=>new Promise(r=>release=r)}});f.open();const first=f.dialog().onConfirm('https://broker.example');await tick();
 f.api.ui.dialog.clear();f.open();release({state:'approved',connectionFile:'/private/old.json'});await first;
 assert.equal(f.calls.length,0);assert.equal(f.dialog().kind,'prompt');assert.equal(f.toasts.length,0);
});
test('duplicate submit creates only one operation and native disposal cancels late response',async t=>{
 let release,count=0;const f=await fixture(t,{helper:{beginApproval:()=>{count++;return new Promise(r=>release=r);}}});f.open();const prompt=f.dialog();const pending=prompt.onConfirm('https://broker.example');await tick();await prompt.onConfirm('https://broker.example');assert.equal(count,1);f.dispose();release({state:'approved',connectionFile:'/private/c.json'});await pending;assert.equal(f.calls.length,0);
});
test('explicit replacement confirms and survives native confirmation clear',async t=>{
 const f=await fixture(t,{helper:{readApprovalState:()=>({state:'approved',requestId:'prior',connectionFile:'/private/current.json'})}});writeFileSync(join(f.directory,'installation.json'),JSON.stringify({format:'psst-opencode-installation-v1',revision:'selected',connectionFile:'/private/current.json'}),{mode:0o600});f.open();await f.dialog().onConfirm('https://broker.example');assert.equal(f.dialog().kind,'confirm');assert.equal(f.calls.length,0);
 f.dialog().onConfirm();f.api.ui.dialog.clear();await tick();assert.equal(f.calls[0][1].replaceRequestId,'prior');assert.equal(f.calls.at(-1)[0],'select');
});
test('unsafe URL, denial and transient failures never expose details or select',async t=>{
 const f=await fixture(t);f.open();await f.dialog().onConfirm('https://user:secret@broker.example');assert.equal(f.calls.length,0);assert.ok(!JSON.stringify(f.toasts).includes('secret'));
 const denied=await fixture(t,{helper:{beginApproval:async()=>({state:'denied'})}});denied.open();await denied.dialog().onConfirm('https://broker.example');assert.equal(denied.calls.length,0);assert.match(denied.toasts[0].message,/denied/);
 const failed=await fixture(t,{helper:{beginApproval:async()=>{throw new Error('secret-token');}}});failed.open();await failed.dialog().onConfirm('https://broker.example');assert.equal(failed.calls.length,0);assert.ok(!JSON.stringify(failed.toasts).includes('secret-token'));
});
test('native setup honors retry backoff and retries the same explicit request',async t=>{
 let calls=0;const pauses=[];const f=await fixture(t,{pause:async(signal,ms)=>pauses.push(ms),helper:{beginApproval:async()=>{if(calls++===0)throw Object.assign(new Error('limited'),{retryable:true,retryAfterMs:60000});return {state:'approved',requestId:'same',connectionFile:'/private/c.json'};}}});
 f.open();await f.dialog().onConfirm('https://broker.example');assert.deepEqual(pauses,[60000]);assert.equal(calls,2);assert.equal(f.calls.at(-1)[0],'select');
});
test('poll returning another request cannot select the wrong approved installation',async t=>{
 const f=await fixture(t,{helper:{pollApproval:async()=>({state:'approved',requestId:'different',connectionFile:'/private/wrong.json'})}});f.open();await f.dialog().onConfirm('https://broker.example');assert.equal(f.calls.filter(x=>x[0]==='select').length,0);assert.equal(f.toasts.at(-1).variant,'warning');
});
test('cancelled approval not yet selected is resumed instead of forcing a new key',async t=>{
 const f=await fixture(t,{helper:{readApprovalState:()=>({state:'approved',requestId:'prior',connectionFile:'/private/candidate.json'}),beginApproval:async opts=>{assert.equal(opts.replaceRequestId,undefined);return {state:'approved',requestId:'prior',connectionFile:'/private/candidate.json'};}}});f.open();await f.dialog().onConfirm('https://broker.example');assert.equal(f.calls.at(-1)[0],'select');assert.equal(f.toasts.at(-1).variant,'warning');assert.match(f.toasts.at(-1).message,/Automatic messaging is blocked/);
});
test('explicit legacy override is disclosed rather than claiming a new active connection',async t=>{
 const old=process.env.PSST_CONFIG_FILE;process.env.PSST_CONFIG_FILE='/private/legacy.json';
 try {const f=await fixture(t);f.open();await f.dialog().onConfirm('https://broker.example');assert.match(f.toasts.at(-1).message,/override still takes precedence/);}finally{if(old===undefined)delete process.env.PSST_CONFIG_FILE;else process.env.PSST_CONFIG_FILE=old;}
});

test('pending native dialog displays exact request ID and broker approval page before polling',async t=>{
 let f;f=await fixture(t,{pause:async()=>{assert.match(f.dialog().message,/Request ID: request/);assert.match(f.dialog().message,/https:\/\/broker\.example\/admin/);}});
 f.open();await f.dialog().onConfirm('https://broker.example');
});
