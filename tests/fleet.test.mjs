import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateFleet,candidateRoutes,compareFleet,shipments,capacityPolicy} from '../src/fleet.ts';
import {connections,findRoute} from '../src/network.ts';
const one=(overrides={})=>({...shipments[0],...overrides});
function assertReservations(plan,fleet,graph=connections){
  for(const edge of plan.edgeUsage){
    const actual=plan.allocations.reduce((n,a)=>n+(a.route?.edgeIds.includes(edge.edgeId)?fleet.find(s=>s.id===a.shipmentId).cargoQuantityTonnes:0),0);
    assert.equal(edge.reservedTonnes,actual);assert.ok(actual<=edge.capacityTonnes);assert.equal(edge.remainingTonnes,edge.capacityTonnes-actual);
    assert.equal(edge.capacityTonnes,graph.find(e=>e.id===edge.edgeId).capacity);
  }
}
test('five typed fictional records retain the original shipment and explicit capacity units',()=>{
  assert.equal(shipments.length,5);assert.equal(new Set(shipments.map(s=>s.id)).size,5);
  assert.equal(shipments[0].id,'RR-2048');assert.equal(shipments[0].origin,'mill');assert.equal(shipments[0].destination,'site');
  assert.ok(shipments.every(s=>s.simulated&&s.cargoQuantityTonnes>0&&s.deadlineHours>0));assert.equal(capacityPolicy.unit,'tonnes');
});
test('individual candidates are distinct directed feasible paths and preserve single-plan Dijkstra behavior',()=>{
  const s=shipments[0],candidates=candidateRoutes(s,[]);
  assert.ok(candidates.length>=2);assert.equal(new Set(candidates.map(r=>r.id)).size,candidates.length);
  assert.equal(candidates[0].hours,findRoute(s.origin,s.destination,'hours',[],s.cargoQuantityTonnes).hours);
  for(const r of candidates){assert.equal(r.ids[0],s.origin);assert.equal(r.ids.at(-1),s.destination);r.edgeIds.forEach((id,i)=>{const e=connections.find(e=>e.id===id);assert.equal(e.from,r.ids[i]);assert.equal(e.to,r.ids[i+1]);assert.ok(e.capacity>=s.cargoQuantityTonnes);});}
});
test('independent plans can overbook while shared allocation reserves feasible alternatives',()=>{
  const report=compareFleet(shipments,[]);
  assert.ok(report.independentOverbookedEdges.some(e=>e.edgeId==='rail2-depot'&&e.demandTonnes>e.capacityTonnes));
  assert.equal(report.current.metrics.routedShipmentCount,5);assertReservations(report.current,shipments);
  assert.ok(report.current.allocations.some(a=>a.route.id!==report.independent.find(i=>i.shipmentId===a.shipmentId).route.id));
});
test('priority wins contention, then deadline and stable ID break ties without overbooking',()=>{
  const low=one({id:'low',origin:'rail2',destination:'portB',cargoQuantityTonnes:60,priority:'normal',deadlineHours:12});
  const high=one({...low,id:'high',priority:'critical',deadlineHours:30});
  const plan=allocateFleet([low,high],[]);
  assert.deepEqual(plan.allocationOrder,['high','low']);assert.equal(plan.allocations[0].status,'allocated');assert.equal(plan.allocations[1].status,'insufficient-capacity');assertReservations(plan,[low,high]);
  assert.deepEqual(allocateFleet([one({...low,id:'z',deadlineHours:15}),one({...low,id:'b',deadlineHours:12}),one({...low,id:'a',deadlineHours:12})],[]).allocationOrder,['a','b','z']);
});
test('no-route, individual capacity failure and shared capacity exhaustion are distinct',()=>{
  const oversized=one({origin:'rail2',destination:'portB',cargoQuantityTonnes:100});
  const capacity=allocateFleet([oversized],[]).allocations[0];assert.equal(capacity.status,'insufficient-capacity');assert.ok(capacity.reason.includes('Cargo exceeds'));
  assert.equal(allocateFleet([oversized],['portB']).allocations[0].status,'no-route');
  assert.equal(allocateFleet([one({origin:'site',destination:'mill'})],[]).allocations[0].status,'no-route');
});
test('disruptions invalidate incident paths, preserve capacity, and report affected baseline allocations',()=>{
  const report=compareFleet(shipments,['rail1','depot']);
  assert.ok(report.current.metrics.disruptedShipmentCount>0);
  for(const a of report.current.allocations)assert.ok(!a.route?.ids.some(id=>['rail1','depot'].includes(id)));
  assertReservations(report.current,shipments);
  assert.equal(report.comparison.totalAddedCost,report.comparison.matched.reduce((n,m)=>n+Math.max(0,m.addedCost),0));
  assert.ok(report.comparison.matchedShipmentCount<shipments.length);
});
test('identical inputs and reordered records yield reproducible plans; inputs remain unchanged',()=>{
  const before=JSON.stringify(shipments);
  assert.deepEqual(compareFleet(shipments,['portA']),compareFleet(shipments,['portA']));
  assert.deepEqual(allocateFleet(shipments,[]),allocateFleet([...shipments].reverse(),[]));
  assert.equal(JSON.stringify(shipments),before);
  assert.throws(()=>allocateFleet([one({cargoQuantityTonnes:-1})],[]));assert.throws(()=>allocateFleet([one(),one()],[]));
});
test('metrics equal allocated route totals and deadline misses are explicit',()=>{
  const s=one({deadlineHours:1}),plan=allocateFleet([s],[]);
  assert.equal(plan.metrics.deadlineViolations,1);assert.equal(plan.allocations[0].deadlineViolation,true);
  assert.equal(plan.metrics.totalRouteCost,plan.allocations[0].route.cost);
  assert.equal(plan.metrics.estimatedDeliveryTimeHours,plan.allocations[0].route.hours);
  const empty=allocateFleet([s],['mill']);assert.equal(empty.metrics.totalRouteCost,0);assert.equal(empty.metrics.estimatedDeliveryTimeHours,null);assert.equal(empty.metrics.deadlineViolations,0);
});

test('all intermediate disruption combinations preserve reservations and never route through closed hubs',()=>{
  const ids=['rail1','portA','rail2','portB','depot','portC','yard','hub'];
  for(let mask=0;mask<2**ids.length;mask++){
    const closed=ids.filter((_,i)=>mask&(1<<i));
    const plan=allocateFleet(shipments,closed);
    assertReservations(plan,shipments);
    for(const a of plan.allocations)assert.ok(!a.route?.ids.some(id=>closed.includes(id)));
  }
});
