import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
globalThis.window={matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
import ts from 'typescript';
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const hooks=url(`let state=[],index=0;export function render(fn){index=0;return fn()}export function useState(initial){const i=index++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]}export const useMemo=fn=>fn();export const useEffect=()=>{};`);
const {render}=await import(hooks);
const cache=new Map();
function moduleUrl(path){
  if(cache.has(path))return cache.get(path);
  const code=compile(path).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>{
    if(name==='react')return `from '${hooks}'`;
    if(name.startsWith('./')){const base='../src/'+name.slice(2);return `from '${moduleUrl(base+(existsSync(new URL(base+'.ts',import.meta.url))?'.ts':'.tsx'))}'`;}
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
const simulatedEventCount=tree=>nodes(tree).filter(n=>n.type==='button'&&n.props?.['aria-label']?.startsWith('Replay event ')).length;
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
  nodes(tree).find(n=>n.props?.id==='lab-hub').props.onChange({target:{value:'rail2'}});update();
  const disrupt=button('Disrupt this hub');
  disrupt.props.onClick();update();
  assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Restore Central Junction'));
  nodes(tree).find(n=>n.type==='button'&&text(n).includes('LOWEST COST')).props.onClick();update();
  button('Apply this route').props.onClick();update();
  button('Shipment Journeys').props.onClick();update();
  assert.ok(nodes(tree).some(n=>n.props?.className?.trim()==='journey-status'&&text(n)==='Route applied'));
  assert.ok(text(tree).includes('SIMULATED RECORD'));
  assert.ok(text(tree).includes('No additional shipment records'));
  assert.ok(!nodes(tree).filter(n=>n.type==='ol'&&n.props.className==='journey-stages').some(n=>text(n).includes('Central Junction')));
  button('Decision Replay').props.onClick();update();
  assert.ok(text(tree).includes('Lowest-cost route applied to RR-2048'));
  nodes(tree).find(n=>n.props?.['aria-label']==='incident replay position').props.onChange({target:{value:simulatedEventCount(tree)-1}});update();
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

test('lab comparison selects the highlighted route, stores before/after, and exposes restoration',()=>{
  nodes(tree).find(n=>n.props?.['aria-label']==='Reset scenario').props.onClick();update();
  button('Disruption Lab').props.onClick();update();
  const chosen=()=>nodes(tree).filter(n=>n.props?.['data-route-edge']).map(n=>n.props['data-route-edge']);
  assert.deepEqual(chosen(),['mill-rail1','rail1-rail2','rail2-depot','depot-site']);
  nodes(tree).find(n=>n.type==='button'&&text(n).includes('LOWEST COST')).props.onClick();update();
  assert.deepEqual(chosen(),['mill-yard','yard-depot','depot-site']);
  nodes(tree).find(n=>n.props?.id==='lab-hub').props.onChange({target:{value:'yard'}});update();
  button('Disrupt this hub').props.onClick();update();
  assert.ok(!chosen().some(id=>id.includes('yard')));
  const impact=nodes(tree).find(n=>n.props?.className==='lab-impact');
  assert.ok(text(impact).includes('Before 37 hrs · $1,570'));
  assert.ok(text(impact).includes('After 35 hrs · $1,770'));
  nodes(tree).find(n=>n.props?.['aria-label']==='Restore Inland Yard').props.onClick();update();
  assert.ok(chosen().includes('yard-depot'));
  button('Reset experiment').props.onClick();update();
  assert.ok(text(tree).includes('START AN EXPERIMENT'));
});

test('journey replay supports play, pause, scrubbing, checkpoint selection, and truthful segment details',()=>{
  button('Shipment Journeys').props.onClick();update();
  const byLabel=label=>nodes(tree).find(n=>n.props?.['aria-label']===label);
  byLabel('journey replay position').props.onChange({target:{value:'.5'}});update();
  assert.ok(text(tree).includes('50%'));
  assert.ok(text(tree).includes('Demo position: 17.5 of 35 planned hours'));
  assert.ok(byLabel('Demo replay shipment marker'));
  byLabel('Play journey replay').props.onClick();update();
  assert.ok(byLabel('Pause journey replay'));
  byLabel('Pause journey replay').props.onClick();update();
  assert.ok(byLabel('Play journey replay'));
  byLabel('Journey checkpoint Union Depot').props.onClick();update();
  assert.ok(nodes(tree).some(n=>n.type==='h2'&&text(n)==='Union Depot'));
  assert.ok(text(tree).includes('warehouse → destination transfer · mode not recorded'));
  assert.ok(text(tree).includes('9 hrs · $430'));
  assert.ok(text(tree).includes('ROUTE SEGMENTS'));
  assert.ok(!text(tree).includes('DIRECTED LEGS'));
  button('Inspect on network').props.onClick();update();
  assert.ok(nodes(tree).some(n=>n.type==='h2'&&text(n)==='Union Depot'));
});

test('incident replay supports steps, scrub, play/pause, saved route highlighting, and isolated hub inspection',()=>{
  button('Decision Replay').props.onClick();update();
  const byLabel=label=>nodes(tree).find(n=>n.props?.['aria-label']===label);
  const eventButtons=nodes(tree).filter(n=>n.type==='button'&&n.props?.['aria-label']?.startsWith('Replay event '));
  const routeEvent=eventButtons.find(n=>text(n).includes('Lowest-cost route applied'));
  routeEvent.props.onClick();update();
  assert.ok(text(tree).includes('RECORDED ROUTE DECISION'));
  assert.ok(nodes(tree).some(n=>n.props?.['data-route-edge']));
  byLabel('Previous incident replay event').props.onClick();update();
  assert.ok(text(tree).includes('No route was saved with this event'));
  assert.equal(nodes(tree).filter(n=>n.props?.['data-route-edge']).length,0);
  byLabel('Next incident replay event').props.onClick();update();
  assert.ok(text(tree).includes('RECORDED ROUTE DECISION'));
  byLabel('Play incident replay').props.onClick();update();assert.ok(byLabel('Pause incident replay'));
  byLabel('Pause incident replay').props.onClick();update();assert.ok(byLabel('Play incident replay'));
  byLabel('incident replay position').props.onChange({target:{value:0}});update();
  assert.equal(byLabel('Previous incident replay event').props.disabled,true);
  byLabel('Inspect Allegheny Rail').props.onClick();update();
  assert.ok(text(tree).includes('Operational in this snapshot'));
  button('Network Universe').props.onClick();update();
  assert.ok(nodes(tree).some(n=>n.type==='h2'&&text(n)==='Union Depot'));
  assert.ok(button('Disrupt this hub'));
});

test('empty incident history is helpful and does not invent events',async()=>{
  const {DecisionReplay}=await import(moduleUrl('../src/IncidentReplay.tsx'));
  const empty=expand(DecisionReplay({sim:{history:[],incidentPlayback:{position:0}}}));
  assert.ok(text(empty).includes('Your first decision starts the story.'));
  assert.equal(nodes(empty).filter(n=>n.props?.['aria-label']?.startsWith('Replay event ')).length,0);
});
