import {connections} from './network.ts';
import {shipments,type FleetComparison} from './fleet.ts';

// Presentation derived exclusively from the existing allocator report.
export function fleetStory(report:FleetComparison,edgeId?:string){
  const conflicts=report.independentOverbookedEdges;
  const conflict=conflicts.find(c=>c.edgeId===edgeId)??[...conflicts].sort((a,b)=>(b.demandTonnes-b.capacityTonnes)-(a.demandTonnes-a.capacityTonnes))[0]??null;
  const edge=connections.find(e=>e.id===conflict?.edgeId)??null;
  const competing=shipments.filter(s=>report.independent.find(a=>a.shipmentId===s.id)?.route?.edgeIds.includes(edge?.id??''));
  const changed=report.current.allocations.filter(a=>a.route&&report.independent.find(i=>i.shipmentId===a.shipmentId)?.route&&a.route.id!==report.independent.find(i=>i.shipmentId===a.shipmentId)!.route!.id);
  const usage=report.current.edgeUsage.find(e=>e.edgeId===edge?.id)??null;
  const independentMissing=report.independent.filter(a=>!a.route).length;
  return {conflicts,conflict,edge,competing,changed,usage,independentMissing};
}
