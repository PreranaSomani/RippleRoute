import test from 'node:test';
import assert from 'node:assert/strict';
import {findRoute,connections} from '../src/network.ts';
import {trackingCheckpoints} from '../src/journeyTracking.ts';
test('tracking transitions at actual cumulative segment durations',()=>{
 const route=findRoute('mill','site','hours',[]);
 let elapsed=0;
 for(let i=0;i<route.ids.length;i++){
  if(i)elapsed+=connections.find(e=>e.id===route.edgeIds[i-1]).hours;
  const stops=trackingCheckpoints(route,elapsed);
  assert.equal(stops.find(s=>s.state==='current').id,route.ids[i]);
  assert.equal(stops[i].hours,elapsed);
  assert.equal(stops.filter(s=>s.state==='completed').length,i);
  if(i<route.ids.length-1){assert.equal(stops[i+1].state,'next');assert.equal(trackingCheckpoints(route,elapsed+.1).find(s=>s.state==='current').id,route.ids[i]);}
 }
 assert.equal(elapsed,route.hours);
});
test('timeline follows the actual reroute and has exactly one current checkpoint',()=>{
 for(const objective of ['hours','cost'])for(const closed of [[],['rail2'],['yard']]){
  const route=findRoute('mill','site',objective,closed);
  for(const elapsed of [0,route.hours/2,route.hours]){
   const stops=trackingCheckpoints(route,elapsed);
   assert.deepEqual(stops.map(s=>s.id),route.ids);
   assert.equal(stops.filter(s=>s.state==='current').length,1);
   assert.ok(!stops.some(s=>closed.includes(s.id)));
  }
 }
});
