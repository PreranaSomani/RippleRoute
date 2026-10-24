import {useMemo,useState} from 'react';
import {canDisrupt,destinationId,findRoute,hubs,originId,toggleDisruption,type Route} from './network';

// The single shipment already present in the original demo.
export const shipment={id:'RR-2048',cargo:'Steel coils',originId,destinationId,simulated:true};
export type DecisionEvent={id:number;kind:'initialized'|'disruption'|'restoration'|'route'|'reset';text:string;time:string;closed:string[];route:Route|null};
export function useSimulation(){
  const [closed,setClosed]=useState<string[]>([]);
  const [selected,setSelected]=useState('portA');
  const [objective,setObjective]=useState<'hours'|'cost'>('hours');
  const [playing,setPlaying]=useState(true);
  const [committed,setCommitted]=useState<Route|null>(null);
  const [selectedShipment,setSelectedShipment]=useState(shipment.id);
  const [history,setHistory]=useState<DecisionEvent[]>([{id:0,kind:'initialized',text:'Network simulation initialized',time:new Date().toISOString(),closed:[],route:null}]);
  const fastest=useMemo(()=>findRoute(originId,destinationId,'hours',closed),[closed]);
  const cheapest=useMemo(()=>findRoute(originId,destinationId,'cost',closed),[closed]);
  const active=objective==='hours'?fastest:cheapest;
  const selectedHub=hubs.find(h=>h.id===selected)!;
  function log(kind:DecisionEvent['kind'],text:string,nextClosed:string[],route:Route|null=null){
    setHistory(events=>[{id:events[0].id+1,kind,text,time:new Date().toISOString(),closed:[...nextClosed],route:route?{...route,ids:[...route.ids],edgeIds:[...route.edgeIds]}:null},...events]);
  }
  function toggleHub(id:string){
    if(!canDisrupt(id))return;
    const was=closed.includes(id),next=toggleDisruption(closed,id);
    setClosed(next);setCommitted(null);
    log(was?'restoration':'disruption',`${hubs.find(h=>h.id===id)!.label} ${was?'restored':'disrupted'} — routes recalculated`,next);
  }
  function applyRoute(){if(!active)return;setCommitted(active);log('route',`${objective==='hours'?'Fastest':'Lowest-cost'} route applied to ${shipment.id}`,closed,active);}
  function reset(){setClosed([]);setSelected('portA');setObjective('hours');setCommitted(null);setPlaying(true);setSelectedShipment(shipment.id);log('reset','Scenario reset to baseline',[]);}
  return {closed,selected,setSelected,selectedHub,objective,setObjective,playing,setPlaying,committed,selectedShipment,setSelectedShipment,history,fastest,cheapest,active,toggleHub,applyRoute,reset};
}
export type Simulation=ReturnType<typeof useSimulation>;
