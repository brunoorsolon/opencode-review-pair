import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nativeSessionBinding } from '../src/native-delivery.mjs';
import { openNativeInbox } from '../src/native-inbox.mjs';
import { recoverHostAnchor, assertExistingBinding } from '../src/identity-recovery.mjs';
import { loadBrokerReference } from '../src/reference.mjs';
const reference=await loadBrokerReference();
function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'psst-identity-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const stored=new Map(),settings={stateDirectory:join(directory,'state'),broker:{url:'https://fixture.invalid/'}};
 const info=id=>({id,projectID:'project',location:{directory},time:{created:1}});
 const options={settings,directory,storage:{get:async k=>stored.get(k),set:async(k,v)=>stored.set(k,v)},session:{get:async({sessionID})=>info(sessionID)}};
 const add=(sessionID,hostID)=>{const binding=nativeSessionBinding(info(sessionID),hostID),inbox=openNativeInbox({reference,settings,binding}),identity=inbox.identity,path=inbox.directory;inbox.close();return{binding,identity,path};};
 return{directory,stored,settings,info,options,add};
}
const absent=id=>Object.assign(new Error('missing'),{_tag:'SessionNotFoundError',sessionID:id});

test('fresh namespace creates one anchor; existing native private files are read without rewriting',async t=>{
 const f=fixture(t),first=await recoverHostAnchor(f.options);assert.equal(await recoverHostAnchor(f.options),first);
 const old=f.add('one',first),snapshot=Object.fromEntries(readdirSync(old.path).map(name=>[name,readFileSync(join(old.path,name))]));
 f.stored.clear();assert.equal(await recoverHostAnchor(f.options),first);
 for(const[name,bytes]of Object.entries(snapshot))assert.deepEqual(readFileSync(join(old.path,name)),bytes);
 const inbox=openNativeInbox({reference,settings:f.settings,binding:old.binding});assert.deepEqual(inbox.identity,old.identity);inbox.close();
});

test('shared installation keeps unrelated native host manifests without blocking a saved or uniquely proven anchor',async t=>{
 const f=fixture(t),own=f.add('own','host-own'),foreign=f.add('foreign','host-foreign');
 f.options.session.get=async({sessionID})=>{if(sessionID==='foreign')throw absent(sessionID);return f.info(sessionID);};
 assert.equal(await recoverHostAnchor(f.options),'host-own');
 f.options.session.get=async()=>{throw new Error('must not probe saved anchor');};
 assert.equal(await recoverHostAnchor(f.options),'host-own');
 assertExistingBinding(f.settings,own.binding);assert.deepEqual(JSON.parse(readFileSync(join(foreign.path,'binding.json'))).identity,foreign.identity);
});

test('ambiguous, unproven and failed native ownership never mint a replacement host or inbox',async t=>{
 for(const mode of ['ambiguous','absent','unknown','changed']){
  const f=fixture(t);f.add('one','host-one');f.add('two','host-two');const names=readdirSync(f.settings.stateDirectory);
  if(mode==='absent')f.options.session.get=async({sessionID})=>{throw absent(sessionID);};
  if(mode==='unknown')f.options.session.get=async()=>{throw new Error('network incomplete');};
  if(mode==='changed')f.options.session.get=async({sessionID})=>({...f.info(sessionID),time:{created:2}});
  await assert.rejects(()=>recoverHostAnchor(f.options),/identity_recovery_/);assert.equal(f.stored.size,0);assert.deepEqual(readdirSync(f.settings.stateDirectory),names);
 }
});

test('known same-session binding conflict and corrupt private manifests remain fail-closed',async t=>{
 const f=fixture(t),old=f.add('one','host-one');f.add('one','host-two');assert.throws(()=>assertExistingBinding(f.settings,old.binding),/conflict/);
 writeFileSync(join(old.path,'binding.json'),'{');await assert.rejects(()=>recoverHostAnchor(f.options));assert.equal(f.stored.size,0);assert.equal(readFileSync(join(old.path,'binding.json'),'utf8'),'{');
});

test('migration proofs are bounded even when the public API ignores its signal',async t=>{
 const f=fixture(t);for(let i=0;i<12;i++)f.add('session-'+i,'host');let calls=0;
 f.options.session.get=()=>{calls++;return new Promise(()=>{});};const keepAlive=setInterval(()=>{},1000),start=Date.now();
 try{await assert.rejects(()=>recoverHostAnchor(f.options),/incomplete/);}finally{clearInterval(keepAlive);}
 assert.equal(calls,4);assert.ok(Date.now()-start<4000);assert.equal(f.stored.size,0);
});


test('unbound classic journals block fresh identity allocation without altering bytes or an existing proven anchor',async t=>{
 const f=fixture(t),legacy=join(f.settings.stateDirectory,'opencode-old-run');mkdirSync(legacy,{recursive:true,mode:0o700});
 const file=join(legacy,'inbox.sqlite');writeFileSync(file,'unread private journal',{mode:0o600});
 await assert.rejects(()=>recoverHostAnchor(f.options),/identity_legacy_migration_required/);assert.equal(f.stored.size,0);assert.equal(readFileSync(file,'utf8'),'unread private journal');
 f.stored.set('psst-v2-host-id','already-proven');assert.equal(await recoverHostAnchor(f.options),'already-proven');
});
