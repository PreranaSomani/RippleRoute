import {spatialPoints,type Camera,type SpatialViewport} from './spatialNetworkGeometry.ts';

// Fixed screen-space padding covers 172px labels, spheres, shadows and curve bends.
// This changes only the Lab camera, never the network's presentation coordinates.
export function fitFleetScene(ids:Iterable<string>,viewport:SpatialViewport):Camera{
 const points=[...new Set(ids)].map(id=>spatialPoints[id]).filter(Boolean);
 if(!points.length)return {x:viewport.width/2,y:viewport.height/2,scale:1};
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
 const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
 const scale=Math.max(.05,Math.min(1.45,(viewport.width-204)/Math.max(1,maxX-minX),(viewport.height-190)/Math.max(1,maxY-minY)));
 return {scale,x:viewport.width/2-(minX+maxX)/2*scale,y:96+(viewport.height-190)/2-(minY+maxY)/2*scale};
}
