import {connections,hubs,validEndpoints,type Connection,type Route} from './network.ts';

export type Shipment={id:string;origin:string;destination:string;cargo:string;cargoQuantityTonnes:number;priority:'critical'|'high'|'normal';deadlineHours:number;status:'planned'|'allocated'|'no-route'|'insufficient-capacity';simulated:true};
export const capacityPolicy={unit:'tonnes',planningWindowHours:48,reservation:'One dispatch cohort; reserve cargo tonnes on every directed segment, without reuse or time-slot scheduling.',costUnit:'USD per shipment booking per segment, independent of cargo quantity.',deadlineUnit:'hours from the shared simulated dispatch at time zero'} as const;
export const shipments:Shipment[]=[
  {id:'RR-2048',origin:'mill',destination:'site',cargo:'Steel coils',cargoQuantityTonnes:35,priority:'high',deadlineHours:36,status:'planned',simulated:true},
  {id:'RR-2049',origin:'rail1',destination:'portC',cargo:'Structural beams',cargoQuantityTonnes:85,priority:'critical',deadlineHours:24,status:'planned',simulated:true},
  {id:'RR-2050',origin:'yard',destination:'depot',cargo:'Industrial plate',cargoQuantityTonnes:70,priority:'high',deadlineHours:18,status:'planned',simulated:true},
  {id:'RR-2051',origin:'portA',destination:'hub',cargo:'Machinery frames',cargoQuantityTonnes:60,priority:'normal',deadlineHours:21,status:'planned',simulated:true},
  {id:'RR-2052',origin:'rail2',destination:'portB',cargo:'Reinforcing steel',cargoQuantityTonnes:55,priority:'normal',deadlineHours:14,status:'planned',simulated:true}
];
export type Candidate=Route&{id:string};
export type Allocation={shipmentId:string;status:Shipment['status'];reason:string;route:Candidate|null;candidates:Candidate[];deadlineViolation:boolean;blockingEdgeIds:string[]};
export type FleetMetrics={shipmentCount:number;routedShipmentCount:number;unallocatedShipmentCount:number;totalRouteCost:number;estimatedDeliveryTimeHours:number|null;totalTransitHours:number;deadlineViolations:number;disruptedShipmentCount:number};
export type FleetPlan={algorithm:string;objective:'hours'|'cost';allocationOrder:string[];allocations:Allocation[];edgeUsage:{edgeId:string;capacityTonnes:number;reservedTonnes:number;remainingTonnes:number}[];metrics:FleetMetrics};
const compareId=(a:string,b:string)=>a<b?-1:a>b?1:0;
const rank={critical:0,high:1,normal:2};
function validateShipments(fleet:Shipment[]){
  if(new Set(fleet.map(s=>s.id)).size!==fleet.length)throw new Error('Duplicate shipment ID');
  for(const s of fleet)if(!s.id||!validEndpoints(s.origin,s.destination)||!Number.isFinite(s.cargoQuantityTonnes)||s.cargoQuantityTonnes<=0||!Number.isFinite(s.deadlineHours)||s.deadlineHours<=0||!(s.priority in rank))throw new Error('Invalid shipment');
}
// Exhaustive simple paths are practical for this ten-hub demo, including directed cycles safely.
// Keep every path: limiting this to independently fastest/cheapest can hide residual-capacity alternatives.
function enumeratePaths(s:Shipment,closed:string[],metric:'hours'|'cost'='hours',graph:Connection[]=connections):Candidate[]{
  const paths:Candidate[]=[];
  if(closed.includes(s.origin)||closed.includes(s.destination))return paths;
  function visit(at:string,ids:string[],edges:Connection[]){
    if(at===s.destination){paths.push({id:edges.map(e=>e.id).join('>'),ids:[...ids],edgeIds:edges.map(e=>e.id),hours:edges.reduce((n,e)=>n+e.hours,0),cost:edges.reduce((n,e)=>n+e.cost,0)});return;}
    for(const e of graph)if(e.from===at&&!closed.includes(e.to)&&!ids.includes(e.to))visit(e.to,[...ids,e.to],[...edges,e]);
  }
  visit(s.origin,[s.origin],[]);
  return paths.sort((a,b)=>a[metric]-b[metric]||a[metric==='hours'?'cost':'hours']-b[metric==='hours'?'cost':'hours']||compareId(a.id,b.id));
}
export function candidateRoutes(s:Shipment,closed:string[],metric:'hours'|'cost'='hours',graph:Connection[]=connections):Candidate[]{
  validateShipments([s]);
  return enumeratePaths(s,closed,metric,graph).filter(r=>r.edgeIds.every(id=>graph.find(e=>e.id===id)!.capacity>=s.cargoQuantityTonnes));
}
export function allocateFleet(fleet:Shipment[],closed:string[],metric:'hours'|'cost'='hours',graph:Connection[]=connections):FleetPlan{
  validateShipments(fleet);
  if(closed.some(id=>!hubs.some(h=>h.id===id)))throw new Error('Unknown disrupted hub');
  if(new Set(graph.map(e=>e.id)).size!==graph.length||graph.some(e=>!Number.isFinite(e.capacity)||e.capacity<0))throw new Error('Invalid edge capacities');
  const remaining=new Map(graph.map(e=>[e.id,e.capacity]));
  const order=[...fleet].sort((a,b)=>rank[a.priority]-rank[b.priority]||a.deadlineHours-b.deadlineHours||compareId(a.id,b.id));
  const allocations:Allocation[]=order.map(s=>{
    const paths=enumeratePaths(s,closed,metric,graph);
    const individual=paths.filter(r=>r.edgeIds.every(id=>graph.find(e=>e.id===id)!.capacity>=s.cargoQuantityTonnes));
    const fits=individual.filter(r=>r.edgeIds.every(id=>remaining.get(id)!>=s.cargoQuantityTonnes));
    // Prefer on-time candidates, then the selected objective. Late allocations remain explicit.
    const route=[...fits].sort((a,b)=>Number(a.hours>s.deadlineHours)-Number(b.hours>s.deadlineHours)||a[metric]-b[metric]||a[metric==='hours'?'cost':'hours']-b[metric==='hours'?'cost':'hours']||compareId(a.id,b.id))[0]??null;
    if(route)for(const id of route.edgeIds)remaining.set(id,remaining.get(id)!-s.cargoQuantityTonnes);
    const status=route?'allocated':paths.length?'insufficient-capacity':'no-route';
    return {shipmentId:s.id,status,reason:route?'Capacity reserved':!paths.length?'No directed path under current disruptions':individual.length?'Shared residual capacity exhausted':'Cargo exceeds edge capacity on every path',route,candidates:individual,deadlineViolation:!!route&&route.hours>s.deadlineHours,blockingEdgeIds:route?[]:[...new Set(paths.flatMap(r=>r.edgeIds.filter(id=>remaining.get(id)!<s.cargoQuantityTonnes)))].sort()};
  });
  const routed=allocations.filter(a=>a.route);
  return {algorithm:'priority-deadline-first-fit-v1 (deterministic heuristic; not globally optimal)',objective:metric,allocationOrder:order.map(s=>s.id),allocations,edgeUsage:graph.map(e=>({edgeId:e.id,capacityTonnes:e.capacity,reservedTonnes:e.capacity-remaining.get(e.id)!,remainingTonnes:remaining.get(e.id)!})),metrics:{shipmentCount:fleet.length,routedShipmentCount:routed.length,unallocatedShipmentCount:fleet.length-routed.length,totalRouteCost:routed.reduce((n,a)=>n+a.route!.cost,0),estimatedDeliveryTimeHours:routed.length?Math.max(...routed.map(a=>a.route!.hours)):null,totalTransitHours:routed.reduce((n,a)=>n+a.route!.hours,0),deadlineViolations:routed.filter(a=>a.deadlineViolation).length,disruptedShipmentCount:closed.length?allocateFleet(fleet,[],metric,graph).allocations.filter(a=>a.route?.ids.some(id=>closed.includes(id))).length:0}};
}
export function compareFleet(fleet:Shipment[],closed:string[],objective:'hours'|'cost'='hours'){
  const baseline=allocateFleet(fleet,[],objective),current=allocateFleet(fleet,closed,objective);
  const matched=current.allocations.flatMap(a=>{const b=baseline.allocations.find(b=>b.shipmentId===a.shipmentId);return a.route&&b?.route?[{shipmentId:a.shipmentId,addedCost:a.route.cost-b.route.cost}]:[];});
  const independent=fleet.map(s=>{const routes=candidateRoutes(s,closed,objective).filter(r=>r.edgeIds.every(id=>connections.find(e=>e.id===id)!.capacity>=s.cargoQuantityTonnes));return {shipmentId:s.id,route:routes[0]??null};});
  const independentOverbookedEdges=connections.flatMap(e=>{const demand=fleet.reduce((n,s)=>n+(independent.find(a=>a.shipmentId===s.id)?.route?.edgeIds.includes(e.id)?s.cargoQuantityTonnes:0),0);return demand>e.capacity?[{edgeId:e.id,demandTonnes:demand,capacityTonnes:e.capacity}]:[];});
  // Compare costs only for shipments routed in BOTH scenarios, never count dropped freight as savings.
  return {capacityPolicy,baseline,current,independent,independentOverbookedEdges,comparison:{matchedShipmentCount:matched.length,totalAddedCost:matched.reduce((n,m)=>n+Math.max(0,m.addedCost),0),netCostChangeForMatchedShipments:matched.reduce((n,m)=>n+m.addedCost,0),matched,newlyUnallocatedShipmentIds:current.allocations.filter(a=>!a.route&&baseline.allocations.some(b=>b.shipmentId===a.shipmentId&&b.route)).map(a=>a.shipmentId)}};
}
export type FleetComparison=ReturnType<typeof compareFleet>;
