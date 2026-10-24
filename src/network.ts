export type HubType='mill'|'port'|'rail'|'warehouse'|'destination';
export type Hub={id:string;label:string;type:HubType;x:number;y:number;city:string};
export type Connection={id:string;from:string;to:string;hours:number;cost:number;capacity:number};
export type Route={ids:string[];edgeIds:string[];hours:number;cost:number};
export const hubs:Hub[]=[
{id:'mill',label:'Steelworks',type:'mill',x:110,y:304,city:'Pittsburgh'},
{id:'rail1',label:'Allegheny Rail',type:'rail',x:278,y:220,city:'Pennsylvania'},
{id:'portA',label:'Harbor East',type:'port',x:470,y:137,city:'New Jersey'},
{id:'rail2',label:'Central Junction',type:'rail',x:425,y:355,city:'Ohio'},
{id:'portB',label:'Bluewater Port',type:'port',x:663,y:265,city:'Maryland'},
{id:'depot',label:'Union Depot',type:'warehouse',x:666,y:435,city:'Virginia'},
{id:'portC',label:'Southport',type:'port',x:847,y:155,city:'North Carolina'},
{id:'site',label:'Build Site',type:'destination',x:902,y:369,city:'Richmond'},
{id:'yard',label:'Inland Yard',type:'warehouse',x:274,y:435,city:'West Virginia'},
{id:'hub',label:'Midway Hub',type:'rail',x:781,y:505,city:'Virginia'}
];
const e=(from:string,to:string,hours:number,cost:number,capacity=120):Connection=>({id:`${from}-${to}`,from,to,hours,cost,capacity});
export const connections:Connection[]=[
e('mill','rail1',9,560),e('mill','yard',12,400),e('rail1','portA',8,540),e('rail1','rail2',8,260),e('yard','rail2',6,360),e('yard','depot',16,740),e('rail2','portB',11,420),e('rail2','depot',9,520),e('portA','portB',6,800),e('portA','portC',14,920),e('portB','portC',8,610),e('portB','site',13,760),e('portB','depot',6,350),e('portC','site',7,440),e('depot','site',9,430),e('depot','hub',4,220),e('hub','site',7,400)];
// Connections are directed freight legs; reverse travel requires an explicit edge.
export const originId='mill';
export const destinationId='site';
export const validEndpoints=(origin:string,destination:string)=>origin!==destination&&hubs.some(h=>h.id===origin)&&hubs.some(h=>h.id===destination);
export const canDisrupt=(id:string,origin=originId,destination=destinationId)=>hubs.some(h=>h.id===id)&&id!==origin&&id!==destination;
export function toggleDisruption(closed:string[],id:string,origin=originId,destination=destinationId):string[]{
  if(closed.includes(id))return closed.filter(x=>x!==id);
  if(!canDisrupt(id,origin,destination))return closed;
  return closed.includes(id)?closed.filter(x=>x!==id):[...closed,id];
}
export function findRoute(origin:string,destination:string,metric:'hours'|'cost',closed:string[],minCapacity=35):Route|null {
  const ids=new Set(hubs.map(h=>h.id));
  if(origin===destination||!ids.has(origin)||!ids.has(destination)||closed.includes(origin)||closed.includes(destination))return null;
  const dist=new Map<string,number>([[origin,0]]), prev=new Map<string,Connection>(), seen=new Set<string>();
  while(true){
    let current:string|undefined, best=Infinity;
    for(const [id,value] of dist) if(!seen.has(id)&&value<best){current=id;best=value;}
    if(!current)break;
    if(current===destination)break;
    seen.add(current);
    for(const edge of connections.filter(x=>x.from===current&&x.capacity>=minCapacity&&!closed.includes(x.to))){
      const candidate=best+edge[metric];
      if(candidate<(dist.get(edge.to)??Infinity)){dist.set(edge.to,candidate);prev.set(edge.to,edge);}
    }
  }
  if(!dist.has(destination))return null;
  const routeEdges:Connection[]=[];
  for(let at=destination;at!==origin;){const edge=prev.get(at);if(!edge)return null;routeEdges.unshift(edge);at=edge.from;}
  return {ids:[origin,...routeEdges.map(e=>e.to)],edgeIds:routeEdges.map(e=>e.id),hours:routeEdges.reduce((s,e)=>s+e.hours,0),cost:routeEdges.reduce((s,e)=>s+e.cost,0)};
}
export const fmt=(n:number)=>new Intl.NumberFormat('en-US').format(n);
