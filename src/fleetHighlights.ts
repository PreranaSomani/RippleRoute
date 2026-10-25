import type {FleetComparison} from './fleet.ts';

// Selection and reassignment are distinct: following an unchanged shipment is
// never evidence of a reroute. Gold marks only newly assigned directed segments.
export function fleetHighlights(report:FleetComparison,coordinated:boolean,selectedId:string,closed:string[]){
 const selected=coordinated?report.current.allocations.find(a=>a.shipmentId===selectedId)?.route??null:null;
 const safeSelected=selected&&!selected.ids.some(id=>closed.includes(id))?selected:null;
 const active=new Set(coordinated?report.current.allocations.flatMap(a=>a.route?.edgeIds??[]):report.independent.flatMap(a=>a.route?.edgeIds??[]));
 const reassigned=new Map<string,string[]>();
 if(coordinated)for(const allocation of report.current.allocations){
  const before=report.independent.find(a=>a.shipmentId===allocation.shipmentId)?.route;
  if(!before||!allocation.route||allocation.route.ids.some(id=>closed.includes(id)))continue;
  for(const id of allocation.route.edgeIds.filter(id=>!before.edgeIds.includes(id)))reassigned.set(id,[...reassigned.get(id)??[],allocation.shipmentId]);
 }
 return {active,selected:new Set(safeSelected?.edgeIds??[]),selectedId:safeSelected?selectedId:null,reassigned};
}
