import {hubs,connections} from './network.ts';
import type {FleetComparison,Shipment} from './fleet.ts';
import type {Route} from './network.ts';
type BriefingInput={objective:string;disruptedHubIds:string[];mode?:string;report?:FleetComparison;shipments?:Shipment[];options:(Route&{id:string})[]};
const name=(id:string)=>hubs.find(h=>h.id===id)?.label??id;
const path=(r:Route)=>r.ids.map(name).join(', then ');
// A deterministic dispatch from computed facts; no model-generated numeric claims.
// The server MUST validate/recompute the input before calling this function.
export function briefingText(data:BriefingInput){
  const lines=['RippleRoute simulated dispatch.',data.disruptedHubIds.length?`Unavailable hubs: ${data.disruptedHubIds.map(name).join(', ')}.`:'No hubs are disrupted.'];
  if(data.mode==='fleet'&&data.report&&data.shipments){
    const report=data.report,plan=report.current;
    lines.push(`The ${data.objective==='hours'?'fastest feasible':'lowest feasible cost'} fleet plan allocates ${plan.metrics.routedShipmentCount} of ${plan.metrics.shipmentCount} shipments.`);
    const conflict=report.independentOverbookedEdges.slice().sort((a,b)=>(b.demandTonnes-b.capacityTonnes)-(a.demandTonnes-a.capacityTonnes))[0];
    if(conflict){const edge=connections.find(e=>e.id===conflict.edgeId)!;const held=plan.edgeUsage.find(e=>e.edgeId===edge.id)!;
      lines.push(`Independent demand on ${name(edge.from)} to ${name(edge.to)} is ${conflict.demandTonnes} tonnes against ${conflict.capacityTonnes} tonnes capacity, an overload of ${conflict.demandTonnes-conflict.capacityTonnes} tonnes. Coordinated allocation reserves ${held.reservedTonnes} tonnes, leaving ${held.remainingTonnes} tonnes available.`);
    }else lines.push('Independent routes have no shared capacity overload.');
    const changed=plan.allocations.filter(a=>{const before=report.independent.find(i=>i.shipmentId===a.shipmentId)?.route;return a.route&&before&&a.route.id!==before.id;});
    for(const a of changed)lines.push(`${a.shipmentId} is reassigned via ${path(a.route!)}.`);
    for(const a of plan.allocations.filter(a=>!a.route))lines.push(`${a.shipmentId} remains unallocated. ${a.reason}.`);
    lines.push(`${plan.metrics.deadlineViolations} deadline violations. This is a deterministic allocation, not a guaranteed global optimum.`);
  }else{
    const route=data.options.find(r=>r.id===(data.objective==='hours'?'fastest':'cheapest'));
    lines.push(route?`The ${data.objective==='hours'?'fastest feasible':'lowest cost'} option runs via ${path(route)}, taking ${route.hours} hours at a booking cost of ${route.cost} US dollars. This briefing does not apply the route.`:'No directed route is currently feasible. Restore an unavailable hub or change endpoints to explore alternatives.');
  }
  return lines.join(' ');
}
