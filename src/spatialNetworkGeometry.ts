import {hubs,connections} from './network.ts';
export type Camera={x:number;y:number;scale:number};
export type SpatialViewport={width:number;height:number};
export const defaultViewport:SpatialViewport={width:1200,height:650};
export const overviewCamera:Camera={x:0,y:0,scale:1};
// Presentation coordinates only. Neither this projection nor camera focus changes routing data.
export const spatialPoints=Object.fromEntries(hubs.map(h=>[h.id,{x:h.x*1.1+35,y:h.y*.96+15}]));
export type SpatialPoints=typeof spatialPoints;
// Preserve the original spatial proportions at every size; only the camera may scale.
export function layoutPoints(_viewport:SpatialViewport):SpatialPoints{return spatialPoints;}
export function connectedHubIds(id:string){return new Set([id,...connections.filter(e=>e.from===id||e.to===id).flatMap(e=>[e.from,e.to])]);}
export function fitCamera(ids:Iterable<string>,viewport:SpatialViewport,points:SpatialPoints,reserveInspector=false):Camera{
  const selected=[...ids].map(id=>points[id]);
  const minX=Math.min(...selected.map(p=>p.x)),maxX=Math.max(...selected.map(p=>p.x));
  const minY=Math.min(...selected.map(p=>p.y)),maxY=Math.max(...selected.map(p=>p.y));
  const reserve=reserveInspector&&viewport.width>=900?288:0;
  const width=viewport.width-reserve-32,height=viewport.height-54;
  // Label padding is in screen pixels: zooming never shrinks labels below readable type.
  let scale=Math.max(.2,Math.min(reserveInspector?1.7:1.3,(width-192)/Math.max(1,maxX-minX),(height-75)/(Math.max(1,maxY-minY)+56)));
  if(scale<1)scale=Math.max(.2,Math.min(scale,(height-131)/Math.max(1,maxY-minY)));
  const materialScale=Math.max(1,scale);
  return {x:16+width/2-(minX+maxX)/2*scale,y:(44+28*materialScale)+(height-75-56*materialScale)/2-(minY+maxY)/2*scale,scale};
}
export function focusCamera(id:string,viewport=defaultViewport,points=spatialPoints):Camera{
  // A short mobile focus window keeps the selected sphere large; adjacent paths
  // continue beyond the canvas and remain navigable from the contextual inspector.
  if(viewport.width<900&&viewport.height<=300){const scale=1;return {x:viewport.width/2-points[id].x*scale,y:viewport.height/2-points[id].y*scale,scale};}
  return fitCamera(connectedHubIds(id),viewport,points,true);
}
export function spatialPath(from:string,to:string,points=spatialPoints){const a=points[from],b=points[to];return `M${a.x} ${a.y} Q${(a.x+b.x)/2} ${(a.y+b.y)/2-34} ${b.x} ${b.y}`;}
export function spatialPosition(from:string,to:string,t:number,points=spatialPoints){const a=points[from],b=points[to];return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t-68*t*(1-t)};}
export function zoomCamera(camera:Camera,factor:number,viewport=defaultViewport):Camera{const scale=Math.max(.35,Math.min(2.3,camera.scale*factor)),ratio=scale/camera.scale;return {x:viewport.width/2-(viewport.width/2-camera.x)*ratio,y:viewport.height/2-(viewport.height/2-camera.y)*ratio,scale};}

// Retain the original apparent sphere size when fitting a smaller overview.
export function spatialRadius(type:string,scale:number){return (type==='port'?25:type==='destination'?28:23)/Math.min(1,scale);}
