import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
globalThis.window={setTimeout,clearTimeout,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
import ts from 'typescript';
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const hooks=url(`let state=[],index=0;const scopes=new Map();export function render(fn,props){const previous=[state,index];if(!scopes.has(fn))scopes.set(fn,[]);state=scopes.get(fn);index=0;try{return fn(props)}finally{[state,index]=previous}}export function setStateFor(fn,index,value){scopes.get(fn)[index]=value}export function useState(initial){const i=index++,scope=state;if(!(i in scope))scope[i]=initial;return [scope[i],v=>{scope[i]=typeof v==='function'?v(scope[i]):v}]}export const useRef=initial=>{const [ref]=useState({current:initial});return ref};export const useMemo=fn=>fn();export const useEffect=()=>{};`);
const {render,setStateFor}=await import(hooks);
const cache=new Map();
function moduleUrl(path){
  if(cache.has(path))return cache.get(path);
  const code=compile(path).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>{
    if(name==='react')return `from '${hooks}'`;
    if(name.startsWith('./')){const base='../src/'+name.slice(2).replace(/\.tsx?$/, '');return `from '${moduleUrl(base+(existsSync(new URL(base+'.ts',import.meta.url))?'.ts':'.tsx'))}'`;}
    return `from '${import.meta.resolve(name)}'`;
  });
  const result=url(code);cache.set(path,result);return result;
}
const {default:App}=await import(moduleUrl('../src/App.tsx'));
function expand(node){
  if(!node||typeof node!=='object')return node;
  if(Array.isArray(node))return node.map(expand);
  if(typeof node.type==='function')return expand(render(node.type,node.props));
  return {...node,props:{...node.props,children:expand(node.props?.children)}};
}
function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
const text=node=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):text(node?.props?.children??'');
const simulatedEventCount=tree=>nodes(tree).filter(n=>n.type==='button'&&n.props?.['aria-label']?.startsWith('Replay event ')).length;
let tree;
const update=()=>tree=expand(render(App));
// Exercise the retained internal view without relying on a sidebar entry.
const openJourney=()=>{setStateFor(App,0,'journeys');update();};
const button=label=>nodes(tree).find(n=>n.type==='button'&&text(n).trim()===label);
const inspect=label=>{nodes(tree).find(n=>n.props?.['aria-label']===`Inspect ${label}`).props.onClick();update();};
test('Lab is the landing view; sidebar hides Journeys while the internal view remains functional',()=>{
  update();assert.ok(tree.props.className.includes('view-lab'));
  const nav=nodes(tree).find(n=>n.props?.['aria-label']==='Main navigation');
  assert.deepEqual(nodes(nav).filter(n=>n.type==='button').map(text),['Network Universe','Disruption Lab','Decision Replay']);
  openJourney();assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Shipment Journeys'));
  assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='journey replay position'));
  button('Network Universe').props.onClick();update();
});

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
  openJourney();
  assert.ok(nodes(tree).some(n=>n.props?.className?.trim()==='journey-status'&&text(n)==='Route applied'));
  assert.ok(text(tree).includes('SIMULATED RECORD'));
  assert.ok(text(tree).includes('Five fictional fleet records'));
  assert.ok(!nodes(tree).filter(n=>n.type==='ol'&&n.props.className==='journey-stages').some(n=>text(n).includes('Central Junction')));
  button('Decision Replay').props.onClick();update();
  assert.ok(text(tree).includes('Lowest-cost route applied to RR-2048'));
  nodes(tree).filter(n=>n.type==='button'&&n.props?.['aria-label']?.startsWith('Replay event ')).at(-1).props.onClick();update();
  assert.ok(text(tree).includes('Central Junction disrupted'));
  assert.ok(text(tree).includes('1 disrupted: Central Junction'));
  button('Network Universe').props.onClick();update();
  inspect('Central Junction');assert.ok(button('Restore this hub'));
  // Enter and Space still select map hubs.
  nodes(tree).find(n=>n.props?.['aria-label']==='Inspect Allegheny Rail').props.onKeyDown({key:'Enter',preventDefault(){}});update();
  assert.ok(nodes(tree).some(n=>n.type==='h2'&&text(n)==='Allegheny Rail'));
  button('Disrupt this hub').props.onClick();update();
  inspect('Inland Yard');button('Disrupt this hub').props.onClick();update();
  openJourney();
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
  assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Single shipment spatial planning'));
  assert.equal(nodes(tree).filter(n=>n.type==='g'&&n.props?.className?.startsWith('spatial-hub ')).length,10);
  assert.ok(!nodes(tree).some(n=>n.props?.className==='lab-map'));
  const chosen=()=>nodes(tree).filter(n=>n.props?.['data-route-edge']).map(n=>n.props['data-route-edge']);
  assert.deepEqual(chosen(),['mill-rail1','rail1-rail2','rail2-depot','depot-site']);
  nodes(tree).find(n=>n.type==='button'&&text(n).includes('LOWEST COST')).props.onClick();update();
  assert.deepEqual(chosen(),['mill-yard','yard-depot','depot-site']);
  nodes(tree).find(n=>n.props?.id==='lab-hub').props.onChange({target:{value:'yard'}});update();
  button('Disrupt this hub').props.onClick();update();
  assert.ok(!chosen().some(id=>id.includes('yard')));
  const impact=nodes(tree).find(n=>n.props?.className==='single-plan-impact');
  assert.ok(text(impact).includes('Before 37 hrs · $1,570'));
  assert.ok(text(impact).includes('After 35 hrs · $1,770'));
  nodes(tree).find(n=>n.props?.['aria-label']==='Restore Inland Yard').props.onClick();update();
  assert.ok(chosen().includes('yard-depot'));
  button('Reset experiment').props.onClick();update();
  assert.ok(text(tree).includes('Choose endpoints, select a hub to disrupt'));
});

test('journey replay supports play, pause, scrubbing, checkpoint selection, and truthful segment details',()=>{
  openJourney();
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

test('incident storyboard supports event selection, compact pause/restart, recorded route strips, and isolation',()=>{
  button('Decision Replay').props.onClick();update();
  const byLabel=label=>nodes(tree).find(n=>n.props?.['aria-label']===label);
  const eventButtons=nodes(tree).filter(n=>n.type==='button'&&n.props?.['aria-label']?.startsWith('Replay event '));
  const routeEvent=eventButtons.find(n=>text(n).includes('Lowest-cost route applied'));
  routeEvent.props.onClick();update();
  assert.ok(text(tree).includes('RECORDED ROUTE DECISION'));
  assert.ok(nodes(tree).some(n=>n.props?.className==='story-route'));
  assert.equal(nodes(tree).some(n=>n.props?.['aria-label']==='Interactive network map'),false);
  eventButtons[eventButtons.indexOf(routeEvent)-1].props.onClick();update();
  assert.ok(text(tree).includes('BEFORE'));
  assert.ok(text(tree).includes('AFTER'));
  assert.equal(nodes(tree).filter(n=>n.props?.['data-route-edge']).length,0);
  routeEvent.props.onClick();update();
  assert.ok(text(tree).includes('RECORDED ROUTE DECISION'));
  byLabel('Play incident replay').props.onClick();update();assert.ok(byLabel('Pause incident replay'));
  byLabel('Pause incident replay').props.onClick();update();assert.ok(byLabel('Play incident replay'));
  byLabel('Restart incident story').props.onClick();update();
  assert.ok(text(tree).includes('1 /'));
  assert.equal(byLabel('incident replay position'),undefined);
  assert.equal(nodes(tree).some(n=>n.type==='button'&&text(n).trim()==='Play'),false);
  assert.equal(nodes(tree).some(n=>n.props?.['aria-label']==='Inspect Allegheny Rail'),false);
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


test('dynamic endpoints synchronize views, protect active hubs, reject invalid pairs, and preserve the demo record',()=>{
  const byLabel=label=>nodes(tree).find(n=>n.props?.['aria-label']===label);
  byLabel('Reset scenario').props.onClick();update();
  byLabel('Planning origin').props.onChange({target:{value:'portA'}});update();
  assert.ok(text(tree).includes('NEW PLANNING SCENARIO'));
  assert.deepEqual(nodes(tree).filter(n=>n.props?.['data-route-edge']).map(n=>n.props['data-route-edge']),['portA-portB','portB-site']);
  inspect('Harbor East');assert.equal(button('Disrupt this hub'),undefined);
  inspect('Steelworks');assert.ok(button('Disrupt this hub'));
  byLabel('Planning destination').props.onChange({target:{value:'portA'}});update();
  assert.equal(byLabel('Planning destination').props.value,'site');
  byLabel('Planning origin').props.onChange({target:{value:'unknown'}});update();
  assert.equal(byLabel('Planning origin').props.value,'portA');
  byLabel('Swap origin and destination').props.onClick();update();
  assert.equal(byLabel('Planning origin').props.value,'site');
  assert.equal(byLabel('Planning destination').props.value,'portA');
  assert.ok(nodes(tree).some(n=>n.props?.className==='no-route'));
  assert.equal(button('Apply this route'),undefined);
  byLabel('Swap origin and destination').props.onClick();update();
  button('Apply this route').props.onClick();update();
  openJourney();
  assert.ok(text(tree).includes('CUSTOM PLAN / JOURNEY PREVIEW'));
  assert.ok(nodes(tree).some(n=>n.type==='h2'&&text(n).includes('Harbor East')&&text(n).includes('Build Site')));
  assert.ok(text(tree).includes('Saved demo: RR-2048'));
  assert.ok(text(tree).includes('Steelworks → Build Site. This example record stays unchanged'));
  byLabel('journey replay position').props.onChange({target:{value:'.6'}});update();
  byLabel('Replay journey from start').props.onClick();update();
  assert.ok(text(tree).includes('0%'));
  button('Decision Replay').props.onClick();update();
  assert.ok(text(tree).includes('route applied to Custom plan'));
  assert.equal(byLabel('Interactive network map'),undefined);
  button('Disruption Lab').props.onClick();update();
  assert.equal(byLabel('Planning origin').props.value,'portA');
  button('RR-2048 preset').props.onClick();update();
  assert.equal(byLabel('Planning origin').props.value,'mill');
  assert.equal(byLabel('Planning destination').props.value,'site');
});

test('selecting a closed endpoint preserves closures and allows restoration; reset restores preset',()=>{
  const byLabel=label=>nodes(tree).find(n=>n.props?.['aria-label']===label);
  nodes(tree).find(n=>n.props?.id==='lab-hub').props.onChange({target:{value:'rail1'}});update();
  button('Disrupt this hub').props.onClick();update();
  byLabel('Planning origin').props.onChange({target:{value:'rail1'}});update();
  assert.ok(button('Restore this hub'));
  assert.ok(text(tree).includes('Unavailable'));
  button('Restore this hub').props.onClick();update();
  assert.equal(button('Disrupt this hub'),undefined);
  assert.ok(button('Apply this route'));
  byLabel('Reset scenario').props.onClick();update();
  assert.equal(byLabel('Planning origin').props.value,'mill');
  assert.equal(byLabel('Planning destination').props.value,'site');
  button('Decision Replay').props.onClick();update();
  const before=simulatedEventCount(tree);
  byLabel('Reset scenario').props.onClick();update();
  assert.equal(simulatedEventCount(tree),before);
});

test('trivial/reset-only history omits playback and shows a useful start state',async()=>{
  const {DecisionReplay}=await import(moduleUrl('../src/IncidentReplay.tsx'));
  const result=expand(DecisionReplay({sim:{history:[{id:0,kind:'initialized',text:'Network simulation initialized',time:new Date().toISOString(),closed:[],route:null},{id:1,kind:'reset',text:'Scenario reset to baseline',time:new Date().toISOString(),closed:[],route:null}],incidentPlayback:{position:0}}}));
  assert.ok(text(result).includes('Your first decision starts the story.'));
  assert.ok(text(result).includes('Setup & reset records (2)'));
  assert.equal(nodes(result).some(n=>n.props?.['aria-label']==='incident replay controls'),false);
});


test('Gemini advisor only runs on click, blocks duplicate requests, displays a real API result, and supports retry',async()=>{
  button('Disruption Lab').props.onClick();update();
  const originalFetch=globalThis.fetch;
  let calls=0,resolve;
  globalThis.fetch=()=>{calls++;return new Promise(r=>{resolve=r;});};
  try{
    assert.equal(calls,0);
    const analyze=button('Analyze with Gemini');
    const first=analyze.props.onClick();const duplicate=analyze.props.onClick();
    update();assert.equal(calls,1);assert.equal(button('Analyzing…').props.disabled,true);
    resolve({ok:true,json:async()=>({source:'gemini',model:'test-provider-model',analysis:{incidentSummary:'The simulated route is feasible.',recommendedRouteId:'fastest',explanation:'Favor the fastest computed option.',tradeoffs:[],warnings:['No live network status is available.']}})});
    await Promise.all([first,duplicate]);update();
    assert.ok(text(tree).includes('Generated by Gemini'));
    assert.ok(text(tree).includes('The simulated route is feasible.'));
    assert.ok(text(tree).includes('Route facts verified against the graph'));
    globalThis.fetch=async()=>({ok:false,json:async()=>({error:{message:'Gemini quota reached.'}})});
    await button('Analyze with Gemini').props.onClick();update();
    assert.ok(text(tree).includes('Gemini quota reached.'));
    assert.ok(button('Retry Gemini analysis'));
  }finally{globalThis.fetch=originalFetch;}
});

test('fleet mode allocates, detects stale results, restores disruptions and sends actual fleet facts to Gemini',async()=>{
  button('Disruption Lab').props.onClick();update();
  const byLabel=label=>nodes(tree).find(n=>n.props?.['aria-label']===label);
  byLabel('Reset scenario').props.onClick();update();
  button('Fleet planning · 5 simulated shipments').props.onClick();update();
  assert.ok(text(tree).includes('105 / 90'));assert.ok(text(tree).includes('RR-2052'));
  assert.ok(byLabel('Gemini AI Advisor'));
  assert.ok(nodes(tree).some(n=>n.type==='fieldset'&&n.props.disabled));
  button('Coordinate Fleet →').props.onClick();update();
  assert.ok(text(tree).includes('70 / 90'));
  assert.ok(byLabel('Gemini AI Advisor'));
  const originalFetch=globalThis.fetch;let sent;
  globalThis.fetch=async(_url,config)=>{sent=JSON.parse(config.body);return {ok:true,json:async()=>({source:'gemini',model:'test',analysis:{incidentSummary:'Shared capacity is reserved.',recommendedRouteId:null,explanation:'The supplied fleet allocation respects edge capacity.',tradeoffs:[],warnings:[]}})};};
  try{await (button('Analyze with Gemini')??button('Retry Gemini analysis')).props.onClick();update();assert.equal(sent.mode,'fleet');assert.equal(sent.report.current.metrics.shipmentCount,5);assert.ok(text(tree).includes('Verified fleet report'));}finally{globalThis.fetch=originalFetch;}
  byLabel('Fleet disruption hub').props.onChange({target:{value:'depot'}});update();button('Close hub').props.onClick();update();
  assert.ok(button('Coordinate Fleet →'));assert.ok(nodes(tree).some(n=>n.type==='fieldset'&&n.props.disabled));
  button('Coordinate Fleet →').props.onClick();update();assert.ok(text(tree).includes('no-route'));
  button('Restore hub').props.onClick();update();
  button('Single shipment planning').props.onClick();update();assert.ok(byLabel('Planning origin'));
});

test('spatial prototype focuses neighborhoods, supports camera controls, and returns to overview without resetting disruptions',()=>{
  button('Network Universe').props.onClick();update();
  const byLabel=label=>nodes(tree).find(n=>n.props?.['aria-label']===label);
  byLabel('Reset scenario').props.onClick();update();
  button('← Back to Network').props.onClick();update();
  assert.equal(byLabel('Contextual hub inspector'),undefined);
  const stations=()=>nodes(tree).filter(n=>n.type==='g'&&n.props?.className?.startsWith('spatial-hub '));
  assert.equal(stations().length,10);
  byLabel('Inspect Central Junction').props.onKeyDown({key:'Enter',preventDefault(){}});update();
  assert.ok(byLabel('Contextual hub inspector'));
  assert.equal(byLabel('Inspect Central Junction').props['aria-pressed'],true);
  assert.equal(stations().filter(n=>!n.props.className.includes('is-distant')).length,5);
  const camera=()=>nodes(tree).find(n=>n.props?.className==='spatial-world');
  const focusedScale=camera().props['data-camera-scale'];assert.ok(focusedScale>1);
  byLabel('Zoom in').props.onClick();update();assert.ok(camera().props['data-camera-scale']>focusedScale);
  byLabel('Zoom out').props.onClick();update();assert.ok(Math.abs(camera().props['data-camera-scale']-focusedScale)<.001);
  byLabel('Focus Union Depot').props.onClick();update();assert.equal(byLabel('Inspect Union Depot').props['aria-pressed'],true);
  byLabel('Inspect Central Junction').props.onClick();update();button('Disrupt this hub').props.onClick();update();
  assert.ok(text(tree).includes('Central Junction closed;'));
  assert.ok(byLabel('Inspect Central Junction').props.className.includes('is-closed'));
  assert.ok(!byLabel('Simulated shipment marker').props['data-freight-edge'].includes('rail2'));
  const route=nodes(tree).filter(n=>n.props?.['data-route-edge']).map(n=>n.props['data-route-edge']);
  button('← Back to Network').props.onClick();update();
  assert.equal(byLabel('Contextual hub inspector'),undefined);
  assert.equal(camera().props['data-view-mode'],'overview');
  assert.deepEqual(nodes(tree).filter(n=>n.props?.['data-route-edge']).map(n=>n.props['data-route-edge']),route);
  assert.ok(byLabel('Inspect Central Junction').props.className.includes('is-closed'));
  byLabel('Inspect Central Junction').props.onClick();update();button('Restore this hub').props.onClick();update();
  byLabel('Inspect Allegheny Rail').props.onClick();update();button('Disrupt this hub').props.onClick();update();
  byLabel('Inspect Inland Yard').props.onClick();update();button('Disrupt this hub').props.onClick();update();
  assert.equal(byLabel('Simulated shipment marker'),undefined);
  assert.ok(text(tree).includes('no feasible route remains'));
  assert.equal(button('Apply this route'),undefined);
  byLabel('Inspect Inland Yard').props.onKeyDown({key:'Escape',preventDefault(){}});update();assert.equal(byLabel('Contextual hub inspector'),undefined);
});

test('fleet spatial recovery coordinates real results and invalidates them when closures change',()=>{
 update();nodes(tree).find(n=>n.props?.['aria-label']==='Reset scenario').props.onClick();update();
 button('Disruption Lab').props.onClick();update();
 button('Fleet planning · 5 simulated shipments').props.onClick();update();
 assert.ok(text(tree).includes('105 / 90'));
 button('Coordinate Fleet →').props.onClick();update();
 assert.ok(text(tree).includes('70 / 90'));
 assert.ok(text(tree).includes('5 / 5 allocated'));
 assert.ok(text(tree).includes('Harbor East → Bluewater Port'));
 button('Follow Shipment').props.onClick();update();
 assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Selected shipment simulation'));
 assert.ok(button('Pause'));
 button('Pause').props.onClick();update();
 assert.ok(button('Play'));
 assert.ok(button('Restart'));
 assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Shipment simulation progress'));
 const records=nodes(tree).find(n=>n.props?.['aria-labelledby']==='fleet-records-title');
 assert.ok(records&&records.type==='section');
 const briefing=nodes(tree).find(n=>n.props?.['aria-labelledby']==='dispatcher-heading');
 assert.ok(briefing&&briefing.type==='section');
 assert.ok(text(briefing).includes('Listen to Briefing'));
 assert.ok(text(records).includes('Simulated industrial dispatch cohort'));
 const picker=nodes(tree).find(n=>n.props?.['aria-label']==='Fleet disruption hub');picker.props.onChange({target:{value:'rail2'}});update();
 button('Close hub').props.onClick();update();
 assert.ok(button('Coordinate Fleet →'));
 assert.ok(!text(tree).includes('Allocation calculated ✓'));
 button('Coordinate Fleet →').props.onClick();update();
 assert.ok(text(tree).includes('unallocated'));
 button('Explore another disruption ↺').props.onClick();update();
 assert.ok(text(tree).includes('105 / 90'));
 button('Single shipment planning').props.onClick();update();
 assert.ok(button('Apply this route'));
});

test('Lab segment list starts with five relevant rows, expands, and invalidates allocation on objective changes',()=>{
 update();nodes(tree).find(n=>n.props?.['aria-label']==='Reset scenario').props.onClick();update();
 button('Disruption Lab').props.onClick();update();button('Fleet planning · 5 simulated shipments').props.onClick();update();
 const segmentRows=()=>{const table=nodes(tree).find(n=>n.props?.['aria-label']==='Directed segment capacity table');return nodes(table).filter(n=>n.type==='tbody').flatMap(n=>nodes(n).filter(n=>n.type==='tr'));};
 assert.equal(segmentRows().length,5);
 assert.ok(text(segmentRows()[0]).includes('Central Junction → Union Depot'));
 assert.ok(text(segmentRows()[0]).includes('overload'));
 assert.ok(text(tree).includes('Awaiting coordination'));
 assert.ok(!text(tree).includes('Not reserved'));
 button('Show all (17)').props.onClick();update();assert.equal(segmentRows().length,17);
 button('Show fewer').props.onClick();update();assert.equal(segmentRows().length,5);
 button('Coordinate Fleet →').props.onClick();update();assert.ok(text(tree).includes('5 / 5 allocated'));
 nodes(tree).find(n=>n.props?.['aria-label']==='Fleet objective').props.onChange({target:{value:'cost'}});update();
 assert.ok(button('Coordinate Fleet →'));
 assert.ok(!nodes(tree).some(n=>n.props?.className==='recovery-story'&&text(n).includes('5 / 5 allocated')));
 assert.ok(nodes(tree).some(n=>n.type==='fieldset'&&n.props.disabled));
 assert.ok(text(tree).includes('Lowest feasible cost: prefer on-time routes'));
 button('Coordinate Fleet →').props.onClick();update();assert.ok(text(tree).includes('Result / verified allocation'));
});

test('shipment tracking shows clock-derived checkpoints and simulated completion without a graph',()=>{
 update();nodes(tree).find(n=>n.props?.['aria-label']==='Reset scenario').props.onClick();update();
 openJourney();
 const byLabel=label=>nodes(tree).find(n=>n.props?.['aria-label']===label);
 const seek=value=>{byLabel('journey replay position').props.onChange({target:{value:String(value)}});update();};
 seek(0);assert.ok(text(tree).includes('At Steelworks'));
 seek(.5);assert.ok(text(tree).includes('Traveling to Union Depot'));
 assert.ok(nodes(tree).some(n=>n.props?.className==='tracking-stop is-next'&&text(n).includes('Union Depot')));
 seek(1);assert.ok(text(tree).includes('Simulated delivery complete'));
 assert.ok(nodes(tree).some(n=>n.props?.className==='tracking-stop is-current'&&text(n).includes('Build Site')));
 assert.ok(!nodes(tree).some(n=>n.props?.className==='journey-canvas'||n.props?.className==='spatial-svg'));
 byLabel('Replay journey from start').props.onClick();update();assert.ok(text(tree).includes('At Steelworks'));
});
