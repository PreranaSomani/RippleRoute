import {shipments} from './fleet';
import {hubs,type Route} from './network';
import type {Simulation} from './useSimulation';
export type Analysis={incidentSummary:string;recommendedRouteId:'fastest'|'cheapest'|null;explanation:string;tradeoffs:string[];warnings:string[]};
export type AdvisorResponse={source:'gemini';model:string;analysis:Analysis};
export function advisorInput(sim:Simulation){
  if(sim.planningMode==='fleet'&&!sim.currentFleet)throw new Error('Re-run fleet allocation before requesting advice.');
  if(sim.planningMode==='fleet'&&sim.currentFleet)return {mode:'fleet' as const,objective:sim.objective,disruptedHubIds:[...sim.closed].sort(),shipments,report:sim.currentFleet,options:[]};
  return {mode:'single' as const,origin:sim.origin,destination:sim.destination,scenario:sim.context,objective:sim.objective,disruptedHubIds:[...sim.closed].sort(),originalRoute:sim.previous?.[sim.objective]??null,options:[{id:'fastest',route:sim.fastest},{id:'cheapest',route:sim.cheapest}].flatMap(({id,route})=>route?[{id,...route}]:[])};
}
export function routeLabel(route:Route){return route.ids.map(id=>hubs.find(h=>h.id===id)?.label).join(' → ');}
export async function requestAdvice(input:ReturnType<typeof advisorInput>,signal:AbortSignal):Promise<AdvisorResponse>{
  let response:Response;
  try{response=await fetch('/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});}
  catch(error){if(signal.aborted)throw error;throw new Error('Cannot reach the advisor server. Start it with npm run server and retry.');}
  let data;
  try{data=await response.json();}catch{throw new Error('The advisor server returned an invalid response. Check that the backend is running.');}
  if(!response.ok)throw new Error(data.error?.message||'Gemini analysis failed. Please retry.');
  const a=data.analysis;
  if(data.source!=='gemini'||typeof data.model!=='string'||!a||typeof a.incidentSummary!=='string'||typeof a.explanation!=='string'||!Array.isArray(a.tradeoffs)||!a.tradeoffs.every((x:unknown)=>typeof x==='string')||!Array.isArray(a.warnings)||!a.warnings.every((x:unknown)=>typeof x==='string')||(input.options.length?!input.options.some(o=>o.id===a.recommendedRouteId):a.recommendedRouteId!==null))throw new Error('The advisor returned an invalid recommendation. Please retry.');
  return data;
}
