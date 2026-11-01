import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tool } from '@opencode-ai/plugin';
import { setTimeout as delay } from 'node:timers/promises';
import { createNativePlugin } from '../src/native-plugin.mjs';
import { loadBrokerReference } from '../src/reference.mjs';
import { readConfig } from '../src/config.mjs';
const reference = await loadBrokerReference();
async function fixture(t, options={}) {
  const dir=mkdtempSync(join(tmpdir(),'psst-native-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let calls=[], registrations=0, closes=0;
  const native={directory:dir,worktree:dir,client:{session:{get:options.get ?? (async ({path})=>({data:{id:path.id,directory:dir}}))}}};
  const hooks=await createNativePlugin({native,tool,reference,config:{stateDirectory:join(dir,'state'),broker:{}},
    clientFactory:inbox=>({inbox}),
    adapterFactory:({client,binding,currentBinding})=>({
      tools:Object.fromEntries(reference.TOOL_DEFINITIONS.map(d=>[d.name,{execute:async(args,ctx)=>{calls.push(ctx.sessionID); return JSON.stringify({session:binding.sessionID,identity:client.inbox.identity.client_id,alive:!!await currentBinding()});}}])),
      async start(){registrations++;assert.ok(await currentBinding());},
      async stop(){closes++;client.inbox.close();},
    }),...options});
  t.after(()=>hooks.dispose());
  const context=id=>({sessionID:id,directory:dir,worktree:dir,messageID:'msg1',abort:new AbortController().signal});
  return {dir,hooks,native,context,calls,registrations:()=>registrations,closes:()=>closes};
}
test('normal plugin lazily binds existing session; parallel sessions never share identity',async t=>{
 const f=await fixture(t);
 assert.equal(f.registrations(),0);
 const run=id=>f.hooks.tool.broker_list_clients.execute({},f.context(id)).then(JSON.parse);
 const [a,b,c]=await Promise.all([run('existing-a'),run('existing-b'),run('existing-a')]);
 assert.equal(a.session,'existing-a');assert.equal(b.session,'existing-b');assert.equal(c.identity,a.identity);assert.notEqual(a.identity,b.identity);assert.equal(f.registrations(),2);
 await f.hooks.event({event:{type:'session.deleted',properties:{info:{id:'existing-a'}}}});assert.equal(f.closes(),1);
 const next=await run('existing-a');assert.equal(next.error.code,'invalid_configuration');
 await f.hooks.dispose();assert.equal(f.closes(),2);
 assert.equal((await run('existing-b')).error.code,'session_mismatch');
});
test('foreign directory, cancelled context and missing native context cannot register',async t=>{
 const f=await fixture(t),ctrl=new AbortController();ctrl.abort();
 for(const context of [undefined,{...f.context('x'),directory:'/tmp'},{...f.context('x'),abort:ctrl.signal}]) {
  assert.equal(JSON.parse(await f.hooks.tool.broker_receive.execute({},context)).error.code,'session_mismatch');
 }
 assert.equal(f.registrations(),0);
});
test('chat starts exact matching session without modifying user input',async t=>{
 const f=await fixture(t),output={message:{role:'user',sessionID:'root'}};
 await f.hooks['chat.message']({sessionID:'root'},output);await delay(0);assert.equal(f.registrations(),1);assert.deepEqual(output,{message:{role:'user',sessionID:'root'}});
 await f.hooks['chat.message']({sessionID:'wrong'},output);assert.equal(f.registrations(),1);
});
test('dispose aborts never-settling native session verification',async t=>{
 const f=await fixture(t,{get:()=>new Promise(()=>{})});
 const pending=f.hooks.tool.broker_receive.execute({},f.context('x'));await delay(10);
 await f.hooks.dispose();assert.equal(JSON.parse(await pending).error.code,'session_mismatch');assert.equal(f.registrations(),0);
});
test('config requires private file, HTTPS-only settings and no credential contents',t=>{
 const dir=mkdtempSync(join(tmpdir(),'psst-config-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'config.json'),value={broker:{url:'https://broker.example/',tokenFile:join(dir,'token')},stateDirectory:join(dir,'state')};
 writeFileSync(path,JSON.stringify(value),{mode:0o600});assert.deepEqual(readConfig(path),value);
 chmodSync(path,0o644);assert.throws(()=>readConfig(path));chmodSync(path,0o600);
 const link=join(dir,'link');symlinkSync(path,link);assert.throws(()=>readConfig(link));
 for(const patch of [{broker:{...value.broker,url:'http://127.0.0.1/'}},{broker:{...value.broker,token:'secret'}},{unknown:true}]){
 writeFileSync(path,JSON.stringify({...value,...patch}));assert.throws(()=>readConfig(path));
 }
});
test('standard enrollment bundle resolves token and state next to the private config',t=>{
 const dir=mkdtempSync(join(tmpdir(),'psst-bundle-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'connection.json'),bundle={format:'broker-client-bundle-v1',protocol_version:'1',broker_url:'https://broker.example/',token_file:'token',file_paths_relative_to:'connection_file_directory',authorization_header:'Authorization',authorization_scheme:'Bearer',insecure_development:false,allowed_client_types:['opencode'],scope:'psst'};
 writeFileSync(path,JSON.stringify(bundle),{mode:0o600});assert.deepEqual(readConfig(path),{broker:{url:bundle.broker_url,tokenFile:join(dir,'token')},stateDirectory:join(dir,'state')});
 for(const patch of [{allowed_client_types:['pi']},{token_file:'../other'},{insecure_development:true}]){writeFileSync(path,JSON.stringify({...bundle,...patch}));assert.throws(()=>readConfig(path));}
});
test('unreachable native SDK warm-up never delays ordinary user chat',async t=>{
 const f=await fixture(t,{get:()=>new Promise(()=>{})});const before=Date.now();
 await f.hooks['chat.message']({sessionID:'root'},{message:{role:'user',sessionID:'root'}});assert.ok(Date.now()-before<100);
 await f.hooks.dispose();assert.equal(f.registrations(),0);
});

 test('disconnected install registers local commands; explicit file connect/disconnect is session scoped',async t=>{
 const f=await fixture(t,{config:undefined,connectFile:async(path,options)=>{assert.equal(path,'/private/connection.json');assert.equal(options.clientType,'opencode');return {stateDirectory:join(f.dir,'state'),broker:{}};}});
 await f.hooks['chat.message']({sessionID:'a'},{message:{role:'user',sessionID:'a'}});await delay(0);assert.equal(f.registrations(),0);
 const config={};await f.hooks.config(config);assert.ok(config.command['psst-connect']);
 async function command(name,args='',id='a'){const out={parts:[{type:'text',text:'original template'}]};await f.hooks['command.execute.before']({command:name,arguments:args,sessionID:id},out);return out.parts[0].text;}
 assert.match(await command('psst-connect','/private/connection.json'),/automatic_blocked/);assert.equal(f.registrations(),1);
 assert.match(await command('psst-status','','b'),/"connected":false/);assert.match(await command('psst-disconnect'),/"connected":false/);
 assert.equal(f.closes(),1);await f.hooks['chat.message']({sessionID:'a'},{message:{role:'user',sessionID:'a'}});await delay(0);assert.equal(f.registrations(),1);
 });
test('disconnect cancels pending connect and concurrent connect cannot replace it',async t=>{
 let release,loaded=0;const f=await fixture(t,{config:undefined,connectFile:async()=>{loaded++;await new Promise(r=>release=r);return {stateDirectory:join(f.dir,'state'),broker:{}};}});
 const command=async name=>{const out={parts:[]};await f.hooks['command.execute.before']({command:name,arguments:'/private/file',sessionID:'a'},out);return out.parts[0].text;};
 const pending=command('psst-connect');await delay(0);assert.equal(loaded,1);
 assert.match(await command('psst-connect'),/psst_command_failed/);assert.equal(loaded,1);
 assert.match(await command('psst-disconnect'),/"connected":false/);release();assert.match(await pending,/psst_command_failed/);assert.equal(f.registrations(),0);
});

test('experimental delivery requires explicit opt-in and known native selection; change disconnects',async t=>{
 let loaded=0;const unknown=await fixture(t,{config:undefined,experimentalNativeDelivery:true,connectFile:async()=>{loaded++;throw new Error('must not read');}});
 let out={parts:[]};await unknown.hooks['command.execute.before']({command:'psst-connect',arguments:'/private/file',sessionID:'a'},out);assert.match(out.parts[0].text,/psst_command_failed/);assert.equal(loaded,0);
 const f=await fixture(t,{config:undefined,experimentalNativeDelivery:true,connectFile:async()=>({stateDirectory:join(f.dir,'state'),broker:{}})});
 f.native.client.session.get=async({path})=>({data:{id:path.id,directory:f.dir,agent:'plan',model:{providerID:'fixture',id:'fake',variant:'default'}}});
 out={parts:[]};await f.hooks['command.execute.before']({command:'psst-connect',arguments:'/private/file',sessionID:'a'},out);assert.match(out.parts[0].text,/experimental_test_only/);assert.match(out.parts[0].text,/"agent":"plan"/);
 await f.hooks.event({event:{type:'session.updated',properties:{info:{id:'a',agent:'build',model:{providerID:'fixture',id:'fake',variant:'default'}}}}});await delay(10);assert.equal(f.closes(),1);
});

test('enrolled credential expiry closes polling and reports re-pair requirement',async t=>{
 const f=await fixture(t,{config:undefined,connectFile:async()=>({stateDirectory:join(f.dir,'state'),broker:{},enrollment:{credentialId:'enrolled-fixture',expiresAt:new Date(Date.now()+150).toISOString()}})});
 const command=async name=>{const out={parts:[]};await f.hooks['command.execute.before']({command:name,arguments:'/private/file',sessionID:'a'},out);return out.parts[0].text;};
 assert.match(await command('psst-connect'),/"connected":true/);await delay(1100);assert.equal(f.closes(),1);
 const status=await command('psst-status');assert.match(status,/"connected":false/);assert.match(status,/credential_expired_repair_required/);
 await f.hooks['chat.message']({sessionID:'a'},{message:{role:'user',sessionID:'a'}});await delay(0);assert.equal(f.registrations(),1);
});
test('authorization failure closes the exact session and never silently re-registers',async t=>{
 let diagnostic,closes=0;const f=await fixture(t,{config:undefined,connectFile:async()=>({stateDirectory:join(f.dir,'state'),broker:{}}),adapterFactory:({client,onDiagnostic})=>{diagnostic=onDiagnostic;return {tools:{},async start(){},async stop(){closes++;client.inbox.close();}};}});
 const command=async name=>{const out={parts:[]};await f.hooks['command.execute.before']({command:name,arguments:'/private/file',sessionID:'a'},out);return out.parts[0].text;};
 assert.match(await command('psst-connect'),/"connected":true/);diagnostic({code:'unauthenticated'});await delay(10);assert.equal(closes,1);assert.match(await command('psst-status'),/credential_unusable_reconnect_required/);
});

test('status exposes only its own ready transport identity, never installation credential as address',async t=>{
 const f=await fixture(t);const command=async id=>{const output={parts:[]};await f.hooks['command.execute.before']({command:'psst-status',sessionID:id,arguments:''},output);return JSON.parse(output.parts[0].text.split('\n').slice(1).join('\n'));};
 const before=await command('a');assert.equal(before.connected,false);assert.equal(before.client_id,null);assert.equal(before.ready,false);assert.equal(before.mode,'automatic_required');
 const active=JSON.parse(await f.hooks.tool.broker_list_clients.execute({},f.context('a')));
 const status=await command('a');assert.equal(status.connected,true);assert.equal(status.client_id,active.identity);assert.equal(status.identity_scope,'native_session');
 assert.equal(status.ready,false);assert.equal(status.delivery,'automatic_blocked');assert.equal(status.credential_id,null);
 const other=await command('b');assert.equal(other.client_id,null);assert.equal(other.connected,false);
});
