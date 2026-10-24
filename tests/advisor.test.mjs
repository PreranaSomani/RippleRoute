import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdvisor,DEFAULT_MODEL} from '../server/advisor.mjs';
import {createApp} from '../server/app.mjs';
import {findRoute} from '../src/network.ts';

function input(closed=[]){return {origin:'mill',destination:'site',scenario:'RR-2048',objective:'hours',disruptedHubIds:closed,originalRoute:null,options:[['fastest','hours'],['cheapest','cost']].flatMap(([id,metric])=>{const r=findRoute('mill','site',metric,closed);return r?[{id,...r}]:[];})};}
const analysis={incidentSummary:'The simulated network has viable options.',recommendedRouteId:'fastest',explanation:'Choose the shortest computed travel time for the selected objective.',tradeoffs:['The lowest-cost alternative may take longer.'],warnings:['This is a fictional network without live status.']};
const response=value=>async()=>({text:JSON.stringify(value)});

test('invalid incident input, pairs, unknown hubs and forged routes are rejected before Gemini',async()=>{
  let calls=0;const analyze=createAdvisor({apiKey:'test',generate:async()=>{calls++;return {text:JSON.stringify(analysis)};}});
  for(const bad of [null,{}, {...input(),origin:'site'}, {...input(),origin:'unknown'}, {...input(),scenario:'Custom plan'}, {...input(),deadline:'tomorrow'}, {...input(),options:[]}, {...input(),disruptedHubIds:['rail1','rail1']}])await assert.rejects(()=>analyze(bad),e=>e.status===400);
  const forged=input();forged.options[0].cost=1;await assert.rejects(()=>analyze(forged),e=>e.code==='INVALID_ROUTES');
  const wrongOriginal=input();wrongOriginal.originalRoute={...wrongOriginal.options[0]};delete wrongOriginal.originalRoute.id;wrongOriginal.originalRoute.edgeIds.reverse();await assert.rejects(()=>analyze(wrongOriginal),e=>e.status===400);
  assert.equal(calls,0);
});
test('missing server-side API key returns an explicit configuration error',async()=>{
  await assert.rejects(()=>createAdvisor({generate:response(analysis)})(input()),e=>e.status===503&&e.code==='MISSING_API_KEY');
});
test('valid SDK request uses constrained JSON and returns Gemini provenance',async()=>{
  let params;const result=await createAdvisor({apiKey:'test',generate:async p=>{params=p;return {text:JSON.stringify(analysis)};}})(input());
  assert.equal(params.model,DEFAULT_MODEL);assert.equal(params.config.responseMimeType,'application/json');
  assert.deepEqual(params.config.responseJsonSchema.properties.recommendedRouteId.enum,['fastest','cheapest']);
  const facts=JSON.parse(params.contents);assert.equal(facts.options[0].hours,findRoute('mill','site','hours',[]).hours);assert.equal(facts.origin.label,'Steelworks');
  assert.equal(result.source,'gemini');assert.deepEqual(result.analysis,analysis);
});
test('malformed, partial, hallucinated numeric output and invalid recommendation IDs fail closed',async()=>{
  for(const value of [{text:'not JSON'}, {text:'{}'}, {text:JSON.stringify({...analysis,recommendedRouteId:'invented-route'})}, {text:JSON.stringify({...analysis,recommendedRouteId:null})}, {text:JSON.stringify({...analysis,explanation:'It costs $999.'})}]){
    await assert.rejects(()=>createAdvisor({apiKey:'test',generate:async()=>value})(input()),e=>e.status===502);
  }
});
test('no feasible routes still calls Gemini with no options and requires a null recommendation',async()=>{
  const noRoutes=input(['rail1','yard']);let calls=0;
  const result=await createAdvisor({apiKey:'test',generate:async p=>{calls++;assert.equal(p.config.responseJsonSchema.properties.recommendedRouteId.type,'null');return {text:JSON.stringify({...analysis,recommendedRouteId:null,incidentSummary:'No directed route is currently feasible.',tradeoffs:[]})};}})(noRoutes);
  assert.equal(result.analysis.recommendedRouteId,null);assert.equal(calls,1);
  await assert.rejects(()=>createAdvisor({apiKey:'test',generate:response(analysis)})(noRoutes),e=>e.code==='INVALID_RECOMMENDATION');
});
test('provider failures are sanitized, with quota and timeout handling',async()=>{
  for(const [error,status] of [[{status:429},429],[{name:'TimeoutError'},504],[new Error('secret-credential'),502]]){
    await assert.rejects(()=>createAdvisor({apiKey:'test',generate:async()=>{throw error;}})(input()),e=>e.status===status&&!e.message.includes('secret-credential'));
  }
});
test('HTTP health, invalid JSON, missing key and valid analysis responses',async()=>{
  const server=createApp().listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const health=await fetch(base+'/api/health').then(r=>r.json());assert.equal(health.status,'ok');assert.equal(health.advisorConfigured,false);
    const missing=await fetch(base+'/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input())});assert.equal(missing.status,503);
    const invalid=await fetch(base+'/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(invalid.status,400);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('HTTP returns validated provider output and rejects concurrent analyses',async()=>{
  let finish,started;
  const began=new Promise(resolve=>{started=resolve;});
  const server=createApp({apiKey:'test',generate:async()=>{started();return new Promise(resolve=>{finish=()=>resolve({text:JSON.stringify(analysis)});});}}).listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const endpoint=`http://127.0.0.1:${server.address().port}/api/ai/analyze`;
  const post=()=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input())});
  try{
    const pending=post();await began;
    const duplicate=await post();assert.equal(duplicate.status,429);assert.equal((await duplicate.json()).error.code,'ADVISOR_BUSY');
    finish();const result=await pending;assert.equal(result.status,200);assert.equal((await result.json()).source,'gemini');
  }finally{finish?.();await new Promise(resolve=>server.close(resolve));}
});

test('fleet advisor verifies capacity-aware results, passes real deadlines and requires no single-route ID',async()=>{
  const {compareFleet,shipments}=await import('../src/fleet.ts');
  const closed=['depot'];
  const payload={mode:'fleet',objective:'hours',disruptedHubIds:closed,shipments,report:compareFleet(shipments,closed,'hours'),options:[]};
  let facts;
  const result=await createAdvisor({apiKey:'test',generate:async p=>{facts=JSON.parse(p.contents);return {text:JSON.stringify({...analysis,recommendedRouteId:null})};}})(payload);
  assert.equal(result.analysis.recommendedRouteId,null);assert.deepEqual(facts.report,payload.report);assert.equal(facts.shipments[0].deadlineHours,shipments[0].deadlineHours);assert.equal(facts.capacityPolicy,undefined);assert.equal(facts.report.capacityPolicy.unit,'tonnes');
  await assert.rejects(()=>createAdvisor({apiKey:'test',generate:response(analysis)})(payload),e=>e.code==='INVALID_RECOMMENDATION');
  const forged=structuredClone(payload);forged.report.current.metrics.totalRouteCost=1;
  await assert.rejects(()=>createAdvisor({apiKey:'test',generate:response(analysis)})(forged),e=>e.status===400);
  const stale={...payload,disruptedHubIds:[]};await assert.rejects(()=>createAdvisor({apiKey:'test',generate:response(analysis)})(stale),e=>e.status===400);
});

test('fleet report fits the bounded HTTP contract and returns a verified fleet explanation',async()=>{
  const {compareFleet,shipments}=await import('../src/fleet.ts');
  const payload={mode:'fleet',objective:'hours',disruptedHubIds:[],shipments,report:compareFleet(shipments,[]),options:[]};
  assert.ok(Buffer.byteLength(JSON.stringify(payload))<24*1024);
  const server=createApp({apiKey:'test',generate:response({...analysis,recommendedRouteId:null})}).listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  try{
    const result=await fetch(`http://127.0.0.1:${server.address().port}/api/ai/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    assert.equal(result.status,200);assert.equal((await result.json()).analysis.recommendedRouteId,null);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
