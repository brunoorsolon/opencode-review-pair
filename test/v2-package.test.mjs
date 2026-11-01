import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const runtime='git+https://github.com/matuto-ai/opencode-broker-connector.git#81bab6924d0f7193b8b3f32318ea4cbc1d23a17f';

test('standalone V2 package pins the reviewed runtime without parent paths, classic entries or install hooks',()=>{
 const pkg=JSON.parse(readFileSync(join(root,'v2/package.json'))),lock=JSON.parse(readFileSync(join(root,'v2/package-lock.json')));
 assert.equal(pkg.name,'@matuto-ai/opencode-broker-connector-v2');assert.equal(pkg.private,true);assert.equal(pkg.license,'MIT');
 assert.deepEqual(pkg.exports,{'.':'./index.mjs'});assert.deepEqual(pkg.dependencies,{'@matuto-ai/opencode-broker-connector':runtime});assert.equal(pkg.scripts,undefined);
 assert.deepEqual(lock.packages[''].dependencies,pkg.dependencies);assert.equal(lock.packages['node_modules/@matuto-ai/opencode-broker-connector'].resolved,runtime);
 assert.equal(Object.keys(lock.packages).some(p=>p.includes('@opencode/cli')||p.includes('opencode-linux')),false);
 assert.equal(readFileSync(join(root,'v2/LICENSE'),'utf8'),readFileSync(join(root,'LICENSE'),'utf8'));
 assert.match(readFileSync(join(root,'v2/index.mjs'),'utf8'),/from '@matuto-ai\/opencode-broker-connector\/v2'/);
 assert.doesNotMatch(readFileSync(join(root,'v2/index.mjs'),'utf8'),/from ['"]\.\./);
});

test('extracted V2 package imports only its declared runtime dependency, with no repository sibling files',t=>{
 const dir=mkdtempSync(join(tmpdir(),'psst-v2-package-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const packed=spawnSync('npm',['pack','--json','--ignore-scripts','--pack-destination',dir,'--cache',join(dir,'cache')],{cwd:join(root,'v2'),encoding:'utf8'});assert.equal(packed.status,0,packed.stderr);
 const artifact=JSON.parse(packed.stdout)[0];assert.deepEqual(artifact.files.map(x=>x.path).sort(),['LICENSE','README.md','index.mjs','package.json']);
 const unpack=spawnSync('tar',['-xzf',join(dir,artifact.filename),'-C',dir],{encoding:'utf8'});assert.equal(unpack.status,0,unpack.stderr);
 const modules=join(dir,'package','node_modules','@matuto-ai');mkdirSync(modules,{recursive:true});symlinkSync(root,join(modules,'opencode-broker-connector'));
 // The dependency symlink is an explicit offline fixture, not native installer proof.
 const loaded=spawnSync(process.execPath,['--input-type=module','-e',"import p from './index.mjs';if(p.id!=='matuto.psst.v2'||typeof p.setup!=='function')throw Error('incorrect native entry');"],{cwd:join(dir,'package'),encoding:'utf8'});assert.equal(loaded.status,0,loaded.stderr);
});
