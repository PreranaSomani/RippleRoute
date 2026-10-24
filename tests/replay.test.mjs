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
