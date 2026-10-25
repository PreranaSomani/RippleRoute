import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
import {findRoute} from '../src/network.ts';
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const hooks=url(`let state=[],index=0,effects=[];export function render(fn){index=0;const node=fn();const pending=effects;effects=[];pending.forEach(fn=>fn());return node;}export function useState(initial){const i=index++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]}export function useRef(initial){return useState({current:initial})[0]}export function useEffect(fn,deps){const i=index++,old=state[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))effects.push(()=>{old?.cleanup?.();state[i]={deps,cleanup:fn()}})}`);
const {render}=await import(hooks);
const cache=new Map();
function moduleUrl(path){
  if(cache.has(path))return cache.get(path);
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from ['"]([^'"]+)['"]/g,(_,name)=>{
    if(name==='react')return `from '${hooks}'`;
    if(name.startsWith('./')){const base='../src/'+name.slice(2).replace(/\.tsx?$/,'');return `from '${moduleUrl(base+(existsSync(new URL(base+'.ts',import.meta.url))?'.ts':'.tsx'))}'`;}
    return `from '${import.meta.resolve(name)}'`;
  });const result=url(code);cache.set(path,result);return result;
}
const {VoiceBriefing}=await import(moduleUrl('../src/VoiceBriefing.tsx'));
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(''):text(n?.props?.children??'');
test('voice UI makes no automatic request, prevents duplicates, plays/pauses cached audio, clears stale audio and exposes errors',async()=>{
  const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
  globalThis.window={setTimeout,clearTimeout};
  let calls=0,complete;
  globalThis.fetch=async()=>{calls++;return new Promise(r=>{complete=r;});};
  let input={mode:'single',origin:'mill',destination:'site',scenario:'RR-2048',objective:'hours',disruptedHubIds:[],originalRoute:null,options:[{id:'fastest',...findRoute('mill','site','hours',[])},{id:'cheapest',...findRoute('mill','site','cost',[])}]};
  let tree;const update=()=>{tree=render(()=>VoiceBriefing({input}));};
  const button=()=>nodes(tree).find(n=>n.type==='button');
  const audio=()=>nodes(tree).find(n=>n.type==='audio');
  const player={paused:true,src:'',play:async()=>{player.paused=false;audio().props.onPlay();},pause:()=>{player.paused=true;audio().props.onPause();}};
  try{
    update();update();assert.equal(calls,0);assert.match(text(tree),/Briefing transcript/);
    audio().props.ref.current=player;
    const pending=button().props.onClick();await button().props.onClick();update();assert.equal(calls,1);assert.equal(button().props.disabled,true);
    complete(new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg','X-Briefing-Transcript':encodeURIComponent('Verified dispatch transcript.')}}));
    await pending;update();assert.equal(text(button()),'Pause Briefing');assert.match(text(tree),/Verified dispatch transcript/);assert.equal(audio().props.controls,true);
    await button().props.onClick();update();assert.equal(text(button()),'Play Briefing');assert.equal(calls,1);
    await button().props.onClick();update();assert.equal(text(button()),'Pause Briefing');assert.equal(calls,1);
    input={...input,objective:'cost'};update();update();assert.equal(player.paused,true);assert.equal(audio().props.hidden,true);assert.equal(calls,1);
    const normalPlay=player.play;
    player.play=async()=>{throw new DOMException('User interaction required','NotAllowedError');};
    globalThis.fetch=async()=>{calls++;return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg','X-Briefing-Transcript':encodeURIComponent('Ready transcript.')}});};
    const ready=button().props.onClick();update();
    assert.ok(nodes(tree).some(n=>n.props?.role==='status'));
    assert.ok(!nodes(tree).some(n=>n.props?.role==='alert'));
    await ready;update();
    assert.equal(audio().props.controls,true);assert.equal(text(button()),'Play Briefing');
    assert.ok(!nodes(tree).some(n=>n.props?.role==='alert'));
    assert.ok(!text(tree).includes('Press Play'));
    player.play=normalPlay;
    audio().props.onError();update();assert.ok(nodes(tree).some(n=>n.props?.role==='alert'));
    await button().props.onClick();update();assert.equal(text(button()),'Pause Briefing');
    assert.ok(!nodes(tree).some(n=>n.props?.role==='alert'));
    player.paused=true;audio().props.onEnded();update();assert.equal(text(button()),'Play Briefing');
    input={...input,objective:'hours'};update();update();
    globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{message:'ElevenLabs quota reached.'}}),{status:429});};
    await button().props.onClick();update();assert.equal(calls,3);assert.ok(nodes(tree).some(n=>n.props?.role==='alert'&&text(n)==='ElevenLabs quota reached.'));
  }finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
});
