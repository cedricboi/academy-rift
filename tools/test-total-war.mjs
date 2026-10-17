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

// ---- the game rules (rules.js) ----
import {tallyVotes,visibleNodes,reachable,dealHits,questionHits,pairMP,neighbours,CAMPS,UNITS,HOME,FORTRESS,SIGHT,hops,nearestRally,auraFor} from '../public/total-war/rules.js';
test('a warband vote: majority wins, a tie goes to the leader',()=>{
  assert.equal(tallyVotes({a:1,b:2,c:2},['a','b','c']),2);
  assert.equal(tallyVotes({a:1,b:2},['a','b']),1);
  assert.equal(tallyVotes({b:2,c:'stay'},['a','b','c']),2);
  assert.equal(tallyVotes({},['a']),null);
  assert.equal(tallyVotes({a:'stay',b:'stay',c:3},['a','b','c']),'stay');
});
test('fog of war: the class sees two roads around each banner, plus both fortresses',()=>{
  const v=visibleNodes([HOME]);
  for(const [n,d] of hops(HOME)) assert.equal(v.has(n), d<=SIGHT || n===FORTRESS, `stop ${n} at ${d} roads`);
  assert.equal(visibleNodes([],{sightAll:true}).size,NODES.length);
});
test('reachable stops respect MP and stop at blockers',()=>{
  const r=reachable(1,4,(n)=>n===3);
  assert.ok(r.has(3)); assert.ok(!r.has(4),'cannot walk past the Crimson Host on Moonstone Bridge');
  for(const [n,c] of r) assert.ok(c<=4);
  assert.equal(reachable(0,0).size,0);
});
test('battle hits go to the front enemy first and a beaten stack is reported',()=>{
  const r=dealHits([{hp:3},{hp:5}],4); assert.deepEqual(r.enemies.map(e=>e.hp),[0,4]); assert.equal(r.fallen,1); assert.equal(r.beaten,false);
  assert.equal(dealHits([{hp:2}],2.5).beaten,true);
  assert.equal(questionHits({right:4,warcry:2}),5);
  assert.equal(questionHits({right:4,warcry:2},{power:true,warcry:true}),7);
});
test('MP: 2 to move, +1 for every 2 right muster answers up to +2, +1 with Tailwind',()=>{
  assert.equal(pairMP(0),2); assert.equal(pairMP(1),2); assert.equal(pairMP(3),3); assert.equal(pairMP(4),4); assert.equal(pairMP(9),4); assert.equal(pairMP(9,{mp:true}),5);
});
test('jungle camps sit at dead ends off the main roads, and every camp has lore and a buff',()=>{
  for(const n of Object.keys(CAMPS)){ assert.equal(neighbours(+n).length,1,`${NODES[n].name} is a dead end`); assert.ok(CAMPS[n].lore && CAMPS[n].buffText); }
  assert.ok(nearestRally(3,[2])===2); assert.equal(nearestRally(3,[]),HOME);
  assert.equal(auraFor([{type:'orc_vanguard'}]),0); assert.equal(auraFor([{type:'orc_warchanter'},{type:'ogre'}]),0.25);
});
