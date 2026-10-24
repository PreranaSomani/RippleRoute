import {Clock3} from 'lucide-react';
import {fmt,hubs} from './network';
import {NetworkMap,routeDescription} from './NetworkPanels';
import {PlaybackControls} from './PlaybackControls';
import type {Simulation} from './useSimulation';

export function DecisionReplay({sim}:{sim:Simulation}){
  const events=[...sim.history].reverse();
  const playback=sim.incidentPlayback;
  const index=Math.min(events.length-1,Math.floor(playback.position));
  const event=events[index];
  if(!event)return <section className="glass-panel replay-empty"><Clock3 size={36}/><h2>Your first decision starts the story.</h2><p>Disrupt or restore a hub, or apply a computed route to record a local event.</p></section>;
  const selected=sim.replayHub?.eventId===event.id?sim.replayHub.id:event.hubId??'';
  const snapshot={...sim,closed:event.closed,active:event.route,selected,setSelected:(id:string)=>sim.setReplayHub({eventId:event.id,id}),playing:false,networkPlayback:{...sim.networkPlayback,position:0}};
  const hub=hubs.find(h=>h.id===selected);
  const previousDecision=events.slice(0,index).reverse().find(e=>e.route);
  return <section className="incident-experience" aria-label="Decision Replay"><div className="incident-toolbar"><div><div className="eyebrow">LOCAL INCIDENT REPLAY</div><p>Recorded session snapshots · Read-only inspection · No database persistence</p></div><PlaybackControls playback={playback} max={events.length-1} label="incident replay" steps/></div>
    <div className="incident-stage"><div className="incident-map"><NetworkMap sim={snapshot} readOnly/><span className="snapshot-badge">HISTORICAL SNAPSHOT / EVENT {event.id+1}</span></div><article className="glass-panel incident-detail" key={event.id}><div className="event-meta"><span>{event.kind}</span><time dateTime={event.time}>{new Date(event.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></div><h2>{event.text}</h2><p className="view-copy">{event.closed.length?`${event.closed.length} disrupted: ${event.closed.map(id=>hubs.find(h=>h.id===id)?.label).join(', ')}`:'All hubs operational'}</p>{hub&&<div className="historical-hub"><strong>{hub.label}</strong><span>{event.closed.includes(hub.id)?'Disrupted in this snapshot':'Operational in this snapshot'}</span></div>}{event.route?<div className="event-route"><span className="panel-label">RECORDED ROUTE DECISION</span><strong>{event.route.hours} hrs · ${fmt(event.route.cost)}</strong><p>{routeDescription(event.route)}</p>{previousDecision?.route&&<p className="previous-decision">Prior applied decision: {previousDecision.route.hours} hrs · ${fmt(previousDecision.route.cost)}. These decisions may belong to different disruption scenarios.</p>}</div>:<p className="snapshot-note">No route was saved with this event. The map shows the recorded hub availability; no historical route is inferred.</p>}<p className="endpoint-note">Inspecting history does not change current disruptions, hub selection, or applied route.</p></article></div>
    <ol className="incident-timeline" aria-label="Recorded local events">{events.map((item,i)=><li key={item.id}><button aria-current={index===i?'step':undefined} aria-label={`Replay event ${i+1}: ${item.text}`} onClick={()=>playback.seek(i)}><span className={`timeline-dot ${item.kind}`}/><small>{String(i+1).padStart(2,'0')} / {item.kind}</small><strong>{item.text}</strong><span>{item.closed.length?`${item.closed.length} disrupted: ${item.closed.map(id=>hubs.find(h=>h.id===id)?.label).join(', ')}`:'All hubs operational'}</span></button></li>)}</ol>
  </section>;
}
