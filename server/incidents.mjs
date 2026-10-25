import {databaseFailure} from './database.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {AdvisorError,validateInput} from './contracts.mjs';
import {compareFleet,shipments} from '../src/fleet.ts';
import {hubs,findRoute,validEndpoints} from '../src/network.ts';
const hub=z.enum(hubs.map(h=>h.id));
const eventSchema=z.object({id:z.number().int().nonnegative(),kind:z.enum(['initialized','disruption','restoration','route','reset','endpoints','fleet']),text:z.string().min(1).max(1000),time:z.iso.datetime({offset:true}),closed:z.array(hub).max(hubs.length),route:z.unknown(),beforeRoute:z.unknown().optional(),afterRoute:z.unknown().optional(),hubId:hub.optional(),objective:z.enum(['hours','cost']).optional(),origin:hub.optional(),destination:hub.optional(),context:z.string().max(120).optional(),fleet:z.unknown().optional()}).strict();
const requestSchema=z.object({idempotencyKey:z.uuid(),event:eventSchema}).strict();
const fail=()=>{throw new AdvisorError(400,'INVALID_INCIDENT','Incident snapshot does not match the simulation network and calculations.');};
export function validateIncident(raw){
  const parsed=requestSchema.safeParse(raw);if(!parsed.success)fail();
  const {event}=parsed.data;
  if(new Set(event.closed).size!==event.closed.length)fail();
  const origin=event.origin??'mill',destination=event.destination??'site',objective=event.objective??'hours';
  if(!validEndpoints(origin,destination))fail();
  // Validate each historical route structurally, including routes recorded before a closure or endpoint change.
  for(const route of [event.route,event.beforeRoute,event.afterRoute]){
    if(route===undefined||route===null)continue;
    const from=route?.ids?.[0],to=route?.ids?.at(-1);
    if(!validEndpoints(from,to))fail();
    const options=[['fastest','hours'],['cheapest','cost']].flatMap(([id,metric])=>{const r=findRoute(from,to,metric,[]);return r?[{id,...r}]:[];});
    try{validateInput({origin:from,destination:to,scenario:from==='mill'&&to==='site'?'RR-2048':'Custom plan',objective,disruptedHubIds:[],originalRoute:route,options});}catch{fail();}
  }
  if(event.route===undefined||(event.kind!=='route'&&event.route!==null))fail();
  const expected=findRoute(origin,destination,objective,event.closed);
  if(event.kind==='fleet'){
    const fleet=compareFleet(shipments,event.closed,objective);if(!isDeepStrictEqual(event.fleet,fleet)||event.route!==null)fail();event.fleet=fleet;
  }else if(event.fleet!==undefined)fail();
  if(['disruption','restoration','endpoints'].includes(event.kind)&&!isDeepStrictEqual(event.afterRoute,expected))fail();
  if(event.kind==='route'&&(!expected||!isDeepStrictEqual(event.route,expected)||!isDeepStrictEqual(event.afterRoute,expected)))fail();
  if(['initialized','reset'].includes(event.kind)&&event.route!==null)fail();
  if(['disruption','restoration'].includes(event.kind)){
    if(!event.hubId||(event.kind==='disruption')!==event.closed.includes(event.hubId))fail();
    const priorClosed=event.kind==='disruption'?event.closed.filter(id=>id!==event.hubId):[...event.closed,event.hubId];
    if(!isDeepStrictEqual(event.beforeRoute,findRoute(origin,destination,objective,priorClosed)))fail();
  }
  // Derive the summary rather than preserving arbitrary client numeric claims.
  const label=id=>hubs.find(h=>h.id===id)?.label;
  event.text=event.kind==='fleet'?`Fleet allocation: ${event.fleet.current.metrics.routedShipmentCount} of ${shipments.length} shipments routed`:event.kind==='disruption'||event.kind==='restoration'?`${label(event.hubId)} ${event.kind==='disruption'?'disrupted':'restored'}`:event.kind==='route'?`${objective==='hours'?'Fastest':'Lowest-cost'} route recorded`:event.kind==='endpoints'?`Endpoints: ${label(origin)} → ${label(destination)}`:event.kind==='reset'?'Scenario reset':'Simulation initialized';
  return {idempotencyKey:parsed.data.idempotencyKey,event};
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export function createIncidentStore(pool){
  const requirePool=()=>{if(!pool)throw new AdvisorError(503,'DATABASE_DISCONNECTED','Saved History is disconnected. Configure DATABASE_URL in server/.env and restart the backend.');};
  const safe=async fn=>{requirePool();try{return await fn();}catch(e){if(e instanceof AdvisorError)throw e;throw new AdvisorError(503,'DATABASE_UNAVAILABLE',databaseFailure(e));}};
  return {
    async save(raw){const {event,idempotencyKey}=validateIncident(raw);const snapshot=JSON.stringify(canonical(event));const hash=createHash('sha256').update(snapshot).digest('hex');return safe(async()=>{
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const inserted=await client.query('INSERT INTO rippleroute.incidents (id,idempotency_key,payload_hash,occurred_at,snapshot) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id,saved_at,snapshot',[randomUUID(),idempotencyKey,hash,event.time,snapshot]);
        let record=inserted.rows[0];
        if(record)await client.query('INSERT INTO rippleroute.incident_events (occurred_at,incident_id,kind,snapshot) VALUES ($1,$2,$3,$4::jsonb)',[event.time,record.id,event.kind,snapshot]);
        else{const existing=await client.query('SELECT id,saved_at,snapshot,payload_hash FROM rippleroute.incidents WHERE idempotency_key=$1',[idempotencyKey]);record=existing.rows[0];if(!record||record.payload_hash!==hash)throw new AdvisorError(409,'IDEMPOTENCY_CONFLICT','This save key was already used for a different incident.');}
        await client.query('COMMIT');return {id:record.id,savedAt:record.saved_at,event:record.snapshot};
      }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
    });},
    async list(before){if(before&&!Number.isFinite(Date.parse(before)))throw new AdvisorError(400,'INVALID_CURSOR','Invalid history cursor.');return safe(async()=>{const result=await pool.query('SELECT id,saved_at,snapshot FROM rippleroute.incidents WHERE ($1::timestamptz IS NULL OR saved_at < $1) ORDER BY saved_at DESC,id DESC LIMIT 50',[before??null]);return result.rows.map(r=>({id:r.id,savedAt:r.saved_at,event:r.snapshot}));});},
    async get(id){if(!z.uuid().safeParse(id).success)throw new AdvisorError(400,'INVALID_ID','Invalid saved incident ID.');return safe(async()=>{const result=await pool.query('SELECT id,saved_at,snapshot FROM rippleroute.incidents WHERE id=$1',[id]);const r=result.rows[0];if(!r)throw new AdvisorError(404,'INCIDENT_NOT_FOUND','Saved incident not found.');return {id:r.id,savedAt:r.saved_at,event:r.snapshot};});}
  };
}
