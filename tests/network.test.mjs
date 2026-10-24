import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/network.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {hubs,connections,findRoute,canDisrupt,toggleDisruption,validEndpoints}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const eligible=hubs.filter(h=>canDisrupt(h.id));
function enumerate(at,closed,visited=new Set()){
  if(at==='site')return [{hours:0,cost:0}];
  if(closed.includes(at)||visited.has(at))return [];
  return connections.filter(e=>e.from===at&&e.capacity>=35&&!closed.includes(e.to)).flatMap(e=>enumerate(e.to,closed,new Set([...visited,at])).map(r=>({hours:e.hours+r.hours,cost:e.cost+r.cost})));
}
test('all eight intermediate hubs can be disrupted and independently restored; endpoints are protected',()=>{
  assert.equal(eligible.length,8);
  let closed=[];
  for(const h of eligible){closed=toggleDisruption(closed,h.id);assert.ok(closed.includes(h.id));}
  for(const id of ['mill','site','unknown'])assert.deepEqual(toggleDisruption(closed,id),closed);
  for(const h of eligible){closed=toggleDisruption(closed,h.id);assert.ok(!closed.includes(h.id));}
  assert.deepEqual(closed,[]);
});
test('fastest and cheapest routes match exhaustive directed paths for every combination of disruptions',()=>{
  for(let mask=0;mask<2**eligible.length;mask++){
    const closed=eligible.filter((_,i)=>mask&(1<<i)).map(h=>h.id);
    const paths=enumerate('mill',closed);
    for(const metric of ['hours','cost']){
      const route=findRoute('mill','site',metric,closed);
      if(!paths.length){assert.equal(route,null);continue;}
      assert.equal(route[metric],Math.min(...paths.map(p=>p[metric])));
      assert.ok(route.ids.every(id=>!closed.includes(id)));
      assert.equal(route.edgeIds.length,route.ids.length-1);
      for(let i=0;i<route.edgeIds.length;i++){
        const edge=connections.find(e=>e.id===route.edgeIds[i]);
        assert.equal(edge.from,route.ids[i]);assert.equal(edge.to,route.ids[i+1]);
      }
    }
  }
});
test('directed semantics, invalid inputs, capacity, no route, and baseline restoration',()=>{
  assert.equal(findRoute('site','mill','hours',[]),null);
  assert.equal(findRoute('unknown','site','hours',[]),null);
  assert.equal(findRoute('mill','site','hours',['mill']),null);
  assert.equal(findRoute('mill','site','hours',['site']),null);
  assert.equal(findRoute('mill','site','hours',[],121),null);
  assert.equal(findRoute('mill','site','hours',['rail1','yard']),null);
  const baseline=findRoute('mill','site','hours',[]);
  assert.equal(baseline.hours,35);
  assert.equal(findRoute('mill','site','cost',[]).cost,1570);
  for(const id of ['rail1','rail2','depot']){
    const closed=toggleDisruption([],id);
    assert.ok(!findRoute('mill','site','hours',closed)?.ids.includes(id));
    assert.deepEqual(findRoute('mill','site','hours',toggleDisruption(closed,id)),baseline);
  }
});


test('arbitrary directed endpoint pairs, active endpoint protection, and identical-pair rejection',()=>{
  assert.equal(validEndpoints('portA','site'),true);
  assert.equal(validEndpoints('portA','portA'),false);
  assert.equal(validEndpoints('missing','site'),false);
  assert.equal(findRoute('portA','portA','hours',[]),null);
  assert.equal(findRoute('portA','site','hours',[]).hours,19);
  assert.equal(findRoute('site','portA','hours',[]),null);
  assert.equal(findRoute('rail1','site','hours',['rail1']),null);
  assert.equal(canDisrupt('rail1','rail1','portB'),false);
  assert.equal(canDisrupt('mill','rail1','portB'),true);
  assert.deepEqual(toggleDisruption([],'rail1','rail1','portB'),[]);
  assert.deepEqual(toggleDisruption(['rail1'],'rail1','rail1','portB'),[]);
});
