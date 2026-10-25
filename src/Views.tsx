import {SpatialNetwork} from './SpatialNetwork';
import {FleetRecovery} from './FleetRecovery';
import {useLayoutEffect,useRef} from 'react';
import {AIAdvisor} from './AIAdvisor';
import {EndpointPlanner} from './EndpointPlanner';
import {ArrowRight} from 'lucide-react';
import {fmt,hubs,type Route} from './network';
import {routeDescription} from './NetworkPanels';
import {type Simulation} from './useSimulation';

export function NetworkUniverse({sim}:{sim:Simulation}){
  return <><EndpointPlanner sim={sim}/><SpatialNetwork sim={sim}/></>;
}
function Comparison({route,label,selected,onSelect}:{route:Route|null;label:string;selected:boolean;onSelect:()=>void}){
  return <button className={`comparison-card ${selected?'chosen':''}`} aria-pressed={selected} onClick={onSelect}><span className="panel-label">{label}</span>{route?<><strong>{route.hours}<small> hours</small></strong><span>${fmt(route.cost)} estimated cost</span><p>{routeDescription(route)}</p></>:<><strong>Unavailable</strong><p>No directed route is available. Change endpoints or restore an unavailable hub.</p></>}<span className="comparison-select">{selected?'Selected objective':'Choose objective'} <ArrowRight size={14}/></span></button>;
}
export function DisruptionLab({sim}:{sim:Simulation}){
  const modeSwitchRequested=useRef(false);
  useLayoutEffect(()=>{sim.setPlanningMode('fleet');},[]);
  useLayoutEffect(()=>{
    if(!modeSwitchRequested.current)return;
    modeSwitchRequested.current=false;
    window.scrollTo({top:0,left:window.scrollX,behavior:'instant'});
  },[sim.planningMode]);
  function changeMode(mode:'single'|'fleet'){
    if(mode===sim.planningMode)return;
    modeSwitchRequested.current=true;
    sim.setPlanningMode(mode);
  }
  const before=sim.previous?.[sim.objective];
  const modeSwitch=<div className="planning-mode" role="group" aria-label="Planning mode"><button aria-pressed={sim.planningMode==='single'} onClick={()=>changeMode('single')}>Single shipment planning</button><button aria-pressed={sim.planningMode==='fleet'} onClick={()=>changeMode('fleet')}>Fleet planning · 5 simulated shipments</button></div>;
  if(sim.planningMode==='fleet')return <>{modeSwitch}<FleetRecovery sim={sim}/></>;
  return <>{modeSwitch}<section className="single-shipment-lab" aria-label="Single shipment planning">
    <div className="single-plan-controls"><EndpointPlanner sim={sim}/><button className="spatial-back" onClick={sim.reset}>Reset experiment</button></div>
    <p className="single-plan-intro">Choose endpoints, select a hub to disrupt, then compare feasible routes and apply your choice.</p>
    <SpatialNetwork sim={sim} lab/>
    <div className="single-plan-comparison"><h2>Compare routes</h2><div className="comparison-grid"><Comparison label="FASTEST FEASIBLE" route={sim.fastest} selected={sim.objective==='hours'} onSelect={()=>sim.setObjective('hours')}/><Comparison label="LOWEST COST" route={sim.cheapest} selected={sim.objective==='cost'} onSelect={()=>sim.setObjective('cost')}/></div></div>
    {sim.previous&&<div className="single-plan-impact" role="status"><span>Last change: {hubs.find(h=>h.id===sim.previous?.hubId)?.label}</span><p>Before <strong>{before?`${before.hours} hrs · $${fmt(before.cost)}`:'No feasible route'}</strong> → After <strong>{sim.active?`${sim.active.hours} hrs · $${fmt(sim.active.cost)}`:'No feasible route'}</strong></p></div>}
    <div className="disruption-chips" aria-label="Active disruptions">{sim.closed.map(id=><button className="disruption-chip" aria-label={`Restore ${hubs.find(h=>h.id===id)?.label}`} key={id} onClick={()=>sim.toggleHub(id)}>{hubs.find(h=>h.id===id)?.label} · Restore</button>)}</div>
    <section className="single-plan-briefing"><h2>Dispatcher’s Briefing — Gemini & ElevenLabs</h2><AIAdvisor sim={sim}/></section>
  </section></>;

}
export {ShipmentJourneys} from './ShipmentJourney';
export {DecisionReplay} from './IncidentReplay';
