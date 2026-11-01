import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const binary=process.env.OPENCODE_V2_BINARY,spec=process.env.PSST_V2_PACKAGE_SPEC;
test('official V2 plugin manager installs pinned standalone Git package and preserves global configuration',
 {skip:!binary||!spec,timeout:180000},t=>{
 assert.match(spec,/^github:matuto-ai\/opencode-broker-connector#[a-f0-9]{40}::path:v2$/,'installer proof requires an immutable public wrapper commit');
 const dir=mkdtempSync(join(tmpdir(),'psst-v2-installer-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const configDir=join(dir,'config','opencode');mkdirSync(configDir,{recursive:true});mkdirSync(join(dir,'project'));mkdirSync(join(dir,'home'));
 const configFile=join(configDir,'opencode.json');writeFileSync(configFile,JSON.stringify({plugins:['-fixture.disabled']}));
 // Never inherit user auth/config, Git credentials, provider env or host paths.
 const env={PATH:process.env.PATH,HOME:join(dir,'home'),XDG_CONFIG_HOME:join(dir,'config'),XDG_DATA_HOME:join(dir,'data'),XDG_CACHE_HOME:join(dir,'cache'),XDG_STATE_HOME:join(dir,'state'),GIT_TERMINAL_PROMPT:'0',GIT_SSH_COMMAND:'false'};
 const version=spawnSync(binary,['--version'],{cwd:join(dir,'project'),env,encoding:'utf8',timeout:10000});assert.equal(version.status,0,version.stderr);assert.equal(version.stdout.trim(),'2.2.5');
 for(let i=0;i<2;i++){
  const installed=spawnSync(binary,['plugin','add',spec],{cwd:join(dir,'project'),env,encoding:'utf8',timeout:75000,maxBuffer:1024*1024});assert.equal(installed.status,0,installed.stderr);
  const config=JSON.parse(readFileSync(configFile,'utf8'));assert.ok(config.plugins.includes('-fixture.disabled'));assert.equal(config.plugins.filter(p=>(typeof p==='string'?p:p.package)===spec).length,1);
  // Exact 2.2.5 Npm cache contract: inspect the selected package, not a nested
  // wrapper accidentally present inside a wrongly selected classic root package.
  const cache=join(dir,'cache','opencode','npm','git-opencode-broker-connector-'+createHash('sha256').update(spec).digest('hex').slice(0,12));
  const generations=readdirSync(cache).filter(x=>/^\d+$/.test(x)).sort((a,b)=>Number(a)-Number(b));assert.ok(generations.length>0&&generations.length<=2);
  const generation=join(cache,generations.at(-1)),name='@matuto-ai/opencode-broker-connector-v2',location=join(generation,'node_modules',name);
  const manifest=JSON.parse(readFileSync(join(location,'package.json'),'utf8'));assert.equal(manifest.name,name);assert.deepEqual(manifest.exports,{'.':'./index.mjs'});
  assert.deepEqual(manifest.dependencies,{'@matuto-ai/opencode-broker-connector':'git+https://github.com/matuto-ai/opencode-broker-connector.git#81bab6924d0f7193b8b3f32318ea4cbc1d23a17f'});
  assert.match(readFileSync(join(location,'index.mjs'),'utf8'),/from '@matuto-ai\/opencode-broker-connector\/v2'/);
  const lock=JSON.parse(readFileSync(join(generation,'package-lock.json'),'utf8'));assert.deepEqual(Object.keys(lock.packages[''].dependencies),[name]);
  assert.ok(lock.packages['node_modules/'+name].resolved.includes('#'+spec.split('#')[1]),'native installer must preserve exact commit and subdirectory');
  const imported=spawnSync(process.execPath,['--input-type=module','-e',`import p from ${JSON.stringify(pathToFileURL(join(location,'index.mjs')).href)};if(p.id!=='matuto.psst.v2'||typeof p.setup!=='function')throw Error('wrong native entry');`],{cwd:join(dir,'project'),env,encoding:'utf8',timeout:10000});assert.equal(imported.status,0,imported.stderr);
  assert.equal(existsSync(join(configDir,'cli.json')),false,'server-only wrapper must not install a classic TUI entry');
 }
});
