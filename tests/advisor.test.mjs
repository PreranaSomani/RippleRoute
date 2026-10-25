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

test('baseline numeric facts trigger exactly one correction with identical verified context and no rejected prose',async()=>{
  const calls=[];
  const result=await createAdvisor({apiKey:'test',generate:async params=>{
    calls.push(params);
    return {text:JSON.stringify(calls.length===1?{...analysis,explanation:'The fastest route takes 35 hours and costs $1,770; the cheapest takes 37 hours and costs $1,570.'}:analysis)};
  }})(input());
  assert.equal(calls.length,2);assert.deepEqual(result.analysis,analysis);
  const facts=JSON.parse(calls[0].contents);
  assert.equal(facts.origin.label,'Steelworks');assert.equal(facts.destination.label,'Build Site');
  assert.equal(facts.options[0].hours,35);assert.equal(facts.options[0].cost,1770);
  assert.equal(facts.options[1].hours,37);assert.equal(facts.options[1].cost,1570);
  assert.equal(calls[1].contents,calls[0].contents);
  assert.match(calls[1].config.systemInstruction,/CORRECTIVE ATTEMPT/);
  assert.match(calls[1].config.systemInstruction,/Single mode/);
  assert.ok(!calls[1].config.systemInstruction.includes('$1,770'));
  assert.equal(calls[1].config.abortSignal,calls[0].config.abortSignal);
  assert.ok(calls[1].config.httpOptions.timeout<=calls[0].config.httpOptions.timeout);
  assert.equal(calls[1].config.httpOptions.retryOptions.attempts,1);
  assert.match(calls[0].config.responseJsonSchema.properties.explanation.description,/No digits/);
});
test('fleet numeric rejection retries without changing allocations or recommending a single route',async()=>{
  const {compareFleet,shipments}=await import('../src/fleet.ts');
  const report=compareFleet(shipments,[]),payload={mode:'fleet',objective:'hours',disruptedHubIds:[],shipments,report,options:[]};
  const before=JSON.stringify(payload);let calls=0;
  const result=await createAdvisor({apiKey:'test',generate:async p=>{
    calls++;assert.equal(p.config.responseJsonSchema.properties.recommendedRouteId.type,'null');
    assert.deepEqual(JSON.parse(p.contents).report,report);
    if(calls===2)assert.match(p.config.systemInstruction,/Fleet mode: recommendedRouteId must be null/);
    return {text:JSON.stringify({...analysis,recommendedRouteId:null,explanation:calls===1?'All 5 shipments are routed; RR-2048 is reassigned.':'The recorded allocation reserves capacity and reassigns a shipment to an available alternative.'})};
  }})(payload);
  assert.equal(calls,2);assert.equal(result.analysis.recommendedRouteId,null);assert.equal(JSON.stringify(payload),before);
});
test('quantities in every prose field, percentages, Unicode digits and spelled-out statistics remain rejected after one retry',async()=>{
  for(const patch of [{incidentSummary:'Save 20%.'},{explanation:'It costs $999.'},{tradeoffs:['Transit takes thirty hours.']},{warnings:['There are five shipments.']},{explanation:'Delivery takes ３５ hours.'},{explanation:'Savings are ten percent.'}]){
    let calls=0;
    await assert.rejects(()=>createAdvisor({apiKey:'test',generate:async()=>{calls++;return {text:JSON.stringify({...analysis,...patch})};}})(input()),e=>e.code==='UNVERIFIED_FACTS'&&e.status===502&&e.message.includes('Use the verified route and allocation details')&&!e.message.includes('999'));
    assert.equal(calls,2);
  }
});
test('valid responses, schema errors, bad recommendations and provider failures do not trigger corrective requests',async()=>{
  let calls=0;
  await createAdvisor({apiKey:'test',generate:async()=>{calls++;return {text:JSON.stringify(analysis)};}})(input());assert.equal(calls,1);
  for(const value of ['not JSON','{}',JSON.stringify({...analysis,recommendedRouteId:'invented-route'})]){
    calls=0;await assert.rejects(()=>createAdvisor({apiKey:'test',generate:async()=>{calls++;return {text:value};}})(input()));assert.equal(calls,1);
  }
  for(const error of [{status:429},{name:'TimeoutError'},new Error('provider-secret')]){
    calls=0;await assert.rejects(()=>createAdvisor({apiKey:'test',generate:async()=>{calls++;throw error;}})(input()));assert.equal(calls,1);
  }
});
test('aborted requests do not spend another request on a numeric correction',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(()=>createAdvisor({apiKey:'test',generate:async()=>{calls++;controller.abort();return {text:JSON.stringify({...analysis,explanation:'35 hours.'})};}})(input(),{signal:controller.signal}),e=>e.code==='AI_TIMEOUT');
  assert.equal(calls,1);
});
test('numeric retry still validates recommendation IDs and handles provider failure without further retry',async()=>{
  for(const second of [async()=>({text:JSON.stringify({...analysis,recommendedRouteId:null})}),async()=>{throw {status:429};}]){
    let calls=0;
    await assert.rejects(()=>createAdvisor({apiKey:'test',generate:async()=>{calls++;return calls===1?{text:JSON.stringify({...analysis,explanation:'35 hours.'})}:second();}})(input()),e=>['INVALID_RECOMMENDATION','AI_RATE_LIMIT'].includes(e.code));
    assert.equal(calls,2);
  }
});
