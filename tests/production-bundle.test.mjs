import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {compareFleet,shipments} from '../src/fleet.ts';

test('production function runs without src, backend sources, or Node TypeScript support; health, voice and Gemini work',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'rippleroute-production-'));
  try{
    await mkdir(join(dir,'api'));
    await mkdir(join(dir,'server/generated'),{recursive:true});
    await copyFile(new URL('../api/index.mjs',import.meta.url),join(dir,'api/index.mjs'));
    await copyFile(new URL('../server/generated/vercel.mjs',import.meta.url),join(dir,'server/generated/vercel.mjs'));
    await symlink(fileURLToPath(new URL('../node_modules',import.meta.url)),join(dir,'node_modules'),'dir');
    const input={mode:'fleet',objective:'hours',disruptedHubIds:[],shipments,report:compareFleet(shipments,[]),options:[]};
    await writeFile(join(dir,'input.json'),JSON.stringify(input));
    await writeFile(join(dir,'smoke.mjs'),`
      import assert from 'node:assert/strict';
      import {readFileSync} from 'node:fs';
      const input=JSON.parse(readFileSync(new URL('./input.json',import.meta.url)));
      const analysis={incidentSummary:'Shared capacity is reserved.',recommendedRouteId:null,explanation:'The supplied allocation respects corridor capacity.',tradeoffs:[],warnings:[]};
      const nativeFetch=globalThis.fetch;
      let voiceCalls=0,geminiCalls=0;
      const audio=new Uint8Array([0x49,0x44,0x33,4,0,0]);
      globalThis.fetch=async(url,options)=>{
        const address=String(url);
        if(address.startsWith('https://api.elevenlabs.io/')){
          voiceCalls++;assert.match(JSON.parse(options.body).text,/105 tonnes against 90 tonnes/);
          return new Response(audio,{headers:{'Content-Type':'audio/mpeg'}});
        }
        if(address.startsWith('https://generativelanguage.googleapis.com/')){
          geminiCalls++;
          return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:JSON.stringify(geminiCalls===1?{...analysis,explanation:'The route takes 35 hours.'}:analysis)}]},finishReason:'STOP'}]}),{headers:{'Content-Type':'application/json'}});
        }
        throw new Error('Unexpected outbound request: blocked by production test');
      };
      const {default:handler}=await import('./api/index.mjs');
      const server=handler.listen(0,'127.0.0.1');
      await new Promise((r,j)=>{server.once('listening',r);server.once('error',j);});
      const base='http://127.0.0.1:'+server.address().port;
      const post=path=>nativeFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      try{
        const health=await nativeFetch(base+'/api/health');assert.equal(health.status,200);assert.equal((await health.json()).advisorConfigured,true);
        const voice=await post('/api/voice/briefing');assert.equal(voice.status,200);assert.match(voice.headers.get('content-type'),/^audio\\/mpeg/);assert.deepEqual(new Uint8Array(await voice.arrayBuffer()),audio);
        const gemini=await post('/api/ai/analyze');assert.equal(gemini.status,200);assert.equal((await gemini.json()).source,'gemini');
        const disconnected=await nativeFetch(base+'/api/incidents');assert.equal(disconnected.status,503);
        assert.equal(voiceCalls,1);assert.equal(geminiCalls,2);
        console.log('Production artifact initialized and served health, binary audio and Gemini with source files absent and TypeScript support disabled.');
      }finally{await new Promise(r=>server.close(r));}
    `);
    const result=spawnSync(process.execPath,['--no-experimental-strip-types',join(dir,'smoke.mjs')],{
      cwd:dir,encoding:'utf8',timeout:20000,
      env:{PATH:process.env.PATH,GEMINI_API_KEY:'production-test-key',ELEVENLABS_API_KEY:'production-test-key',ELEVENLABS_VOICE_ID:'production-test-voice',ENABLE_SAVED_HISTORY:'false'}
    });
    assert.equal(result.status,0,result.stderr||result.stdout||'Production smoke test failed');
  }finally{await rm(dir,{recursive:true,force:true});}
});
