import {connections,hubs,type Route} from './network';

export const clamp=(value:number,max=1)=>Math.max(0,Math.min(max,Number.isFinite(value)?value:0));
export function advance(position:number,max:number,step:number,loop=false){
  return position+step>max?(loop?0:max):position+step;
}
// Position is weighted by actual edge duration, never by invented shipment progress.
export function routePosition(route:Route|null,progress:number){
  if(!route||!route.edgeIds.length)return null;
  const elapsed=clamp(progress)*route.hours;
  let start=0;
  for(let i=0;i<route.edgeIds.length;i++){
    const edge=connections.find(e=>e.id===route.edgeIds[i])!;
    if(elapsed<=start+edge.hours||i===route.edgeIds.length-1){
      const t=clamp((elapsed-start)/edge.hours);
      const a=hubs.find(h=>h.id===edge.from)!,b=hubs.find(h=>h.id===edge.to)!;
      return {edge,index:i,t,elapsed,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t-30*t*(1-t)};
    }
    start+=edge.hours;
  }
  return null;
}
export function checkpointProgress(route:Route,index:number){
  return route.edgeIds.slice(0,index).reduce((sum,id)=>sum+connections.find(e=>e.id===id)!.hours,0)/route.hours;
}
export function segmentMode(from:string,to:string){
  // The original graph has hub types, but no transport-mode metadata on edges.
  const a=hubs.find(h=>h.id===from)!,b=hubs.find(h=>h.id===to)!;
  return `${a.type} → ${b.type} transfer · mode not recorded`;
}
