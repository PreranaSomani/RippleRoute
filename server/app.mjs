import express from 'express';
import {AdvisorError} from './contracts.mjs';
import {createAdvisor,DEFAULT_MODEL} from './advisor.mjs';
export function createApp({apiKey,model=DEFAULT_MODEL,generate}={}){
  const app=express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'24kb',strict:true}));
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.get('/api/health',(_req,res)=>res.json({status:'ok',advisorConfigured:Boolean(apiKey&&apiKey!=='replace_with_your_gemini_api_key'),model}));
  const analyze=createAdvisor({apiKey,model,generate});
  // One provider request at a time for this local-only server; no automatic paid retries.
  let busy=false;
  app.post('/api/ai/analyze',async(req,res,next)=>{
    if(busy)return res.status(429).json({error:{code:'ADVISOR_BUSY',message:'An analysis is already running. Retry after it finishes.'}});
    busy=true;
    const controller=new AbortController();
    const disconnect=()=>{if(!res.writableFinished)controller.abort();};
    res.on('close',disconnect);
    try{res.json(await analyze(req.body,{signal:controller.signal}));}catch(error){if(!res.destroyed)next(error);}finally{res.off('close',disconnect);busy=false;}
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'API endpoint not found.'}}));
  app.use((error,_req,res,_next)=>{
    const known=error instanceof AdvisorError;
    const status=known?error.status:error.type==='entity.too.large'?413:error.type==='entity.parse.failed'?400:500;
    res.status(status).json({error:{code:known?error.code:'INVALID_REQUEST',message:known?error.message:status===413?'Request body is too large.':status===400?'Request body must be valid JSON.':'The advisor could not complete this request.'}});
  });
  return app;
}
