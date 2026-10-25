import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findRoute} from '../src/network.ts';
import {createVoice} from '../server/voice.mjs';
const input=()=>({mode:'single',origin:'mill',destination:'site',scenario:'RR-2048',objective:'hours',disruptedHubIds:[],originalRoute:null,options:[['fastest','hours'],['cheapest','cost']].map(([id,metric])=>({id,...findRoute('mill','site',metric,[])}))});
test('Vercel adapter uses server env, serves original API paths and binary audio, and keeps database optional',async()=>{
  const names=['GEMINI_API_KEY','GEMINI_MODEL','ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID','ENABLE_SAVED_HISTORY','DATABASE_URL'];
  const previous=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  delete process.env.GEMINI_API_KEY;delete process.env.GEMINI_MODEL;
  process.env.ELEVENLABS_API_KEY='adapter-test-key';process.env.ELEVENLABS_VOICE_ID='adapter-test-voice';
  delete process.env.ENABLE_SAVED_HISTORY;process.env.DATABASE_URL='deliberately-invalid-disabled-database';
  const nativeFetch=globalThis.fetch;let providerCalls=0;
  const bytes=new Uint8Array([0x49,0x44,0x33,4,0,0,0]);
  globalThis.fetch=async(url,options)=>{
    assert.match(String(url),/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\//);
    providerCalls++;assert.equal(options.headers['xi-api-key'],'adapter-test-key');
    return new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}});
  };
  let server;
  try{
    const {default:handler}=await import('../api/index.mjs?test-adapter');
    server=handler.listen(0,'127.0.0.1');await new Promise((r,j)=>{server.once('listening',r);server.once('error',j);});
    const base=`http://127.0.0.1:${server.address().port}`;
    const health=await nativeFetch(base+'/api/health');assert.equal(health.status,200);assert.equal((await health.json()).advisorConfigured,false);
    const missing=await nativeFetch(base+'/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input())});assert.equal(missing.status,503);
    const voice=await nativeFetch(base+'/api/voice/briefing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input())});
    assert.equal(voice.status,200);assert.match(voice.headers.get('content-type'),/^audio\/mpeg/);assert.ok(voice.headers.get('x-briefing-transcript'));assert.deepEqual(new Uint8Array(await voice.arrayBuffer()),bytes);assert.equal(providerCalls,1);
    const history=await nativeFetch(base+'/api/incidents');assert.equal(history.status,503);assert.equal((await history.json()).error.code,'DATABASE_DISCONNECTED');
    const unknown=await nativeFetch(base+'/api/not-a-route');assert.equal(unknown.status,404);assert.equal((await unknown.json()).error.code,'NOT_FOUND');
    const large=await nativeFetch(base+'/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(25000)})});assert.equal(large.status,413);
  }finally{globalThis.fetch=nativeFetch;for(const n of names){if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n];}if(server)await new Promise(r=>server.close(r));}
});
test('Vercel audio limit rejects oversized provider response with explicit JSON-safe error',async()=>{
  const voice=createVoice({apiKey:'test',voiceId:'test',maxAudioBytes:4_000_000,fetchAudio:async()=>new Response(new Uint8Array(4_000_001),{headers:{'Content-Type':'audio/mpeg'}})});
  await assert.rejects(()=>voice(input()),e=>e.status===502&&e.code==='VOICE_TOO_LARGE');
});
test('deployment keeps static Vite output, a Hobby-compatible function budget, and secret exclusions',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.framework,'vite');assert.equal(config.outputDirectory,'dist');assert.ok(config.functions['api/index.mjs'].maxDuration>=45&&config.functions['api/index.mjs'].maxDuration<=60);
  assert.ok(config.rewrites.every(r=>r.source.startsWith('/api')));
  const ignore=readFileSync(new URL('../.vercelignore',import.meta.url),'utf8');assert.ok(ignore.includes('**/.env'));assert.ok(config.functions['api/index.mjs'].excludeFiles.includes('**/.env'));
});
