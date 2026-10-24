import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const compile=file=>ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const networkUrl=url(compile('network.ts'));
const replayUrl=url(compile('replay.ts').replace("from './network'",`from '${networkUrl}'`));
const {findRoute,hubs}=await import(networkUrl);
const {advance,routePosition,checkpointProgress,segmentMode}=await import(replayUrl);

test('demo position follows directed segments weighted by computed hours and clamps safely',()=>{
  const route=findRoute('mill','site','hours',[]);
  assert.equal(routePosition(null,.5),null);
  assert.equal(routePosition(route,-1).x,hubs.find(h=>h.id==='mill').x);
  assert.equal(routePosition(route,2).x,hubs.find(h=>h.id==='site').x);
  assert.equal(routePosition(route,.5).elapsed,17.5);
  for(let i=1;i<route.ids.length;i++){
    const p=routePosition(route,checkpointProgress(route,i));
    const hub=hubs.find(h=>h.id===route.ids[i]);
    assert.ok(Math.abs(p.x-hub.x)<.00001);assert.ok(Math.abs(p.y-hub.y)<.00001);
  }
  assert.ok(segmentMode('mill','rail1').includes('mode not recorded'));
  assert.equal(advance(2,3,1),3);assert.equal(advance(3,3,1),3);assert.equal(advance(1,1,.1,true),0);
});

// Execute the real playback hook's effects against a deterministic timer and media query.
const hooksUrl=url(`let values=[],index=0,effects=[],pending=[],dirty=false;
export function useState(initial){const i=index++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>{const next=typeof v==='function'?v(values[i]):v;if(!Object.is(next,values[i])){values[i]=next;dirty=true}}]}
export const useMemo=fn=>fn();
export function useEffect(fn,deps){const i=index++;if(!effects[i]||deps.some((d,j)=>!Object.is(d,effects[i].deps[j]))){pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()}})}}
export function render(fn){let result,limit=20;do{dirty=false;index=0;result=fn();const jobs=pending;pending=[];jobs.forEach(fn=>fn());if(--limit===0)throw Error('Unstable hook')}while(dirty);return result}
export function dispose(){effects.forEach(e=>e?.cleanup?.());values=[];effects=[];pending=[];}
`);
const {render,dispose}=await import(hooksUrl);
const playbackCode=compile('usePlayback.ts').replace("from 'react'",`from '${hooksUrl}'`).replace("from './replay'",`from '${replayUrl}'`);
const {usePlayback}=await import(url(playbackCode));

test('playback timers pause, stop at the final event, seek, restart on route change, and honor reduced motion',()=>{
  let timers=new Map(),nextTimer=0,reduced=false,listener;
  globalThis.window={setInterval(fn){timers.set(++nextTimer,fn);return nextTimer;},clearInterval(id){timers.delete(id);},matchMedia(){return {get matches(){return reduced;},addEventListener(_,fn){listener=fn;},removeEventListener(){listener=undefined;}};}};
  let signature='route-A';
  const update=()=>render(()=>usePlayback(3,signature,1,1800));
  let p=update();assert.equal(p.running,false);assert.equal(timers.size,0);
  p.toggle();p=update();assert.equal(timers.size,1);
  const tick=()=>{[...timers.values()].forEach(fn=>fn());p=update();};
  tick();assert.equal(p.position,1);
  p.pause();p=update();assert.equal(timers.size,0);
  tick();assert.equal(p.position,1);
  p.seek(2);p=update();assert.equal(p.position,2);
  p.toggle();p=update();tick();assert.equal(p.position,3);assert.equal(p.running,false);assert.equal(timers.size,0);
  p.toggle();p=update();assert.equal(p.position,0);assert.equal(p.running,true);
  signature='route-B';p=update();assert.equal(p.position,0);assert.equal(p.running,false);
  p.toggle();p=update();reduced=true;listener();p=update();assert.equal(p.running,false);assert.equal(p.reduced,true);
  p.toggle();p=update();assert.equal(p.running,true,'explicit replay remains available with reduced motion');
  dispose();assert.equal(timers.size,0);assert.equal(listener,undefined);
  p=render(()=>usePlayback(1,'map',.1,180,true,true));assert.equal(p.running,false,'reduced motion prevents autoplay');
  dispose();delete globalThis.window;
});

test('journey autoplay is view-scoped, loops, resets on endpoint changes, and suspends in hidden tabs',()=>{
  let timers=new Map(),nextTimer=0,visibilityListener,hidden=false;
  globalThis.document={get hidden(){return hidden;},addEventListener(_,fn){visibilityListener=fn;},removeEventListener(){visibilityListener=undefined;}};
  globalThis.window={setInterval(fn){timers.set(++nextTimer,fn);return nextTimer;},clearInterval(id){timers.delete(id);},matchMedia(){return {matches:false,addEventListener(){},removeEventListener(){}};}};
  let enabled=false,signature='mill|site';
  const update=()=>render(()=>usePlayback(1,signature,.5,100,true,true,enabled));
  let p=update();assert.equal(p.running,false);assert.equal(timers.size,0);
  enabled=true;p=update();assert.equal(p.running,true);assert.equal(timers.size,1);
  const tick=()=>{[...timers.values()].forEach(fn=>fn());p=update();};
  tick();assert.equal(p.position,.5);
  hidden=true;visibilityListener();p=update();assert.equal(timers.size,0);assert.equal(p.running,false);
  hidden=false;visibilityListener();p=update();assert.equal(timers.size,1);
  tick();assert.equal(p.position,1);tick();assert.equal(p.position,0);
  tick();signature='portA|site';p=update();assert.equal(p.position,0);assert.equal(p.running,true);
  p.pause();p=update();assert.equal(timers.size,0);
  enabled=false;p=update();enabled=true;p=update();assert.equal(p.running,true,'view entry starts the demo automatically');
  dispose();assert.equal(timers.size,0);assert.equal(visibilityListener,undefined);
  delete globalThis.window;delete globalThis.document;
});

test('shared simulation resets journey on endpoint changes and preserves historical route snapshots',async()=>{
  const playbackUrl=url(playbackCode);
  const simulationCode=compile('useSimulation.ts').replace("from 'react'",`from '${hooksUrl}'`).replace("from './usePlayback'",`from '${playbackUrl}'`).replace("from './network'",`from '${networkUrl}'`);
  const {useSimulation,shipment}=await import(url(simulationCode));
  let timers=new Map(),nextTimer=0;
  globalThis.window={setInterval(fn){timers.set(++nextTimer,fn);return nextTimer;},clearInterval(id){timers.delete(id);},matchMedia(){return {matches:false,addEventListener(){},removeEventListener(){}};}};
  let view='journeys';
  const update=()=>render(()=>useSimulation(view));
  let sim=update();assert.equal(sim.journeyPlayback.running,true);
  [...timers.values()].forEach(fn=>fn());sim=update();assert.ok(sim.journeyPlayback.position>0);
  sim.applyRoute();sim=update();const saved=JSON.stringify(sim.history.find(e=>e.kind==='route'));
  assert.equal(sim.changeEndpoints('portA','site'),true);sim=update();
  assert.equal(sim.journeyPlayback.position,0);assert.equal(sim.journeyPlayback.running,true);
  assert.equal(sim.committed,null);assert.equal(sim.isDemo,false);
  assert.deepEqual(sim.active.ids,['portA','portB','site']);
  assert.equal(JSON.stringify(sim.history.find(e=>e.kind==='route')),saved);
  assert.equal(shipment.originId,'mill');assert.equal(shipment.destinationId,'site');
  assert.equal(sim.changeEndpoints('site','site'),false);
  sim.changeEndpoints('site','portA');sim=update();assert.equal(sim.active,null);assert.equal(sim.journeyPlayback.running,false);
  view='replay';sim=update();assert.equal(timers.size,0);
  const current={origin:sim.origin,destination:sim.destination,closed:[...sim.closed]};
  sim.incidentPlayback.seek(1);sim=update();
  assert.deepEqual({origin:sim.origin,destination:sim.destination,closed:sim.closed},current);
  sim.reset();sim=update();assert.equal(sim.origin,'mill');assert.equal(sim.destination,'site');
  assert.equal(JSON.stringify(sim.history.find(e=>e.kind==='route')),saved);
  dispose();assert.equal(timers.size,0);delete globalThis.window;
});
