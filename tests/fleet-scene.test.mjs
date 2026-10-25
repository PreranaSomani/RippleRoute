import test from 'node:test';
import assert from 'node:assert/strict';
import {fitFleetScene} from '../src/fleetScene.ts';
import {spatialPoints,spatialPosition} from '../src/spatialNetworkGeometry.ts';
import {connections,hubs} from '../src/network.ts';
import {compareFleet,shipments} from '../src/fleet.ts';
test('Lab camera fits complete path curves, spheres, shadows and readable labels at all requested sizes',()=>{
 const report=compareFleet(shipments,[]);
 const scenes=[hubs.map(h=>h.id),...report.current.allocations.filter(a=>a.route).map(a=>a.route.ids)];
 for(const viewport of [{width:1152,height:548},{width:1226,height:548},{width:1706,height:628},{width:800,height:538}])for(const ids of scenes){
  const camera=fitFleetScene(ids,viewport);
  for(const id of ids){const p=spatialPoints[id],x=p.x*camera.scale+camera.x,y=p.y*camera.scale+camera.y;assert.ok(x-86>=0&&x+86<=viewport.width,`${id} labels fit`);assert.ok(y-64>=0&&y+60<=viewport.height,`${id} sphere, label and shadow fit`);}
  for(const edge of connections.filter(e=>ids.includes(e.from)&&ids.includes(e.to)))for(let t=0;t<=1;t+=.05){const p=spatialPosition(edge.from,edge.to,t);assert.ok(p.x*camera.scale+camera.x>=0&&p.x*camera.scale+camera.x<=viewport.width);assert.ok(p.y*camera.scale+camera.y>=0&&p.y*camera.scale+camera.y<=viewport.height);}
 }
});
