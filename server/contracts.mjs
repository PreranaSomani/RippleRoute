import {isDeepStrictEqual} from 'node:util';
import {compareFleet,shipments} from '../src/fleet.ts';
import {z} from 'zod';
import {connections,findRoute,hubs,validEndpoints} from '../src/network.ts';

export class AdvisorError extends Error {
  constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
const hubId=z.enum(hubs.map(h=>h.id));
const route=z.object({ids:z.array(hubId).min(2).max(hubs.length),edgeIds:z.array(z.string().max(60)).min(1).max(connections.length),hours:z.number().finite().positive(),cost:z.number().finite().nonnegative()}).strict();
const input=z.object({mode:z.literal('single').optional(),origin:hubId,destination:hubId,scenario:z.enum(['RR-2048','Custom plan']),objective:z.enum(['hours','cost']),disruptedHubIds:z.array(hubId).max(hubs.length),originalRoute:route.nullable(),options:z.array(route.extend({id:z.enum(['fastest','cheapest'])})).max(2)}).strict();
const fleetInput=z.object({mode:z.literal('fleet'),objective:z.enum(['hours','cost']),disruptedHubIds:z.array(hubId).max(hubs.length),shipments:z.array(z.unknown()).length(shipments.length),report:z.unknown(),options:z.array(z.never()).max(0)}).strict();
export function validateInput(raw){
  if(raw?.mode==='fleet'){
    const parsed=fleetInput.safeParse(raw);
    if(!parsed.success)throw new AdvisorError(400,'INVALID_INPUT','Invalid fleet analysis request.');
    const data=parsed.data;
    if(new Set(data.disruptedHubIds).size!==data.disruptedHubIds.length||!isDeepStrictEqual(data.shipments,shipments))throw new AdvisorError(400,'INVALID_INPUT','Fleet records must match the fictional dispatch cohort.');
    const report=compareFleet(shipments,data.disruptedHubIds,data.objective);
    if(!isDeepStrictEqual(data.report,report))throw new AdvisorError(400,'INVALID_ROUTES','Fleet report does not match server-verified shared-capacity allocation.');
    return {...data,shipments,report};
  }
  const parsed=input.safeParse(raw);
  if(!parsed.success)throw new AdvisorError(400,'INVALID_INPUT','Invalid incident data. Send endpoints, scenario, disruptions and computed route options.');
  const data=parsed.data;
  if(!validEndpoints(data.origin,data.destination)||new Set(data.disruptedHubIds).size!==data.disruptedHubIds.length)throw new AdvisorError(400,'INVALID_INPUT','Endpoints must differ and disruptions must be unique.');
  const demo=data.origin==='mill'&&data.destination==='site';
  if((data.scenario==='RR-2048')!==demo)throw new AdvisorError(400,'INVALID_INPUT','Scenario does not match the selected endpoints.');
  function same(a,b){return a&&b&&a.hours===b.hours&&a.cost===b.cost&&JSON.stringify(a.ids)===JSON.stringify(b.ids)&&JSON.stringify(a.edgeIds)===JSON.stringify(b.edgeIds);}
  const expected=[['fastest','hours'],['cheapest','cost']].flatMap(([id,metric])=>{const r=findRoute(data.origin,data.destination,metric,data.disruptedHubIds);return r?[{id,...r}]:[];});
  if(data.options.length!==expected.length||new Set(data.options.map(o=>o.id)).size!==data.options.length||expected.some(e=>!same(e,data.options.find(o=>o.id===e.id))))throw new AdvisorError(400,'INVALID_ROUTES','Route options do not match the directed network calculations.');
  if(data.originalRoute){
    const r=data.originalRoute;
    const edges=r.edgeIds.map(id=>connections.find(e=>e.id===id));
    if(r.ids[0]!==data.origin||r.ids.at(-1)!==data.destination||r.ids.length!==edges.length+1||new Set(r.ids).size!==r.ids.length||edges.some((e,i)=>!e||e.from!==r.ids[i]||e.to!==r.ids[i+1]||e.capacity<35)||edges.reduce((n,e)=>n+(e?.hours??0),0)!==r.hours||edges.reduce((n,e)=>n+(e?.cost??0),0)!==r.cost)throw new AdvisorError(400,'INVALID_ROUTES','Original route is not a valid recorded path in this network.');
  }
  return {...data,options:expected};
}
const prose=z.string().trim().min(1).max(1600);
export const analysisSchema=z.object({incidentSummary:prose,recommendedRouteId:z.enum(['fastest','cheapest']).nullable(),explanation:prose,tradeoffs:z.array(prose).max(6),warnings:z.array(prose).max(6)}).strict();
export function outputSchema(data){
  const schema=z.toJSONSchema(analysisSchema);delete schema.$schema;
  schema.properties.recommendedRouteId=data.options.length?{type:'string',enum:data.options.map(o=>o.id)}:{type:'null'};
  return schema;
}
export function validateOutput(text,data){
  let value;
  try{value=analysisSchema.parse(JSON.parse(text));}catch{throw new AdvisorError(502,'INVALID_AI_OUTPUT','Gemini returned an invalid analysis. Please retry.');}
  if(data.options.length?!data.options.some(o=>o.id===value.recommendedRouteId):value.recommendedRouteId!==null)throw new AdvisorError(502,'INVALID_RECOMMENDATION','Gemini recommended a route outside the feasible options. Please retry.');
  // Numeric route facts are rendered from verified graph data, never model prose.
  if([value.incidentSummary,value.explanation,...value.tradeoffs,...value.warnings].some(s=>/[\d$€£]/u.test(s)))throw new AdvisorError(502,'UNVERIFIED_FACTS','Gemini included unverified numeric claims. Please retry.');
  return value;
}
export function modelContext(data){
  if(data.mode==='fleet')return {...data,network:'Fictional directed dispatch cohort; no live freight data',constraints:'Use only recorded cargo quantities, priorities, deadlines and computed allocation. Heuristic baseline is not globally optimal. recommendedRouteId must be null because this is a fleet report, not a single route. No dropped freight may be described as cost savings.'};
  const describe=r=>r?{...r,path:r.ids.map(id=>hubs.find(h=>h.id===id).label)}:null;
  return {...data,origin:{id:data.origin,label:hubs.find(h=>h.id===data.origin).label},destination:{id:data.destination,label:hubs.find(h=>h.id===data.destination).label},disruptedHubs:data.disruptedHubIds.map(id=>({id,label:hubs.find(h=>h.id===id).label})),originalRoute:describe(data.originalRoute),options:data.options.map(describe),network:'Fictional directed demonstration graph; no live freight data',constraints:'No deadline, delivery progress or transport-mode data is recorded.'};
}
