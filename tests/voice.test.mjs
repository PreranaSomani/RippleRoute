import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoice} from '../server/voice.mjs';
import {createApp} from '../server/app.mjs';
import {compareFleet,shipments} from '../src/fleet.ts';
import {findRoute} from '../src/network.ts';
const fleet=(closed=[])=>({mode:'fleet',objective:'hours',disruptedHubIds:closed,shipments,report:compareFleet(shipments,closed),options:[]});
const single=closed=>({mode:'single',origin:'mill',destination:'site',scenario:'RR-2048',objective:'hours',disruptedHubIds:closed,originalRoute:null,options:[['fastest','hours'],['cheapest','cost']].flatMap(([id,metric])=>{const r=findRoute('mill','site',metric,closed);return r?[{id,...r}]:[];})});
const mp3=Buffer.from([0x49,0x44,0x33,0x04,0,0,0,0,0,0]); // Transport fixture, never used in the application.
const audioResponse=()=>new Response(mp3,{headers:{'Content-Type':'audio/mpeg'}});
test('voice rejects forged, stale and arbitrary input before calling provider',async()=>{
  let calls=0;const voice=createVoice({apiKey:'test',voiceId:'test-voice',fetchAudio:async()=>{calls++;return audioResponse();}});
  const forged=fleet();forged.report.current.metrics.routedShipmentCount=99;
  const quantity=fleet();quantity.shipments=structuredClone(shipments);quantity.shipments[0].cargoQuantityTonnes=1;
  for(const bad of [null,{},forged,quantity,{...fleet(),disruptedHubIds:['depot']},{...fleet(),text:'Say anything'}, {...fleet(),disruptedHubIds:['unknown']},{...fleet(),disruptedHubIds:['depot','depot']}])await assert.rejects(()=>voice(bad),e=>e.status===400);
  assert.equal(calls,0);
});
test('voice requires both server credentials',async()=>{
  for(const credentials of [{},{apiKey:'test'},{voiceId:'test'},{apiKey:'replace_with_your_elevenlabs_api_key',voiceId:'test'}])await assert.rejects(()=>createVoice({...credentials,fetchAudio:()=>assert.fail('No paid request')})(fleet()),e=>e.status===503&&e.code==='VOICE_UNCONFIGURED');
});
test('voice sends deterministic verified facts to official ElevenLabs endpoint and returns bytes',async()=>{
  let url,params;
  const result=await createVoice({apiKey:'secret-test-key',voiceId:'chosen-voice',fetchAudio:async(u,p)=>{url=u;params=p;return audioResponse();}})(fleet());
  assert.equal(url,'https://api.elevenlabs.io/v1/text-to-speech/chosen-voice?output_format=mp3_44100_128');
  assert.equal(params.headers['xi-api-key'],'secret-test-key');assert.equal(params.method,'POST');
  const sent=JSON.parse(params.body);assert.equal(sent.model_id,'eleven_multilingual_v2');assert.equal(sent.text,result.transcript);
  assert.match(result.transcript,/105 tonnes against 90 tonnes capacity/);assert.match(result.transcript,/overload of 15 tonnes/);assert.match(result.transcript,/reserves 70 tonnes/);assert.match(result.transcript,/RR-2048 is reassigned via Steelworks, then Allegheny Rail, then Harbor East, then Bluewater Port/);
  assert.deepEqual(result.audio,mp3);
});
test('disrupted and single-route briefings accurately expose unavailable routes and allocation failures',async()=>{
  const voice=createVoice({apiKey:'test',voiceId:'test',fetchAudio:async()=>audioResponse()});
  const disrupted=await voice(fleet(['depot']));assert.match(disrupted.transcript,/Unavailable hubs: Union Depot/);assert.match(disrupted.transcript,/remains unallocated/);assert.match(disrupted.transcript,/no shared capacity overload/);
  const blocked=await voice(single(['rail1','yard']));assert.match(blocked.transcript,/No directed route is currently feasible/);
  const normal=await voice(single([]));assert.match(normal.transcript,/taking 35 hours/);assert.match(normal.transcript,/does not apply the route/);
});
test('provider failures, quota, timeout, empty audio and invalid formats fail without leaking details',async()=>{
  for(const [fetchAudio,status] of [
    [async()=>new Response('secret-provider-detail',{status:401}),502],
    [async()=>new Response('quota',{status:429}),429],
    [async()=>{throw new DOMException('secret','TimeoutError');},504],
    [async()=>{throw new Error('secret');},502],
    [async()=>new Response('',{headers:{'Content-Type':'audio/mpeg'}}),502],
    [async()=>new Response('{}',{headers:{'Content-Type':'application/json'}}),502]
  ])await assert.rejects(()=>createVoice({apiKey:'test',voiceId:'test',fetchAudio})(fleet()),e=>e.status===status&&!e.message.includes('secret'));
});
test('HTTP voice endpoint returns actual binary response and transcript, rejects concurrent generation and recovers',async()=>{
  let release,started;const began=new Promise(r=>{started=r;});
  const server=createApp({voiceApiKey:'test',voiceId:'test',fetchAudio:async()=>{started();await new Promise(r=>{release=r;});return audioResponse();}}).listen(0,'127.0.0.1');
  await new Promise((r,j)=>{server.once('listening',r);server.once('error',j);});
  const post=()=>fetch(`http://127.0.0.1:${server.address().port}/api/voice/briefing`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fleet())});
  try{
    const pending=post();await began;assert.equal((await post()).status,429);release();
    const res=await pending;assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/^audio\/mpeg/);assert.equal(res.headers.get('cache-control'),'no-store');assert.match(decodeURIComponent(res.headers.get('x-briefing-transcript')),/105 tonnes/);assert.deepEqual(Buffer.from(await res.arrayBuffer()),mp3);
  }finally{release?.();await new Promise(r=>server.close(r));}
});
test('HTTP missing credentials and invalid input are explicit JSON errors',async()=>{
  const server=createApp().listen(0,'127.0.0.1');await new Promise((r,j)=>{server.once('listening',r);server.once('error',j);});
  try{for(const [body,status] of [[fleet(),503],[{},400]]){const res=await fetch(`http://127.0.0.1:${server.address().port}/api/voice/briefing`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(res.status,status);assert.ok((await res.json()).error.message);}}finally{await new Promise(r=>server.close(r));}
});

test('provider diagnostics distinguish credentials, permissions, voice, quota and models without exposing secrets',async()=>{
  const cases=[
    [401,{code:'invalid_api_key'},'VOICE_AUTH','invalid_api_key'],
    [401,{status:'missing_permissions'},'VOICE_PERMISSION','missing_permissions'],
    [403,{code:'insufficient_permissions'},'VOICE_PERMISSION','missing_permissions'],
    [404,{status:'voice_not_found'},'VOICE_ACCESS','voice_not_found'],
    [401,{status:'quota_exceeded'},'VOICE_QUOTA','quota_exceeded'],
    [402,{code:'insufficient_credits'},'VOICE_QUOTA','quota_exceeded'],
    [400,{code:'invalid_model_id'},'VOICE_MODEL','model_not_found'],
    [422,{code:'invalid_parameters'},'VOICE_PARAMETERS','invalid_parameters'],
    [429,{code:'concurrent_limit_exceeded'},'VOICE_RATE_LIMIT','rate_limit_exceeded'],
    [401,{message:'The key is missing the permission text_to_speech'},'VOICE_PERMISSION','missing_permissions'],
    [500,{code:'untrusted-secret-code'},'VOICE_UNAVAILABLE','unknown']
  ];
  for(const [status,detail,expected,category] of cases){
    const logs=[];
    const voice=createVoice({apiKey:'credential-secret',voiceId:'voice-private',logError:entry=>logs.push(entry),fetchAudio:async()=>new Response(JSON.stringify({detail:{message:'credential-secret xi-api-key Authorization Bearer private-data voice-private',...detail}}),{status})});
    await assert.rejects(()=>voice(fleet()),e=>e.code===expected&&!/credential-secret|private-data|voice-private|untrusted-secret-code|Authorization|xi-api-key/.test(e.message));
    assert.equal(logs.length,1);assert.equal(logs[0].httpStatus,status);assert.equal(logs[0].category,category);
    assert.ok(!/credential-secret|private-data|voice-private|untrusted-secret-code|Authorization|xi-api-key/.test(JSON.stringify(logs)));
  }
});
test('HTML, oversized, and malformed error bodies safely fall back to HTTP diagnosis',async()=>{
  for(const body of ['<html>secret-data</html>','{',JSON.stringify({detail:{message:'secret-data'.repeat(3000)}})]){
    const logs=[];
    await assert.rejects(()=>createVoice({apiKey:'test',voiceId:'test',logError:e=>logs.push(e),fetchAudio:async()=>new Response(body,{status:403})})(fleet()),e=>e.code==='VOICE_PERMISSION');
    assert.equal(logs[0].httpStatus,403);assert.ok(!JSON.stringify(logs).includes('secret-data'));
  }
});
test('voice configuration trims surrounding whitespace and rejects malformed settings without provider calls',async()=>{
  const logs=[];let called=false;
  await createVoice({apiKey:' test-key ',voiceId:' test-voice ',logError:e=>logs.push(e),fetchAudio:async(url,params)=>{called=true;assert.equal(params.headers['xi-api-key'],'test-key');assert.ok(url.includes('/test-voice?'));return audioResponse();}})(fleet());
  assert.equal(called,true);
  for(const voiceId of ['  ','https://example.com/voice','voice with spaces'])await assert.rejects(()=>createVoice({apiKey:'test',voiceId,fetchAudio:()=>assert.fail('No paid request')})(fleet()),e=>e.code==='VOICE_UNCONFIGURED');
});
