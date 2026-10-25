import test from 'node:test';
import assert from 'node:assert/strict';
import {compareFleet,shipments} from '../src/fleet.ts';
import {fleetStory} from '../src/fleetStory.ts';
import {connections,hubs} from '../src/network.ts';
test('bottleneck story uses real independent demand and coordinated reservations',()=>{
 const report=compareFleet(shipments,[],'hours'),story=fleetStory(report);
 assert.equal(story.conflict.demandTonnes,105);assert.equal(story.conflict.capacityTonnes,90);
 assert.equal(story.competing.reduce((n,s)=>n+s.cargoQuantityTonnes,0),story.conflict.demandTonnes);
 assert.equal(story.usage.reservedTonnes,70);
 assert.ok(story.changed.some(a=>a.shipmentId==='RR-2048'));
});
test('story handles every single hub closure and both objectives without stale routes or false success',()=>{
 for(const objective of ['hours','cost'])for(const hub of hubs){
  const report=compareFleet(shipments,[hub.id],objective),story=fleetStory(report);
  for(const a of story.changed){assert.ok(!a.route.ids.includes(hub.id));assert.notEqual(a.route.id,report.independent.find(i=>i.shipmentId===a.shipmentId).route.id);}
  for(const e of report.current.edgeUsage)assert.ok(e.reservedTonnes<=e.capacityTonnes);
  if(story.conflict)assert.equal(story.conflict.capacityTonnes,connections.find(e=>e.id===story.edge.id).capacity);
 }
});
test('fully disconnected and no-conflict reports remain explicit',()=>{
 const report=compareFleet(shipments,hubs.map(h=>h.id));const story=fleetStory(report);
 assert.equal(story.conflict,null);assert.equal(story.edge,null);assert.equal(story.independentMissing,shipments.length);
 assert.equal(story.changed.length,0);assert.equal(report.current.metrics.unallocatedShipmentCount,shipments.length);
});

test('every reported conflict can be inspected without changing allocations',()=>{
 for(const objective of ['hours','cost']){
  const report=compareFleet(shipments,[],objective),before=JSON.stringify(report);
  for(const conflict of report.independentOverbookedEdges){const story=fleetStory(report,conflict.edgeId);assert.equal(story.edge.id,conflict.edgeId);assert.equal(story.usage.edgeId,conflict.edgeId);}
  assert.equal(JSON.stringify(report),before);
 }
});
