import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryCapability } from '../src/capabilities.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('production requires automatic delivery, with no silent manual or snapshot fallback',()=>{
 for(const experimental of [false,true]){
  const result=deliveryCapability({}, {experimental});
  assert.equal(result.mode,'automatic_required');assert.equal(result.ready,false);assert.equal(result.automatic_receive,false);
  assert.equal(result.blocker,'classic_atomic_admission_unavailable');
  assert.notEqual(result.delivery,'cooperative_pull');
 }
});
test('pure mode is diagnosed without changing the environment or implying that plugins loaded',()=>{
 const env={OPENCODE_PURE:'1',SECRET:'do-not-show'};const before={...env};
 const result=deliveryCapability(env);assert.equal(result.blocker,'opencode_pure_mode');
 assert.match(result.next_action,/administrator/);assert.deepEqual(env,before);assert.doesNotMatch(JSON.stringify(result),/do-not-show/);
});
test('standalone doctor remains usable when native plugin loading is suppressed',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../bin/doctor.mjs',import.meta.url))],{encoding:'utf8',env:{...process.env,OPENCODE_PURE:'1'}});
 assert.equal(result.status,2);const report=JSON.parse(result.stdout);assert.equal(report.native_plugin_loaded,'not_verified');assert.equal(report.policy_changed,false);assert.equal(report.blocker,'opencode_pure_mode');
});
