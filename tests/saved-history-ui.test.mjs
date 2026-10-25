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
const {SavedHistory}=await import(moduleUrl('../src/SavedHistory.tsx'));
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(''):text(n?.props?.children??'');
test('Saved History confirms committed saves, reuses retry keys, displays frozen snapshots and reports disconnection',async()=>{
  const originalFetch=globalThis.fetch;
  const event={id:1,kind:'route',text:'Local route',time:new Date().toISOString(),closed:[],route:findRoute('mill','site','hours',[])};
  const unchanged=JSON.stringify(event);const bodies=[];let finish;
  globalThis.fetch=async(path,options={})=>{
    if(options.method==='POST'){bodies.push(JSON.parse(options.body));return new Promise(r=>{finish=r;});}
    return new Response(JSON.stringify({records:[]}));
  };
  let tree;const update=()=>{tree=render(()=>SavedHistory({event}));};
  const button=label=>nodes(tree).find(n=>n.type==='button'&&text(n)===label);
  const tick=()=>new Promise(r=>setTimeout(r,0));
  try{
    update();assert.match(text(tree),/Loading saved incidents/);await tick();update();assert.match(text(tree),/No saved incidents/);
    let save=button('Save selected incident').props.onClick();update();assert.ok(!text(tree).includes('Saved to Tiger Data:'));assert.equal(button('Saving incident…').props.disabled,true);
    finish(new Response(JSON.stringify({error:{message:'Database unavailable. No confirmation.'}}),{status:503}));await save;update();assert.match(text(tree),/Database unavailable/);assert.ok(!text(tree).includes('Saved to Tiger Data:'));
    save=button('Save selected incident').props.onClick();update();
    const record={id:'saved-id',savedAt:new Date().toISOString(),event:{...event,text:'Persisted route'}};
    finish(new Response(JSON.stringify({record})));await save;update();assert.match(text(tree),/Saved to Tiger Data: Persisted route/);assert.equal(bodies[0].idempotencyKey,bodies[1].idempotencyKey);
    nodes(tree).find(n=>n.type==='button'&&text(n).startsWith('Persisted route')).props.onClick();update();assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Saved incident snapshot'));assert.match(text(tree),/Steelworks/);assert.equal(JSON.stringify(event),unchanged);
    globalThis.fetch=async()=>{throw new Error('offline');};await button('Refresh saved history').props.onClick();update();assert.match(text(tree),/Saved History is disconnected/);
  }finally{globalThis.fetch=originalFetch;}
});
