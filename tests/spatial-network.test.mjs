import test from 'node:test';
import assert from 'node:assert/strict';
import {connections,hubs} from '../src/network.ts';
import {connectedHubIds,fitCamera,focusCamera,layoutPoints,overviewCamera,spatialPoints,spatialPath,spatialPosition,spatialRadius,zoomCamera} from '../src/spatialNetworkGeometry.ts';
test('spatial focus frames the selected hub and all directly connected hubs outside the inspector area',()=>{
  for(const hub of hubs){
    const camera=focusCamera(hub.id);
    for(const id of connectedHubIds(hub.id)){
      const p=spatialPoints[id],x=p.x*camera.scale+camera.x,y=p.y*camera.scale+camera.y;
      assert.ok(x>30&&x<850,`${hub.id}: ${id} x=${x}`);
      assert.ok(y>40&&y<585,`${hub.id}: ${id} y=${y}`);
    }
  }
});
test('cargo interpolation follows the rendered quadratic path with exact directed endpoints',()=>{
  assert.equal(Object.keys(spatialPoints).length,hubs.length);
  for(const edge of connections){
    assert.deepEqual(spatialPosition(edge.from,edge.to,0),spatialPoints[edge.from]);
    assert.deepEqual(spatialPosition(edge.from,edge.to,1),spatialPoints[edge.to]);
    assert.ok(spatialPath(edge.from,edge.to).includes(' Q'));
    const mid=spatialPosition(edge.from,edge.to,.5),a=spatialPoints[edge.from],b=spatialPoints[edge.to];
    assert.equal(mid.x,(a.x+b.x)/2);assert.equal(mid.y,(a.y+b.y)/2-17);
  }
});
test('camera zoom is bounded and leaves simulation coordinates unchanged',()=>{
  const before=JSON.stringify(hubs);let camera=overviewCamera;
  for(let i=0;i<30;i++)camera=zoomCamera(camera,2);assert.equal(camera.scale,2.3);
  for(let i=0;i<30;i++)camera=zoomCamera(camera,.5);assert.equal(camera.scale,.35);
  assert.equal(JSON.stringify(hubs),before);
});

test('responsive fits reserve fixed-size labels and a camera-control strip at laptop and compact embed sizes',()=>{
  for(const viewport of [{width:1308,height:320},{width:1382,height:450},{width:800,height:360},{width:920,height:260}]){
    const points=layoutPoints(viewport),camera=fitCamera(hubs.map(h=>h.id),viewport,points);
    for(const hub of hubs){
      const p=points[hub.id],x=p.x*camera.scale+camera.x,y=p.y*camera.scale+camera.y;
      assert.ok(x-86>=0&&x+86<=viewport.width,hub.id+' label horizontal fit');
      assert.ok(y-28*Math.max(1,camera.scale)-40>=0,hub.id+' label top fit');
      assert.ok(y+28*Math.max(1,camera.scale)+27<=viewport.height-30,hub.id+' closed label bottom fit');
    }
    for(const hub of hubs){
      const focused=focusCamera(hub.id,viewport,points),right=viewport.width-(viewport.width>=900?288:0);
      for(const id of connectedHubIds(hub.id)){
        const p=points[id],x=p.x*focused.scale+focused.x,y=p.y*focused.scale+focused.y;
        assert.ok(x-86>=0&&x+86<=right,id+' outside inspector');
        assert.ok(y-28*Math.max(1,focused.scale)-40>=0,id+' focus top fit');
      }
    }
  }
});

test('container size never flattens or stretches the original spatial layout',()=>{
  for(const viewport of [{width:1080,height:440},{width:1080,height:570},{width:800,height:360},{width:800,height:260}]){
    const points=layoutPoints(viewport);
    assert.deepEqual(points,spatialPoints);
    const camera=fitCamera(hubs.map(h=>h.id),viewport,points);
    const a=points.mill,b=points.site;
    const screenDx=(b.x*camera.scale+camera.x)-(a.x*camera.scale+camera.x);
    const screenDy=(b.y*camera.scale+camera.y)-(a.y*camera.scale+camera.y);
    assert.ok(Math.abs(screenDx/(b.x-a.x)-screenDy/(b.y-a.y))<1e-10,'camera must use equal X and Y scale');
  }
});

test('fitted hubs retain their original apparent radius without nonuniform scaling',()=>{
  for(const scale of [.35,.65,1,1.7]){
    assert.ok(Math.abs(spatialRadius('rail',scale)*scale-Math.max(23,23*scale))<1e-8);
    assert.ok(Math.abs(spatialRadius('destination',scale)*scale-Math.max(28,28*scale))<1e-8);
  }
});

test('short mobile focus centers the selected full-size sphere instead of compressing its neighborhood',()=>{
  const viewport={width:800,height:240},points=layoutPoints(viewport);
  for(const h of hubs){const camera=focusCamera(h.id,viewport,points);assert.equal(camera.scale,1);assert.equal(points[h.id].x+camera.x,400);assert.equal(points[h.id].y+camera.y,120);}
});
