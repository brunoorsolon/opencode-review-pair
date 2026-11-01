import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createToolScope } from '../src/tool-scope.mjs';
test('lifetime control aborts all admitted work and joins late accepted effects before closing',async()=>{
 const scope=createToolScope();let release,signal,recorded=false,closed=false;
 const pending=scope.run(async observed=>{signal=observed;await new Promise(resolve=>release=resolve);assert.equal(closed,false);recorded=true;return {accepted:true};});
 await delay(0);assert.ok(release);
 const first=scope.close(),again=scope.close();assert.equal(first,again);assert.equal(signal.aborted,true);
 let drained=false;void first.then(()=>{drained=true;closed=true;});await delay(5);assert.equal(drained,false);
 await assert.rejects(scope.run(()=>assert.fail('new call after stop')));
 release();assert.deepEqual(await pending,{accepted:true});await first;assert.equal(recorded,true);assert.equal(drained,true);
});
test('cancelled admission performs no work; rejection does not leave a leaked active operation',async()=>{
 const controller=new AbortController();controller.abort();const scope=createToolScope();
 await assert.rejects(scope.run(()=>assert.fail('cancelled operation ran'),controller.signal));
 await scope.close();
});
