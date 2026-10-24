import {useMemo,useState} from 'react';
import {usePlayback} from './usePlayback';
import {canDisrupt,destinationId,findRoute,hubs,originId,toggleDisruption,type Route} from './network';

// The single shipment already present in the original demo.
export const shipment={id:'RR-2048',cargo:'Steel coils',originId,destinationId,simulated:true};
export type DecisionEvent={id:number;kind:'initialized'|'disruption'|'restoration'|'route'|'reset';text:string;time:string;closed:string[];route:Route|null;hubId?:string;objective?:'hours'|'cost'};
export function useSimulation(){
  const [closed,setClosed]=useState<string[]>([]);
  const [selected,setSelected]=useState('portA');
  const [objective,setObjective]=useState<'hours'|'cost'>('hours');
  const [previous,setPrevious]=useState<{hours:Route|null;cost:Route|null;hubId:string}|null>(null);
  const [committed,setCommitted]=useState<Route|null>(null);
  const [selectedShipment,setSelectedShipment]=useState(shipment.id);
  const [replayHub,setReplayHub]=useState<{eventId:number;id:string}|null>(null);
  const [history,setHistory]=useState<DecisionEvent[]>([{id:0,kind:'initialized',text:'Network simulation initialized',time:new Date().toISOString(),closed:[],route:null}]);
  const fastest=useMemo(()=>findRoute(originId,destinationId,'hours',closed),[closed]);
  const cheapest=useMemo(()=>findRoute(originId,destinationId,'cost',closed),[closed]);
  const active=objective==='hours'?fastest:cheapest;
  const selectedHub=hubs.find(h=>h.id===selected)!;
  const routeKey=active?.edgeIds.join('|')??'no-route';
  const networkPlayback=usePlayback(active?1:0,routeKey,.01,180,true,true);
  const journeyRoute=committed??active;
  const journeyPlayback=usePlayback(journeyRoute?1:0,journeyRoute?.edgeIds.join('|')??'no-route',.01,250);
  const incidentPlayback=usePlayback(Math.max(0,history.length-1),String(history.length),1,1800);
  const playing=networkPlayback.running;
  const setPlaying=()=>networkPlayback.toggle();
  function pauseReplays(){networkPlayback.pause();journeyPlayback.pause();incidentPlayback.pause();}
  function log(kind:DecisionEvent['kind'],text:string,nextClosed:string[],route:Route|null=null,hubId?:string){
    setHistory(events=>[{id:(events[0]?.id??-1)+1,kind,text,time:new Date().toISOString(),closed:[...nextClosed],hubId,objective,route:route?{...route,ids:[...route.ids],edgeIds:[...route.edgeIds]}:null},...events]);
  }
  function toggleHub(id:string){
    if(!canDisrupt(id))return;
    const was=closed.includes(id),next=toggleDisruption(closed,id);
    setPrevious({hours:fastest,cost:cheapest,hubId:id});setSelected(id);setClosed(next);setCommitted(null);
    log(was?'restoration':'disruption',`${hubs.find(h=>h.id===id)!.label} ${was?'restored':'disrupted'} — routes recalculated`,next,null,id);
  }
  function applyRoute(){if(!active)return;setCommitted(active);log('route',`${objective==='hours'?'Fastest':'Lowest-cost'} route applied to ${shipment.id}`,closed,active);}
  function reset(){setReplayHub(null);setClosed([]);setSelected('portA');setObjective('hours');setCommitted(null);networkPlayback.restart();networkPlayback.resume();journeyPlayback.restart();incidentPlayback.restart();setPrevious(null);setSelectedShipment(shipment.id);log('reset','Scenario reset to baseline',[]);}
  return {replayHub,setReplayHub,previous,networkPlayback,journeyPlayback,incidentPlayback,pauseReplays,closed,selected,setSelected,selectedHub,objective,setObjective,playing,setPlaying,committed,selectedShipment,setSelectedShipment,history,fastest,cheapest,active,toggleHub,applyRoute,reset};
}
export type Simulation=ReturnType<typeof useSimulation>;
