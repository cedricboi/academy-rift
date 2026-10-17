import test from 'node:test';
import assert from 'node:assert/strict';
import {NODES,EDGES,shortest,validRoute,routePoints,positionAt,routeCost,edgeCost} from '../public/total-war/movement.js';
import {BANNERS} from '../public/total-war/banners.js';
import {readFileSync} from 'node:fs';

test('all waypoints are connected, and shortest paths use real roads',()=>{
  for(let a=0;a<NODES.length;a++)for(let b=0;b<NODES.length;b++){
    const p=shortest(a,b);assert.equal(p[0],a);assert.equal(p.at(-1),b);
    for(let i=1;i<p.length;i++)assert.ok(EDGES.some(([x,y])=>x===p[i-1]&&y===p[i]||y===p[i-1]&&x===p[i]));
  }
});
test('budget prevents a first-round rush to the enemy fortress',()=>{
  assert.equal(routeCost(shortest(0,5)),6);assert.equal(validRoute(shortest(0,5),0),false);
  assert.equal(validRoute(shortest(0,13),0),true);assert.equal(validRoute(shortest(0,8),0),true);
  assert.equal(validRoute(shortest(0,5),0,6),true);
  assert.equal(validRoute([0],0),true);assert.equal(validRoute([0,8],0),false);
  assert.equal(validRoute([0,1,2,3,4,5],0),false);assert.equal(validRoute([0],1),false);
});

test('weighted routes are optimal against independent all-pairs distances',()=>{
 const d=NODES.map((_,a)=>NODES.map((_,b)=>a===b?0:edgeCost(a,b)));
 for(let k=0;k<NODES.length;k++)for(let a=0;a<NODES.length;a++)for(let b=0;b<NODES.length;b++)d[a][b]=Math.min(d[a][b],d[a][k]+d[k][b]);
 for(let a=0;a<NODES.length;a++)for(let b=0;b<NODES.length;b++)assert.equal(routeCost(shortest(a,b)),d[a][b]);
 assert.equal(edgeCost(14,15),2);assert.equal(edgeCost(0,1),1);
});
test('seven optional destinations are true dead ends, with four movement shrines',()=>{
 assert.equal(NODES.length,26);assert.equal(EDGES.length,32);
 const leaves=NODES.map((_,i)=>i).filter(i=>EDGES.filter(e=>e.includes(i)).length===1);
 assert.deepEqual(leaves,[11,13,15,16,20,22,24]);assert.equal(NODES.filter(n=>n.bonus).length,4);
});
test('all ten banners embed their original portraits as portable SVG assets',()=>{
 assert.equal(BANNERS.length,10);assert.equal(new Set(BANNERS.map(b=>b.id)).size,10);
 for(const b of BANNERS){const svg=readFileSync(new URL('../public/total-war/'+b.src,import.meta.url),'utf8');assert.ok(svg.includes('data:image/webp;base64,'));assert.ok(svg.includes(b.name.toUpperCase()));}
});
test('reverse movement follows the identical rendered road',()=>{
  for(const [a,b] of EDGES){const forward=routePoints([a,b]),backward=routePoints([b,a]).reverse();assert.deepEqual(forward,backward);}
});
test('distance sampler starts correctly, reaches endpoints and never overshoots',()=>{
  const p=routePoints(shortest(0,4)),start=positionAt(p,0),end=positionAt(p,1e6);
  assert.equal(start.x,NODES[0].x);assert.equal(start.y,NODES[0].y);
  assert.equal(end.x,NODES[4].x);assert.equal(end.y,NODES[4].y);assert.ok(end.done);
  let prev=start;for(let d=1;d<400;d++){const next=positionAt(p,d);assert.ok(Math.hypot(next.x-prev.x,next.y-prev.y)<=1.001);prev=next;}
});
