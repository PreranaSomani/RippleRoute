import {useMemo,useState} from 'react';
import {compareFleet,shipments,type FleetComparison} from './fleet';
import {usePlayback} from './usePlayback';
import {canDisrupt,destinationId,findRoute,hubs,originId,toggleDisruption,validEndpoints,type Route} from './network';

// Immutable source record. Custom endpoints create a planning scenario, not a new shipment.
export const shipment={id:'RR-2048',cargo:'Steel coils',originId,destinationId,simulated:true} as const;
export type DecisionEvent={id:number;kind:'initialized'|'disruption'|'restoration'|'route'|'reset'|'endpoints'|'fleet';text:string;time:string;closed:string[];route:Route|null;beforeRoute?:Route|null;afterRoute?:Route|null;hubId?:string;objective?:'hours'|'cost';origin?:string;destination?:string;context?:string;fleet?:FleetComparison};
const copyRoute=(route:Route|null)=>route?{...route,ids:[...route.ids],edgeIds:[...route.edgeIds]}:null;
export function useSimulation(view='network'){
  const [origin,setOrigin]=useState<string>(originId);
  const [destination,setDestination]=useState<string>(destinationId);
  const [planningMode,setPlanningMode]=useState<'single'|'fleet'>('single');
  const [fleetRun,setFleetRun]=useState<{signature:string;report:FleetComparison}|null>(null);
  const [closed,setClosed]=useState<string[]>([]);
  const [selected,setSelected]=useState('portA');
  const [objective,setObjective]=useState<'hours'|'cost'>('hours');
  const [previous,setPrevious]=useState<{hours:Route|null;cost:Route|null;hubId:string}|null>(null);
  const [committed,setCommitted]=useState<Route|null>(null);
  const [selectedShipment,setSelectedShipment]=useState<string>(shipment.id);
  const [history,setHistory]=useState<DecisionEvent[]>([{id:0,kind:'initialized',text:'Network simulation initialized',time:new Date().toISOString(),closed:[],route:null}]);
  const fastest=useMemo(()=>findRoute(origin,destination,'hours',closed),[origin,destination,closed]);
  const cheapest=useMemo(()=>findRoute(origin,destination,'cost',closed),[origin,destination,closed]);
  const fleetSignature=JSON.stringify({closed:[...closed].sort(),objective});
  const currentFleet=fleetRun?.signature===fleetSignature?fleetRun.report:null;
  function optimizeFleet(){const report=compareFleet(shipments,closed,objective);setFleetRun({signature:fleetSignature,report});log('fleet',`Fleet baseline allocated ${report.current.metrics.routedShipmentCount} of ${shipments.length} simulated shipments`,closed,{context:'Fictional fleet',fleet:report});}
  const active=objective==='hours'?fastest:cheapest;
  const selectedHub=hubs.find(h=>h.id===selected)!;
  const isDemo=origin===shipment.originId&&destination===shipment.destinationId;
  const context=isDemo?shipment.id:'Custom plan';
  const routeKey=`${origin}|${destination}|${active?.edgeIds.join('|')??'no-route'}`;
  const networkPlayback=usePlayback(active?1:0,routeKey,.005,90,true,true,view==='network'||view==='lab');
  const journeyRoute=committed??active;
  const journeyKey=`${origin}|${destination}|${journeyRoute?.edgeIds.join('|')??'no-route'}`;
  const journeyPlayback=usePlayback(journeyRoute?1:0,journeyKey,.004,100,true,true,view==='journeys');
  const incidentPlayback=usePlayback(Math.max(0,history.filter(e=>e.kind!=='initialized'&&e.kind!=='reset').length-1),String(history.length),1,4200,false,true,view==='replay');
  const playing=networkPlayback.running;
  const setPlaying=()=>networkPlayback.toggle();
  function pauseReplays(){networkPlayback.pause();journeyPlayback.pause();incidentPlayback.pause();}
  function log(kind:DecisionEvent['kind'],text:string,nextClosed:string[],extra:Partial<DecisionEvent>={}){
    setHistory(events=>[{id:(events[0]?.id??-1)+1,kind,text,time:new Date().toISOString(),closed:[...nextClosed],objective,origin,destination,context,route:null,...extra},...events]);
  }
  function changeEndpoints(from:string,to:string){
    if(!validEndpoints(from,to)||from===origin&&to===destination)return false;
    const nextContext=from===originId&&to===destinationId?shipment.id:'Custom plan';
    log('endpoints',`Planning endpoints changed: ${hubs.find(h=>h.id===from)!.label} → ${hubs.find(h=>h.id===to)!.label}`,closed,{origin:from,destination:to,context:nextContext,beforeRoute:copyRoute(active),afterRoute:copyRoute(findRoute(from,to,objective,closed))});
    setOrigin(from);setDestination(to);setSelected(from);setCommitted(null);setPrevious(null);setSelectedShipment(nextContext);
    journeyPlayback.restart();networkPlayback.restart();
    return true;
  }
  function toggleHub(id:string){
    if(!closed.includes(id)&&!canDisrupt(id,origin,destination))return;
    const was=closed.includes(id),next=toggleDisruption(closed,id,origin,destination);
    setPrevious({hours:fastest,cost:cheapest,hubId:id});setSelected(id);setClosed(next);setCommitted(null);
    log(was?'restoration':'disruption',`${hubs.find(h=>h.id===id)!.label} ${was?'restored':'disrupted'} — routes recalculated`,next,{hubId:id,beforeRoute:copyRoute(active),afterRoute:copyRoute(findRoute(origin,destination,objective,next))});
  }
  function applyRoute(){
    if(!active)return;
    setCommitted(copyRoute(active));
    log('route',`${objective==='hours'?'Fastest':'Lowest-cost'} route applied to ${context}`,closed,{route:copyRoute(active),beforeRoute:copyRoute(committed),afterRoute:copyRoute(active)});
  }
  function reset(){
    setPlanningMode('single');setFleetRun(null);setOrigin(originId);setDestination(destinationId);setClosed([]);setSelected('portA');setObjective('hours');setCommitted(null);
    networkPlayback.restart();networkPlayback.resume();journeyPlayback.restart();incidentPlayback.restart();setPrevious(null);setSelectedShipment(shipment.id);
    // Repeated resets at baseline do not add duplicate events.
    if(closed.length||!isDemo||committed||objective!=='hours'||fleetRun)log('reset','Scenario reset to baseline',[],{origin:originId,destination:destinationId,context:shipment.id});
  }
  return {planningMode,setPlanningMode,currentFleet,fleetRun,optimizeFleet,origin,destination,isDemo,context,changeEndpoints,previous,networkPlayback,journeyPlayback,incidentPlayback,pauseReplays,closed,selected,setSelected,selectedHub,objective,setObjective,playing,setPlaying,committed,selectedShipment,setSelectedShipment,history,fastest,cheapest,active,toggleHub,applyRoute,reset};
}
export type Simulation=ReturnType<typeof useSimulation>;
