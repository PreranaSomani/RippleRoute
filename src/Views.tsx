import {FleetWorkspace} from './FleetWorkspace';
import {AIAdvisor} from './AIAdvisor';
import {EndpointPlanner} from './EndpointPlanner';
import {ArrowRight} from 'lucide-react';
import {canDisrupt,fmt,hubs,type Route} from './network';
import {HubInspector,NetworkMap,RoutingPanel,routeDescription} from './NetworkPanels';
import {type Simulation} from './useSimulation';

export function NetworkUniverse({sim}:{sim:Simulation}){
  return <><EndpointPlanner sim={sim}/><section className="universe-scene" aria-label="Network Universe"><NetworkMap sim={sim}/><aside className="universe-inspector"><HubInspector sim={sim}/><RoutingPanel sim={sim}/></aside></section></>;
}
function Comparison({route,label,selected,onSelect}:{route:Route|null;label:string;selected:boolean;onSelect:()=>void}){
  return <button className={`comparison-card ${selected?'chosen':''}`} aria-pressed={selected} onClick={onSelect}><span className="panel-label">{label}</span>{route?<><strong>{route.hours}<small> hours</small></strong><span>${fmt(route.cost)} estimated cost</span><p>{routeDescription(route)}</p></>:<><strong>Unavailable</strong><p>No directed route is available. Change endpoints or restore an unavailable hub.</p></>}<span className="comparison-select">{selected?'Selected objective':'Choose objective'} <ArrowRight size={14}/></span></button>;
}
export function DisruptionLab({sim}:{sim:Simulation}){
  const before=sim.previous?.[sim.objective];
  const modeSwitch=<div className="planning-mode" role="group" aria-label="Planning mode"><button aria-pressed={sim.planningMode==='single'} onClick={()=>sim.setPlanningMode('single')}>Single shipment planning</button><button aria-pressed={sim.planningMode==='fleet'} onClick={()=>sim.setPlanningMode('fleet')}>Fleet planning · 5 simulated shipments</button></div>;
  if(sim.planningMode==='fleet')return <>{modeSwitch}<FleetWorkspace sim={sim}/>{sim.currentFleet&&<AIAdvisor sim={sim}/>}</>;
  return <>{modeSwitch}<EndpointPlanner sim={sim}/><section className="lab-workspace" aria-label="Disruption Lab">
    <div className="lab-map"><NetworkMap sim={sim}/><div className="lab-impact" role="status"><span className="eyebrow">{sim.previous?`LAST CHANGE / ${hubs.find(h=>h.id===sim.previous?.hubId)?.label}`:'START AN EXPERIMENT'}</span>{sim.previous?<div><span>Before <strong>{before?`${before.hours} hrs · $${fmt(before.cost)}`:'No feasible route'}</strong></span><ArrowRight size={20}/><span>After <strong>{sim.active?`${sim.active.hours} hrs · $${fmt(sim.active.cost)}`:'No feasible route'}</strong></span></div>:<p>Select a hub on the map, then disrupt it to compare actual route outcomes.</p>}</div></div>
    <aside className="lab-console"><div className="lab-picker"><label htmlFor="lab-hub">Experiment hub</label><select id="lab-hub" value={sim.selected} onChange={e=>sim.setSelected(e.target.value)}>{hubs.map(h=><option key={h.id} value={h.id}>{h.label}{canDisrupt(h.id,sim.origin,sim.destination)?sim.closed.includes(h.id)?' — disrupted':'':' — protected'}</option>)}</select></div><HubInspector sim={sim}/><div className="comparison-grid"><Comparison label="FASTEST FEASIBLE" route={sim.fastest} selected={sim.objective==='hours'} onSelect={()=>sim.setObjective('hours')}/><Comparison label="LOWEST COST" route={sim.cheapest} selected={sim.objective==='cost'} onSelect={()=>sim.setObjective('cost')}/></div><div className="lab-actions"><button className="button primary" onClick={sim.applyRoute} disabled={!sim.active}>Apply this route <ArrowRight size={16}/></button><button className="button subtle" onClick={sim.reset}>Reset experiment</button></div><div className="disruption-chips" aria-label="Active disruptions">{sim.closed.map(id=><button className="disruption-chip" aria-label={`Restore ${hubs.find(h=>h.id===id)?.label}`} key={id} onClick={()=>sim.toggleHub(id)}>{hubs.find(h=>h.id===id)?.label} · Restore</button>)}</div></aside>
  </section><AIAdvisor sim={sim}/></>;
}
export {ShipmentJourneys} from './ShipmentJourney';
export {DecisionReplay} from './IncidentReplay';
