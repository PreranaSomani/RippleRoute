import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createIncidentStore,validateIncident} from '../server/incidents.mjs';
import {databaseConfig} from '../server/database.mjs';
import {migrate} from '../server/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {compareFleet,shipments} from '../src/fleet.ts';
import {findRoute} from '../src/network.ts';
const payload=()=>({idempotencyKey:randomUUID(),event:{id:1,kind:'fleet',text:'Fleet allocation',time:new Date().toISOString(),closed:[],route:null,objective:'hours',origin:'mill',destination:'site',context:'Fictional fleet',fleet:compareFleet(shipments,[])}});
function mockDatabase(){
  const calls=[],records=new Map(),events=[];let releases=0;
  const query=async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.startsWith('INSERT INTO rippleroute.incidents')){const [id,key,hash,time,snapshot]=params;if(records.has(key))return {rows:[]};const row={id,payload_hash:hash,saved_at:time,snapshot:JSON.parse(snapshot)};records.set(key,row);return {rows:[row]};}
    if(sql.startsWith('INSERT INTO rippleroute.incident_events')){events.push(params);return {rows:[]};}
    if(sql.includes('WHERE idempotency_key'))return {rows:[records.get(params[0])].filter(Boolean)};
    if(sql.includes('WHERE id=$1'))return {rows:[...records.values()].filter(r=>r.id===params[0])};
    if(sql.startsWith('SELECT id,saved_at,snapshot FROM'))return {rows:[...records.values()]};
    return {rows:[]};
  };
  return {calls,records,events,get releases(){return releases;},query,connect:async()=>({query,release:()=>{releases++;}})};
}
test('database config forces verified TLS despite URL sslmode, never silently disables verification',()=>{
  const config=databaseConfig('postgresql://user:private@db.example:5432/tsdb?sslmode=no-verify');
  assert.equal(config.ssl.rejectUnauthorized,true);assert.ok(!config.connectionString.includes('sslmode'));assert.equal(config.max,4);
  assert.equal(databaseConfig(undefined),null);assert.throws(()=>databaseConfig('not-a-url'),/configuration is invalid/);
});
test('incident validation rejects forged fleet totals, routes, unknown hubs and invalid keys',()=>{
  const forged=payload();forged.event.fleet.current.metrics.totalRouteCost=1;
  const stale=payload();stale.event.closed=['depot'];
  for(const bad of [{},forged,stale,{...payload(),idempotencyKey:'bad'},{...payload(),event:{...payload().event,closed:['unknown']}},{...payload(),event:{...payload().event,route:{ids:['mill','site'],edgeIds:['invented'],hours:1,cost:0}}}])assert.throws(()=>validateIncident(bad),e=>e.status===400);
  const route=findRoute('mill','site','hours',[]);const valid={idempotencyKey:randomUUID(),event:{id:2,kind:'route',text:'Client forged summary $1',time:new Date().toISOString(),closed:[],route,beforeRoute:null,afterRoute:route,origin:'mill',destination:'site',objective:'hours'}};
  assert.equal(validateIncident(valid).event.text,'Fastest route recorded');
  const disruption={idempotencyKey:randomUUID(),event:{id:3,kind:'disruption',text:'Disruption',time:new Date().toISOString(),closed:['depot'],route:null,hubId:'depot',origin:'mill',destination:'site',objective:'hours',beforeRoute:route,afterRoute:findRoute('mill','site','hours',['depot'])}};
  assert.equal(validateIncident(disruption).event.hubId,'depot');
  disruption.event.beforeRoute=null;assert.throws(()=>validateIncident(disruption),e=>e.status===400);
});
test('transaction saves snapshot and hypertable event once; retries are idempotent and mismatches conflict',async()=>{
  const db=mockDatabase(),store=createIncidentStore(db),input=payload();
  const first=await store.save(input),retry=await store.save(input);
  assert.equal(first.id,retry.id);assert.equal(db.events.length,1);assert.equal(db.releases,2);
  assert.equal(db.calls[0].sql,'BEGIN');assert.ok(db.calls.some(c=>c.sql==='COMMIT'));
  assert.ok(db.calls.filter(c=>c.sql.startsWith('INSERT')).every(c=>c.sql.includes('$1')&&!c.sql.includes(input.event.time)));
  assert.deepEqual((await store.get(first.id)).event,first.event);assert.equal((await store.list()).length,1);
  const changed=structuredClone(input);changed.event.time=new Date(Date.now()+1000).toISOString();
  await assert.rejects(()=>store.save(changed),e=>e.status===409);assert.equal(db.calls.at(-1).sql,'ROLLBACK');
});
test('database failure rolls back, releases connection and never leaks SQL or credentials',async()=>{
  const commands=[];let released=false;
  const db={connect:async()=>({query:async sql=>{commands.push(sql);if(sql.startsWith('INSERT'))throw new Error('postgresql://secret-password');return {rows:[]};},release:()=>{released=true;}})};
  await assert.rejects(()=>createIncidentStore(db).save(payload()),e=>e.status===503&&!e.message.includes('secret-password'));assert.equal(commands.at(-1),'ROLLBACK');assert.equal(released,true);
  await assert.rejects(()=>createIncidentStore(null).list(),e=>e.code==='DATABASE_DISCONNECTED');
  await assert.rejects(()=>createIncidentStore(mockDatabase()).get(randomUUID()),e=>e.status===404);
  await assert.rejects(()=>createIncidentStore(mockDatabase()).get("';DROP TABLE incidents"),e=>e.status===400);
});
test('migration executes repeatable DDL in a locked transaction and rolls back failures',async()=>{
  const commands=[];let released=0;
  const db={connect:async()=>({query:async sql=>{commands.push(sql);return {rows:[]};},release:()=>{released++;}})};
  await migrate(db);await migrate(db);assert.equal(released,2);assert.equal(commands[0],'BEGIN');assert.match(commands[2],/CREATE TABLE IF NOT EXISTS/);assert.match(commands[2],/create_hypertable/);assert.match(commands[2],/PRIMARY KEY \(occurred_at, incident_id\)/);
  const failed=[];await assert.rejects(()=>migrate({connect:async()=>({query:async sql=>{failed.push(sql);if(sql.includes('CREATE EXTENSION'))throw new Error('failure');},release(){}})}));assert.equal(failed.at(-1),'ROLLBACK');
});
test('HTTP persistence saves, lists, retrieves and reports disconnected state truthfully',async()=>{
  const server=createApp({database:mockDatabase()}).listen(0,'127.0.0.1');await new Promise((r,j)=>{server.once('listening',r);server.once('error',j);});
  const base=`http://127.0.0.1:${server.address().port}/api/incidents`;
  try{
    const res=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())});assert.equal(res.status,200);const {record}=await res.json();assert.ok(record.id);
    assert.equal((await fetch(base).then(r=>r.json())).records.length,1);assert.equal((await fetch(base+'/'+record.id).then(r=>r.json())).record.id,record.id);
    assert.equal((await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
  }finally{await new Promise(r=>server.close(r));}
  const off=createApp().listen(0,'127.0.0.1');await new Promise((r,j)=>{off.once('listening',r);off.once('error',j);});
  try{const res=await fetch(`http://127.0.0.1:${off.address().port}/api/incidents`);assert.equal(res.status,503);assert.equal((await res.json()).error.code,'DATABASE_DISCONNECTED');}finally{await new Promise(r=>off.close(r));}
});
