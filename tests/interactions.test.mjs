import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const hooks=url(`let state=[],index=0;export function render(fn){index=0;return fn()}export function useState(initial){const i=index++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]}export const useMemo=fn=>fn();`);
const {render}=await import(hooks);
const cache=new Map();
function moduleUrl(path){
  if(cache.has(path))return cache.get(path);
  const code=compile(path).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>{
    if(name==='react')return `from '${hooks}'`;
    if(name.startsWith('./'))return `from '${moduleUrl('../src/'+name.slice(2)+(name==='./network'||name==='./useSimulation'?'.ts':'.tsx'))}'`;
    return `from '${import.meta.resolve(name)}'`;
  });
  const result=url(code);cache.set(path,result);return result;
}
const {default:App}=await import(moduleUrl('../src/App.tsx'));
function expand(node){
  if(!node||typeof node!=='object')return node;
  if(Array.isArray(node))return node.map(expand);
  if(typeof node.type==='function')return expand(node.type(node.props));
  return {...node,props:{...node.props,children:expand(node.props?.children)}};
}
function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
const text=node=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):text(node?.props?.children??'');
let tree;
const update=()=>tree=expand(render(App));
const button=label=>nodes(tree).find(n=>n.type==='button'&&text(n).trim()===label);
const inspect=label=>{nodes(tree).find(n=>n.props?.['aria-label']===`Inspect ${label}`).props.onClick();update();};
test('hub selection, disruption, restoration, no-route state, protected endpoints, and reset',()=>{
  update();
  for(const label of ['Central Junction','Allegheny Rail','Union Depot']){
    inspect(label);assert.ok(nodes(tree).some(n=>n.type==='h2'&&text(n).trim()===label));
    button('Disrupt this hub').props.onClick();update();assert.ok(button('Restore this hub'));
    button('Restore this hub').props.onClick();update();assert.ok(button('Disrupt this hub'));
  }
  for(const label of ['Steelworks','Build Site']){inspect(label);assert.equal(button('Disrupt this hub'),undefined);}
  for(const label of ['Allegheny Rail','Inland Yard']){inspect(label);button('Disrupt this hub').props.onClick();update();}
  assert.ok(nodes(tree).some(n=>n.props?.className==='no-route'));
  assert.equal(button('Apply this route'),undefined);
  nodes(tree).find(n=>n.props?.['aria-label']==='Reset scenario').props.onClick();update();
  assert.ok(button('Apply this route'));assert.ok(button('Disrupt this hub'));
});

test('four views share scenario, applied journey, decision snapshots, and reset',()=>{
  update();
  button('Disruption Lab').props.onClick();update();
  const disrupt=nodes(tree).find(n=>n.props?.['aria-label']==='Disrupt Central Junction');
  disrupt.props.onClick();update();
  assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Restore Central Junction'));
  button('Lowest cost').props.onClick();update();
  button('Apply this route').props.onClick();update();
  button('Shipment Journeys').props.onClick();update();
  assert.ok(nodes(tree).some(n=>n.props?.className?.trim()==='journey-status'&&text(n)==='Route applied'));
  assert.ok(text(tree).includes('SIMULATED RECORD'));
  assert.ok(text(tree).includes('No additional shipment records'));
  assert.ok(!nodes(tree).filter(n=>n.type==='ol'&&n.props.className==='journey-stages').some(n=>text(n).includes('Central Junction')));
  button('Decision Replay').props.onClick();update();
  assert.ok(text(tree).includes('Lowest-cost route applied to RR-2048'));
  assert.ok(text(tree).includes('Central Junction disrupted'));
  assert.ok(text(tree).includes('1 disrupted: Central Junction'));
  button('Network Universe').props.onClick();update();
  inspect('Central Junction');assert.ok(button('Restore this hub'));
  // Enter and Space still select map hubs.
  nodes(tree).find(n=>n.props?.['aria-label']==='Inspect Allegheny Rail').props.onKeyDown({key:'Enter',preventDefault(){}});update();
  assert.ok(nodes(tree).some(n=>n.type==='h2'&&text(n)==='Allegheny Rail'));
  button('Disrupt this hub').props.onClick();update();
  inspect('Inland Yard');button('Disrupt this hub').props.onClick();update();
  button('Shipment Journeys').props.onClick();update();
  assert.ok(text(tree).includes('This journey needs a connection.'));
  nodes(tree).find(n=>n.props?.['aria-label']==='Reset scenario').props.onClick();update();
  assert.ok(text(tree).includes('Route preview'));
  button('Decision Replay').props.onClick();update();
  assert.ok(text(tree).includes('Scenario reset to baseline'));
  // Historical applied route and closures survive a reset without being mutated.
  assert.ok(text(tree).includes('1 disrupted: Central Junction'));
  button('Network Universe').props.onClick();update();
  assert.ok(button('Disrupt this hub'));
});
