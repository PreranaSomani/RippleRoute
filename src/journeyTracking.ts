import {connections,type Route} from './network.ts';
export function trackingCheckpoints(route:Route,elapsed:number){
 let hours=0;
 const stops=route.ids.map((id,index)=>{if(index)hours+=connections.find(e=>e.id===route.edgeIds[index-1])!.hours;return {id,index,hours};});
 const current=Math.max(0,stops.reduce((last,s)=>s.hours<=elapsed+1e-7?s.index:last,0));
 return stops.map(s=>({...s,state:s.index<current?'completed':s.index===current?'current':s.index===current+1?'next':'upcoming'}));
}
