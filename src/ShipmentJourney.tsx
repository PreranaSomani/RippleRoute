import {ArrowRight,Package,ShieldAlert,Truck} from 'lucide-react';
import {connections,fmt,hubs} from './network';
import {PlaybackControls} from './PlaybackControls';
import {checkpointProgress,routePosition,segmentMode} from './replay';
import {shipment,type Simulation} from './useSimulation';

export function ShipmentJourneys({sim,onInspect}:{sim:Simulation;onInspect:()=>void}){
  const route=sim.committed??sim.active;
  const playback=sim.journeyPlayback;
  const marker=routePosition(route,playback.position);
  const checkpoint=route?.ids.includes(sim.selected)?sim.selected:route?.ids[0];
  const index=route?.ids.indexOf(checkpoint??'')??0;
  const hub=hubs.find(h=>h.id===checkpoint);
  const edge=route?connections.find(e=>e.id===route.edgeIds[index]):undefined;
  const point=(i:number)=>({x:85+i*(830/Math.max(1,(route?.ids.length??2)-1)),y:i%2?220:150});
  const a=point(marker?.index??0),b=point((marker?.index??0)+1);
  function select(id:string,i:number){sim.setSelected(id);if(route)playback.seek(checkpointProgress(route,i));}
  return <section className="journey-experience" aria-label="Shipment Journeys">
    <div className="journey-scene glass-panel"><header className="journey-heading"><div><div className="eyebrow">DEMO REPLAY / RR-2048</div><h2>Steelworks <ArrowRight size={24}/> Build Site</h2><p className="view-copy">Steel coils · SIMULATED RECORD · No live GPS tracking</p></div><span className={`journey-status ${!route?'blocked':''}`}>{!route?'Awaiting connectivity':sim.committed?'Route applied':'Route preview'}</span></header>
    {route?<><div className="journey-totals"><div><small>PLANNED TRAVEL</small><strong>{route.hours} hrs</strong></div><div><small>ESTIMATED COST</small><strong>${fmt(route.cost)}</strong></div><div><small>ROUTE SEGMENTS</small><strong>{route.edgeIds.length}</strong><span className="segment-explanation">One segment is one directed connection between consecutive hubs.</span></div></div>
    <svg className="journey-canvas" viewBox="0 0 1000 350" role="group" aria-label="Interactive simulated shipment journey">
      {route.edgeIds.map((id,i)=>{const from=point(i),to=point(i+1);const edge=connections.find(e=>e.id===id)!;return <g key={id}><path d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} stroke="#9bd5e9" strokeWidth="5" fill="none"/><text x={(from.x+to.x)/2} y={(from.y+to.y)/2+32} textAnchor="middle" fontSize="13" fill="#426c89">{edge.hours} hrs · ${fmt(edge.cost)}</text></g>;})}
      {route.ids.map((id,i)=>{const p=point(i),h=hubs.find(h=>h.id===id)!;return <g key={id} role="button" tabIndex={0} aria-label={`Journey checkpoint ${h.label}`} aria-pressed={checkpoint===id} onClick={()=>select(id,i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(id,i);}}}><circle cx={p.x} cy={p.y} r="32" fill="transparent"/><circle cx={p.x} cy={p.y} r="23" fill={checkpoint===id?'#238BCE':'#f8fdff'} stroke="#238BCE" strokeWidth="2"/><text x={p.x} y={p.y+5} textAnchor="middle" fill={checkpoint===id?'white':'#2378aa'} fontSize="14" fontWeight="700">{i+1}</text><text x={p.x} y={p.y-42} textAnchor="middle" fontSize="16" fontWeight="700" fill="#265979">{h.label}</text></g>;})}
      {marker&&<g className="demo-traveler" key={route.edgeIds.join('|')} aria-label="Demo replay shipment marker" style={{transform:`translate(${a.x+(b.x-a.x)*marker.t}px, ${a.y+(b.y-a.y)*marker.t}px)`}}><circle r="14" fill="#fff" stroke="#238BCE" strokeWidth="3"/><path d="M -5 -4 H 3 V -1 H 7 V 5 H -5 Z" fill="#238BCE"/></g>}
    </svg><PlaybackControls playback={playback} max={1} label="journey replay"/><p className="endpoint-note">Demo position: {marker?.elapsed.toFixed(1)} of {route.hours} planned hours. Playback runs on an accelerated demo clock. This does not indicate delivered freight or completed events.</p></>:<div className="no-route"><ShieldAlert size={30}/><h3>This journey needs a connection.</h3><p>Current disruptions block all feasible routes. Restore a hub in Disruption Lab or reset the scenario.</p></div>}
    </div><aside className="journey-details"><div className="glass-panel checkpoint-panel"><div className="panel-label"><span>CHECKPOINT DETAILS</span><Package size={18}/></div>{hub?<><h2>{hub.label}</h2><p className="location">{hub.city} · {hub.type}</p><p className="view-copy">{index===0?'Origin facility':index===(route?.ids.length??0)-1?'Planned destination':'Planned transfer checkpoint'}</p>{edge?<div className="segment-detail"><strong>Next segment</strong><p>{hubs.find(h=>h.id===edge.to)?.label}</p><p>{edge.hours} hrs · ${fmt(edge.cost)}</p><small>{segmentMode(edge.from,edge.to)}</small></div>:<p className="view-copy">End of the computed route plan.</p>}<button className="button subtle block" onClick={()=>{sim.setSelected(hub.id);onInspect();}}>Inspect on network <ArrowRight size={16}/></button></>:<p className="view-copy">Checkpoint details return when a feasible route is available.</p>}</div><div className="shipment-truth"><Truck size={24}/><button aria-pressed={sim.selectedShipment===shipment.id} onClick={()=>sim.setSelectedShipment(shipment.id)}>RR-2048 · Steel coils</button><p>No additional shipment records exist in this demo. Transportation modes are not recorded on the source edges.</p></div></aside>
  </section>;
}
