import {ArrowRight,Clock3,GitBranch,RotateCcw,ShieldAlert} from 'lucide-react';
import {fmt,hubs,type Route} from './network';
import {PlaybackControls} from './PlaybackControls';
import type {DecisionEvent,Simulation} from './useSimulation';

function RouteStrip({route,label,missing}:{route:Route|null|undefined;label:string;missing:string}){
  return <div className="story-route"><span className="eyebrow">{label}</span>{route?<><strong>{route.hours} hrs <span>·</span> ${fmt(route.cost)}</strong><ol>{route.ids.map((id,i)=><li key={id}><span>{hubs.find(h=>h.id===id)?.label??id}</span>{i<route.ids.length-1&&<ArrowRight size={14}/>}</li>)}</ol></>:<p>{missing}</p>}</div>;
}
function Housekeeping({events}:{events:DecisionEvent[]}){
  if(!events.length)return null;
  return <details className="story-housekeeping"><summary><RotateCcw size={15}/> Setup & reset records ({events.length})</summary>{events.map(event=><div key={event.id}><span>{event.text}</span><time dateTime={event.time}>{new Date(event.time).toLocaleTimeString()}</time></div>)}</details>;
}
export function DecisionReplay({sim,onExperiment}:{sim:Simulation;onExperiment?:()=>void}){
  const all=[...sim.history].reverse();
  const events=all.filter(e=>e.kind!=='initialized'&&e.kind!=='reset');
  const housekeeping=all.filter(e=>e.kind==='initialized'||e.kind==='reset');
  const playback=sim.incidentPlayback;
  const index=Math.min(events.length-1,Math.floor(playback.position));
  const event=events[index];
  if(!event)return <section className="story-empty" aria-label="Decision Replay"><div className="story-empty-art"><GitBranch size={54}/><span>01</span><ArrowRight size={26}/><span>02</span></div><div className="eyebrow">YOUR NETWORK STORY STARTS HERE</div><h2>Your first decision starts the story.</h2><p>Create a disruption, change planning endpoints, or apply a route. Your actual local decisions will become an interactive storyboard here.</p>{onExperiment&&<button className="button primary" onClick={onExperiment}>Create a disruption <ArrowRight size={17}/></button>}<Housekeeping events={housekeeping}/></section>;
  const hub=hubs.find(h=>h.id===event.hubId);
  const after=event.afterRoute!==undefined?event.afterRoute:event.route;
  return <section className="storyboard" aria-label="Decision Replay"><header className="story-header"><div><div className="eyebrow">LOCAL INCIDENT STORYBOARD</div><h2>Decisions, connected.</h2><p>Actual session events · Historical snapshots · No database persistence</p></div>{events.length>1&&<PlaybackControls playback={playback} max={events.length-1} label="incident replay" steps/>}</header>
    <div className="story-stage" key={event.id}><div className={`story-moment ${event.kind}`}><span className="story-number">{String(index+1).padStart(2,'0')}</span>{event.kind==='disruption'?<ShieldAlert size={36}/>:<GitBranch size={36}/>}<span className="eyebrow">{event.kind}</span><h2>{hub?.label??(event.kind==='route'?'A route chosen.':'A new direction.')}</h2>{hub&&<p>{hub.city} · {event.kind==='restoration'?'Restored in this event':'Disrupted in this event'}</p>}<time dateTime={event.time}>{new Date(event.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></div>
    <article className="story-detail"><div className="eyebrow">{event.context??'RECORDED LOCAL SCENARIO'}</div><h3>{event.text}</h3><p className="view-copy">{event.closed.length?`${event.closed.length} disrupted: ${event.closed.map(id=>hubs.find(h=>h.id===id)?.label).join(', ')}`:'All hubs operational'}</p>{event.route&&<span className="decision-stamp">RECORDED ROUTE DECISION</span>}<div className="story-routes"><RouteStrip route={event.beforeRoute} label={event.kind==='route'?'PREVIOUS APPLIED ROUTE':'BEFORE'} missing={event.beforeRoute===undefined?'No before-route snapshot was recorded.':event.kind==='route'?'No earlier applied route was recorded.':'No feasible route in this snapshot.'}/><RouteStrip route={after} label={event.kind==='route'?'APPLIED DECISION':'AFTER'} missing={event.afterRoute===undefined&&!event.route?'No route was saved with this event.': 'No feasible route in this snapshot.'}/></div><p className="endpoint-note">These are recorded paths and totals, including endpoint changes. Inspecting them does not change the current plan, disruptions, or applied route.</p></article></div>
    <ol className="story-timeline" aria-label="Recorded local events">{events.map((item,i)=><li key={item.id}><button aria-current={index===i?'step':undefined} aria-label={`Replay event ${i+1}: ${item.text}`} onClick={()=>playback.seek(i)}><span className={`timeline-dot ${item.kind}`}/><small>{String(i+1).padStart(2,'0')} / {item.kind}</small><strong>{item.text}</strong><span>{item.closed.length?`${item.closed.length} disrupted: ${item.closed.map(id=>hubs.find(h=>h.id===id)?.label).join(', ')}`:'All hubs operational'}</span></button></li>)}</ol><Housekeeping events={housekeeping}/>
  </section>;
}
