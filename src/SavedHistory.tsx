import {useEffect,useRef,useState} from 'react';
import {hubs,fmt} from './network';
import type {DecisionEvent} from './useSimulation';
type SavedIncident={id:string;savedAt:string;event:DecisionEvent};
async function historyRequest(path:string,options:RequestInit={}){
  let response:Response;
  try{response=await fetch(path,options);}catch{throw new Error('Saved History is disconnected. Start the backend and check its database connection.');}
  let data;try{data=await response.json();}catch{throw new Error('Saved History returned an invalid response. Check that the backend is running.');}
  if(!response.ok)throw new Error(data.error?.message||'Saved History request failed.');
  return data;
}
const validRecord=(r:SavedIncident)=>r&&typeof r.id==='string'&&typeof r.savedAt==='string'&&r.event&&typeof r.event.text==='string'&&Array.isArray(r.event.closed);
export function SavedHistory({event}:{event?:DecisionEvent}){
  const [records,setRecords]=useState<SavedIncident[]>([]),[selected,setSelected]=useState<SavedIncident|null>(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const keys=useRef(new Map<string,string>()),pending=useRef(false),load=useRef<AbortController|null>(null),saveController=useRef<AbortController|null>(null);
  async function refresh(){
    load.current?.abort();const controller=new AbortController();load.current=controller;setLoading(true);setError('');
    try{const data=await historyRequest('/api/incidents',{signal:controller.signal});if(!Array.isArray(data.records)||!data.records.every(validRecord))throw new Error('Saved History returned invalid records.');if(!controller.signal.aborted)setRecords(data.records);}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not load Saved History.');}
    finally{if(load.current===controller){load.current=null;setLoading(false);}}
  }
  useEffect(()=>{refresh();return ()=>{load.current?.abort();saveController.current?.abort();};},[]);
  useEffect(()=>{setMessage('');},[event?.id,event?.time]);
  async function save(){
    if(!event||pending.current)return;
    const snapshot=JSON.stringify(event);let key=keys.current.get(snapshot);if(!key){key=crypto.randomUUID();keys.current.set(snapshot,key);}
    const controller=new AbortController();saveController.current=controller;pending.current=true;setSaving(true);setError('');setMessage('');
    try{const data=await historyRequest('/api/incidents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:key,event}),signal:controller.signal});if(!validRecord(data.record))throw new Error('The server did not confirm a saved incident.');if(controller.signal.aborted)return;setRecords(previous=>[data.record,...previous.filter(r=>r.id!==data.record.id)].slice(0,50));setMessage(`Saved to Tiger Data: ${data.record.event.text}`);}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Save failed. No save was confirmed.');}
    finally{if(saveController.current===controller){saveController.current=null;pending.current=false;setSaving(false);}}
  }
  const name=(id:string)=>hubs.find(h=>h.id===id)?.label??id;
  const snapshot=selected?.event;
  const savedRoutes: [string,DecisionEvent['route']|undefined][] = snapshot? [['Before',snapshot.beforeRoute],['After',snapshot.afterRoute!==undefined?snapshot.afterRoute:snapshot.route]]:[];
  return <section className="story-housekeeping" aria-label="Saved History"><h3>Saved History</h3><p>Persistent Tiger Data snapshots · Local session history remains above. Opening a saved record does not change the simulation.</p>
    <button className="button subtle" disabled={!event||saving} onClick={save}>{saving?'Saving incident…':'Save selected incident'}</button>{' '}<button className="button subtle" disabled={loading} onClick={refresh}>Refresh saved history</button>
    {loading&&<p role="status">Loading saved incidents…</p>}{saving&&<p role="status">Waiting for database confirmation…</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {!loading&&!error&&!records.length&&<p>No saved incidents yet.</p>}
    {records.length>0&&<><p>Most recent {records.length} saved incidents.</p><ul>{records.map(r=><li key={r.id}><button className="button subtle" aria-pressed={selected?.id===r.id} onClick={()=>setSelected(r)}>{r.event.text} · {new Date(r.savedAt).toLocaleString()}</button></li>)}</ul></>}
    {snapshot&&<article aria-label="Saved incident snapshot"><h4>{snapshot.text}</h4><time dateTime={snapshot.time}>{new Date(snapshot.time).toLocaleString()}</time><p>Disruptions: {snapshot.closed.map(name).join(', ')||'None'} · Objective: {snapshot.objective??'hours'}</p>
      {snapshot.fleet?<><p>{snapshot.fleet.current.metrics.routedShipmentCount} / {snapshot.fleet.current.metrics.shipmentCount} allocated · ${fmt(snapshot.fleet.current.metrics.totalRouteCost)} · {snapshot.fleet.current.metrics.deadlineViolations} deadline violations</p><ul>{snapshot.fleet.current.allocations.map(a=><li key={a.shipmentId}><strong>{a.shipmentId} · {a.status}</strong> — {a.route?`${a.route.ids.map(name).join(' → ')} · ${fmt(a.route.cost)} · ${a.route.hours} hrs`:a.reason}</li>)}</ul><details><summary>Recorded allocation and capacity details</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{JSON.stringify(snapshot.fleet,null,2)}</pre></details></>:<>{savedRoutes.map(([label,route])=><p key={label}><strong>{label}: </strong>{route?`${route.ids.map(name).join(' → ')} · ${fmt(route.cost)} · ${route.hours} hrs`:'No route recorded'}</p>)}</>}
    </article>}
  </section>;
}
