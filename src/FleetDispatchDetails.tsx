import {useEffect,useState} from 'react';
import {connections,fmt,hubs} from './network';
import {shipments,capacityPolicy,type FleetComparison} from './fleet';
import {routeLabel} from './advisor';
const name=(id:string)=>hubs.find(h=>h.id===id)?.label??id;
export function FleetDispatchDetails({report,coordinated}:{report:FleetComparison;coordinated:boolean}){
 const [showAll,setShowAll]=useState(false);
 useEffect(()=>setShowAll(false),[report,coordinated]);
 const segments=report.current.edgeUsage.map(e=>({...e,demand:shipments.reduce((n,s)=>n+(report.independent.find(a=>a.shipmentId===s.id)?.route?.edgeIds.includes(e.edgeId)?s.cargoQuantityTonnes:0),0)})).sort((a,b)=>Number(b.demand>b.capacityTonnes)-Number(a.demand>a.capacityTonnes)||Math.max(b.demand,coordinated?b.reservedTonnes:0)-Math.max(a.demand,coordinated?a.reservedTonnes:0)||a.edgeId.localeCompare(b.edgeId));
 return <section className="recovery-records" aria-labelledby="fleet-records-title">
  <h2 id="fleet-records-title">Shipment Details, Deadlines & Segment Reservations</h2>
  <p>Capacity is shared across a {capacityPolicy.planningWindowHours}-hour dispatch cohort. Reservations cover full cargo on every route segment; no splitting or time-slot reuse. Costs are USD; deadlines start at simulated dispatch.</p>
  <div className="recovery-table-scroll"><table className="recovery-shipments"><caption>Simulated industrial dispatch cohort · all quantities in tonnes</caption><thead><tr><th>Shipment / cargo</th><th>Priority / deadline</th><th>{coordinated?'Assigned route':'Independent plan'}</th><th>Status / tradeoff</th></tr></thead><tbody>{shipments.map(s=>{
   const allocation=report.current.allocations.find(a=>a.shipmentId===s.id)!;
   const independent=report.independent.find(a=>a.shipmentId===s.id)?.route??null;
   const route=coordinated?allocation.route:independent;
   return <tr key={s.id}><td data-label="Shipment / cargo"><strong>{s.id} · {s.cargoQuantityTonnes} t</strong><span>{s.cargo}</span><span>{name(s.origin)} → {name(s.destination)}</span></td><td data-label="Priority / deadline"><strong>{s.priority}</strong><span>Due by hour {s.deadlineHours}</span></td><td data-label={coordinated?'Assigned route':'Independent plan'}>{route?<><strong>{route.hours} hrs · ${fmt(route.cost)}</strong><span>{routeLabel(route)}</span></>:<strong>{coordinated?'No feasible assignment':'No individually feasible route'}</strong>}</td><td data-label="Status / tradeoff"><strong>{coordinated?allocation.status:route?'Independent plan · awaiting coordination':'No individually feasible route'}</strong>{coordinated&&<><span>{allocation.reason}{allocation.deadlineViolation?' · Deadline exceeded':''}</span>{route&&independent&&<span>Compared with independent: {route.hours-independent.hours>=0?'+':''}{route.hours-independent.hours} hrs · {route.cost-independent.cost>=0?'+':''}${fmt(route.cost-independent.cost)}</span>}</>}{route&&route.hours>s.deadlineHours&&!coordinated&&<span>Independent arrival exceeds deadline</span>}<details><summary>{allocation.candidates.length} individually feasible candidates</summary>{allocation.candidates.map(r=><p key={r.id}>{routeLabel(r)} · {r.hours} hrs · ${fmt(r.cost)}</p>)}{coordinated&&allocation.blockingEdgeIds.length>0&&<p>Capacity bottlenecks: {allocation.blockingEdgeIds.map(id=>{const e=connections.find(e=>e.id===id)!;return `${name(e.from)} → ${name(e.to)}`;}).join('; ')}</p>}</details></td></tr>;
  })}</tbody></table></div>
  <h3>Directed segment {coordinated?'reservations':'demand'}</h3><p>{coordinated?'Actual reserved tonnes after coordination.':'Independent demands are not reservations and can exceed capacity.'}</p>
  <div className="recovery-table-scroll" tabIndex={0} aria-label="Directed segment capacity table"><table><thead><tr><th>Directed connection</th><th>Independent demand</th><th>Capacity</th><th>Reserved after coordination</th><th>Remaining capacity</th></tr></thead><tbody>{(showAll?segments:segments.slice(0,5)).map(e=>{
   const edge=connections.find(c=>c.id===e.edgeId)!;
   const demand=e.demand;
   return <tr key={e.edgeId}><td>{name(edge.from)} → {name(edge.to)}</td><td className={demand>e.capacityTonnes?'record-warning':''}>{demand} t{demand>e.capacityTonnes?' · overload':''}</td><td>{e.capacityTonnes} t</td><td>{coordinated?(e.reservedTonnes?`${e.reservedTonnes} t`:'0 t · unused segment'):'Awaiting coordination'}</td><td>{coordinated?`${e.remainingTonnes} t`:'Pending coordination'}</td></tr>;
  })}</tbody></table></div>
  {segments.length>5&&<button className="recovery-segments-toggle" aria-expanded={showAll} onClick={()=>setShowAll(v=>!v)}>{showAll?'Show fewer':`Show all (${segments.length})`}</button>}
 </section>;
}
