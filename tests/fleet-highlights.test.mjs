import test from 'node:test';
import assert from 'node:assert/strict';
import {compareFleet,shipments} from '../src/fleet.ts';
import {fleetHighlights} from '../src/fleetHighlights.ts';
test('independent plans never claim reassignment or shipment selection',()=>{
 const report=compareFleet(shipments,[]),h=fleetHighlights(report,false,'RR-2048',[]);
 assert.equal(h.reassigned.size,0);assert.equal(h.selectedId,null);
 assert.deepEqual([...h.active].sort(),[...new Set(report.independent.flatMap(a=>a.route?.edgeIds??[]))].sort());
});
test('gold marks only actual newly assigned directed segments, not the entire selected route',()=>{
 const report=compareFleet(shipments,[]),h=fleetHighlights(report,true,'RR-2048',[]);
 const before=report.independent.find(a=>a.shipmentId==='RR-2048').route;
 const after=report.current.allocations.find(a=>a.shipmentId==='RR-2048').route;
 assert.equal(h.selectedId,'RR-2048');assert.deepEqual([...h.selected],after.edgeIds);
 assert.ok(h.reassigned.size>0);
 for(const [id,ids] of h.reassigned){assert.ok(after.edgeIds.includes(id));assert.ok(!before.edgeIds.includes(id));assert.deepEqual(ids,['RR-2048']);}
 const unchanged=fleetHighlights(report,true,'RR-2050',[]);
 assert.equal(unchanged.selectedId,'RR-2050');
 assert.ok([...unchanged.reassigned.values()].every(ids=>!ids.includes('RR-2050')));
});
test('closed-hub routes and no-route shipments cannot become selected highlights',()=>{
 for(const closed of [['rail2'],['depot'],['rail1','yard']]){
  const report=compareFleet(shipments,closed);
  for(const s of shipments){const h=fleetHighlights(report,true,s.id,closed),a=report.current.allocations.find(a=>a.shipmentId===s.id);if(!a.route)assert.equal(h.selectedId,null);else assert.deepEqual([...h.selected],a.route.edgeIds);}
 }
 const stale=compareFleet(shipments,[]);assert.equal(fleetHighlights(stale,true,'RR-2048',['portA']).selectedId,null);
});
