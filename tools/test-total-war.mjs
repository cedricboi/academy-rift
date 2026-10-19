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
import {tallyVotes,visibleNodes,reachable,dealHits,questionHits,counterAttack,resolveFor,siegeOf,pairMP,neighbours,CAMPS,UNITS,HOME,FORTRESS,SIGHT,hops,nearestRally,auraFor} from '../public/total-war/rules.js';
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
  // Striker 2 hits, a stolen strike 1, each supporter 0.75, each War Cry 0.5
  assert.equal(questionHits({strike:true,support:4,warcry:2}),6);
  assert.equal(questionHits({steal:true,support:2}),2.5);
  assert.equal(questionHits({strike:true,warcry:2},{power:true,warcry:true}),4.5);
});
test('the Crimson hits back: every enemy standing attacks, and right answers block up to 60%',()=>{
  const foes=[{type:'orc_vanguard',hp:5,atk:2},{type:'ogre',hp:0,atk:3},{type:'warlock',hp:3,atk:2.5}];
  assert.equal(counterAttack(foes,0).total,4.5);
  assert.equal(counterAttack(foes,1).total,1.8);
  assert.equal(counterAttack(foes,1).blows.length,2,'a fallen enemy does not hit back');
  assert.equal(resolveFor(3),30);
  assert.equal(siegeOf('ogre'),6); assert.equal(siegeOf('orc_vanguard'),2);
});
test('AP: 1 to move, +1 for every right answer while preparing up to +3, +1 with Tailwind',()=>{
  assert.equal(pairMP(0),1); assert.equal(pairMP(1),2); assert.equal(pairMP(3),4); assert.equal(pairMP(9),4); assert.equal(pairMP(9,{mp:true}),5);
});
test('jungle camps sit at dead ends off the main roads, and every camp has lore and a buff',()=>{
  for(const n of Object.keys(CAMPS)){ assert.equal(neighbours(+n).length,1,`${NODES[n].name} is a dead end`); assert.ok(CAMPS[n].lore && CAMPS[n].buffText); }
  assert.ok(nearestRally(3,[2])===2); assert.equal(nearestRally(3,[]),HOME);
  assert.equal(auraFor([{type:'orc_vanguard'}]),0); assert.equal(auraFor([{type:'orc_warchanter'},{type:'ogre'}]),0.25);
});
import {alongCap,ALONG_CAP,battleLength,progressResult,TW_ITEMS,FORTRESS_GUARDS,WARCRY_CAP,PREP_AP_EACH,MUSTER_MP_CAP} from '../public/total-war/rules.js';
import {ITEMS} from '../public/data/characters.js';
test('a war fits a lesson: battles of 5, 7 at the gate and 8 against the Warlord',()=>{
  assert.equal(battleLength('host'),5); assert.equal(battleLength('camp'),5); assert.equal(battleLength('gate'),7); assert.equal(battleLength('boss'),8);
  assert.equal(battleLength('host',{stand:true}),6);
});
test('answering along: the cap grows with the pairs in the battle, so a bigger warband always helps',()=>{
  assert.equal(alongCap(1),ALONG_CAP); assert.equal(alongCap(2),ALONG_CAP);
  for(let p=2;p<10;p++) assert.ok(alongCap(p+1)>alongCap(p),`${p+1} pairs count more than ${p}`);
  assert.ok(alongCap(4)>=7,'four pairs: every supporter counts');
  assert.equal(FORTRESS_GUARDS,2); assert.ok(WARCRY_CAP>=1); assert.ok(PREP_AP_EACH<MUSTER_MP_CAP,'one partner alone cannot fill the pair\'s AP');
});
test('a war that ends early is judged on how far the class got',()=>{
  const r=(o)=>progressResult({gateHp:45,gateMax:45,broken:false,warlordHp:70,warlordMax:70,...o});
  assert.equal(r({}).winner,'crimson'); assert.equal(r({}).pct,0);
  assert.equal(r({gateHp:20}).winner,'crimson');
  assert.equal(r({gateHp:0,broken:true}).winner,'draw'); assert.equal(r({gateHp:0,broken:true}).pct,50);
  assert.equal(r({gateHp:0,broken:true,warlordHp:36}).winner,'draw');
  assert.equal(r({gateHp:0,broken:true,warlordHp:35}).winner,'crystal');
  assert.equal(r({gateHp:0,broken:true,warlordHp:0}).pct,100);
});
test('every food Grab-Ma sells does something in Total War, and says what in plain sentences',()=>{
  for(const it of ITEMS.filter((x)=>x.price&&!x.passive)){
    const t=TW_ITEMS[it.id]; assert.ok(t,`${it.id} has Total War text`);
    assert.ok(t.price>0); assert.ok(/\.$/.test(t.desc)&&!/;|—/.test(t.desc),`${it.id}: full sentences, no semicolons or dashes`);
  }
  assert.equal(TW_ITEMS.revive.eat,'full','the Phoenix Kueh brings a pair back to full HP');
  assert.ok(TW_ITEMS.durian.price<ITEMS.find((x)=>x.id==='durian').price,'the Durian Bomb is cheaper in Total War');
});

// ---- each pair fights its own monster (per-pair targets) ----
import {assignTargets,splitCounter,ENGAGED_SHARE,COUNCIL_SECONDS,STRATEGY_SECONDS,MARCH_STEP,TOPUP_SECONDS,RESUME_SECONDS} from '../public/total-war/rules.js';
test('every pair is engaged with a monster: a pair that does not pick is spread to the least-engaged one',()=>{
  // no picks: four pairs over two monsters, two on each
  let t=assignTargets(['a','b','c','d'],[0,1],{});
  assert.deepEqual(Object.values(t).sort(),[0,0,1,1]);
  // three pairs pick monster 0; the fourth (no pick) goes to monster 1, the one with nobody on it
  t=assignTargets(['a','b','c','d'],[0,1],{a:0,b:0,c:0});
  assert.equal(t.d,1);assert.equal(t.a,0);
  // a pick that is not on the field (its wave is still to come) is moved to the field
  t=assignTargets(['a','b'],[2],{a:0,b:2});
  assert.deepEqual(t,{a:2,b:2});
});
test('when its monster falls, a pair is moved to a monster still standing',()=>{
  const hp=[0,5];
  const t=assignTargets(['a','b','c'],[0,1],{a:0,b:1,c:0},(i)=>hp[i]>0);
  assert.deepEqual(t,{a:1,b:1,c:1});
});
test('a monster hits back mainly at the pairs engaging it, and the warband always takes the whole blow',()=>{
  const hp={a:10,b:10,c:10};
  const taken=splitCounter([{index:0,dmg:4}],{a:0,b:1,c:1},hp);
  // pair a is the only one on monster 0: it takes 75% of the blow plus its share of the rest
  assert.equal(ENGAGED_SHARE,0.75);
  assert.ok(Math.abs(taken.a-(3+1/3))<0.02,`a took ${taken.a}`);
  assert.ok(Math.abs(taken.b-1/3)<0.02&&Math.abs(taken.c-1/3)<0.02);
  assert.ok(Math.abs(taken.a+taken.b+taken.c-4)<0.02);
  // nobody on the monster: the blow is shared by everyone
  const even=splitCounter([{index:1,dmg:3}],{a:0,b:0,c:0},hp);
  assert.ok(Object.values(even).every((d)=>Math.abs(d-1)<0.02));
  // a pair with too little HP left: what it cannot take goes to the others
  const low=splitCounter([{index:0,dmg:6}],{a:0,b:1},{a:1,b:10});
  assert.equal(low.a,1);assert.ok(Math.abs(low.b-5)<0.02);
});
test('the movement phase is short: quick top-up, quick planning, fast march',()=>{
  assert.ok(TOPUP_SECONDS<=20);assert.ok(COUNCIL_SECONDS<=30);assert.ok(STRATEGY_SECONDS<=5);
  assert.ok(MARCH_STEP<=0.8);assert.ok(RESUME_SECONDS<=8);
  // the longest stretch from the end of the enemy's turn to the battles, for a 3-road march with no teacher extension
  assert.ok(TOPUP_SECONDS+COUNCIL_SECONDS+0.3+3*MARCH_STEP<=60);
});
test('reinforcements: each joined pair that answers right adds attack and cuts damage taken, up to a cap',async()=>{
  const R=await import('../public/total-war/rules.js');
  assert.deepEqual(R.reinforceBonus(0),{pairs:0,atk:0,guard:0});
  const one=R.reinforceBonus(1);assert.equal(one.atk,R.REINFORCE_ATK);assert.equal(one.guard,R.REINFORCE_GUARD);
  const many=R.reinforceBonus(9);assert.equal(many.atk,R.REINFORCE_ATK_CAP);assert.equal(many.guard,R.REINFORCE_GUARD_CAP);
  assert.ok(R.REINFORCE_MAX>=1&&R.REINFORCE_SECONDS>=15);
  // a pair whose battle ran on while the class prepared still gets a real move; one planning late has time to plan
  assert.ok(R.LATE_STEPS>R.BASE_MP&&R.LATE_PLAN_SECONDS>=10&&R.REGROUP_STEPS>=2);
});
test('the Basic game: a round is ANSWER, MOVE and FIGHT, and the monster hits back once for each wrong answer',async()=>{
  const R=await import('../public/total-war/rules.js');
  assert.equal(R.roundStep('crimson',null),'answer');assert.equal(R.roundStep('crystal','quiz'),'answer');
  assert.equal(R.roundStep('crystal','council'),'move');assert.equal(R.roundStep('crystal','march'),'move');
  assert.equal(R.roundStep('battles',null),'fight');assert.equal(R.roundStep(null,null),null);
  assert.equal(R.basicCounter(1,0),0);assert.equal(R.basicCounter(3,2),6);assert.equal(R.basicCounter(8,1),8);
  assert.equal(R.BASIC_QUESTIONS,1);assert.equal(R.BASIC_HIT,2);assert.ok(R.HELP_SECONDS>=10);
  // one question per ANSWER step: room for it on a slow screen (the late choices' grace) and its explanation, and short
  assert.ok(R.BASIC_ANSWER_SECONDS>=R.READ_SECONDS+R.ANSWER_SECONDS+R.SEEN_GRACE+5&&R.BASIC_ANSWER_SECONDS<=45);
  // a right answer is 2 steps (alone: 3), so a pair with both right has the most (5) and a wrong answer still moves 1
  assert.equal(R.basicSteps(0),1);assert.equal(R.basicSteps(2*R.BASIC_STEPS_EACH),5);assert.equal(R.basicSteps(R.BASIC_STEPS_SOLO),4);
  // how far the class got: the same sentence on every end screen
  assert.equal(R.howFar({reached:R.HOME}),'The class did not get far from the Academy.');
  assert.match(R.howFar({reached:R.FORTRESS,gateDmg:120,gateMax:1000,gate:false},'Your class'),/^Your class reached the Crimson Fortress and knocked 120 of 1000 health off the gate\.$/);
  assert.match(R.howFar({reached:1,stopsLeft:4}),/^The class got as far as .+, 4 stops from the Crimson Fortress\.$/);
  // every Extra has a name and a plain description, and all are off in a new war
  assert.deepEqual(R.EXTRA_KEYS,['coins','hp','moves','pick','join','warcry','camps','fog']);
  for(const k of R.EXTRA_KEYS)assert.ok(R.EXTRAS[k].name&&R.EXTRAS[k].desc&&!/;|—/.test(R.EXTRAS[k].desc));
  assert.ok(Object.values(R.noExtras()).every((v)=>v===false));
});
test('banners stand on their stop: the pole foot is in the top of the stop circle, and a stack stands side by side on it',async()=>{
  const M=await import('../public/total-war/map.js');
  const groups=[[{kind:'pair',mineBig:true}],[{kind:'host'},{kind:'pair',mineBig:true}],[{kind:'host'},{kind:'pair',small:true},{kind:'pair',small:true},{kind:'pair',mineBig:true}],[{kind:'camp'},{kind:'pair'}],[{kind:'fortress'}]];
  for(const scale of [0.45,0.62,0.8,1]){
    const r=M.STOP_R*M.circleScale(scale);
    for(let node=0;node<NODES.length;node++)for(const g of groups){
      const spots=M.stackSpots(node,g,scale);
      const cy=NODES[node].y+M.STOP_DY;                 // the centre of the stop's circle
      for(const s of spots){assert.ok(s.y>=cy-r&&s.y<=cy-r+10,`node ${node}: the foot (${s.y.toFixed(1)}) is in the top of the circle (${(cy-r).toFixed(1)})`);}
      const mid=(spots[0].x-spots[0].w/2+spots.at(-1).x+spots.at(-1).w/2)/2;
      assert.ok(Math.abs(mid-NODES[node].x)<0.01,`node ${node}: the stack is centred on the stop`);
      for(let i=1;i<spots.length;i++)assert.ok(spots[i].x-spots[i-1].x>=(spots[i].w+spots[i-1].w)/2,'banners on one stop do not cover each other');
      // the whole stack stays over its stop: no banner is nearer another stop than its own
      for(const s of spots){const own=Math.hypot(s.x-NODES[node].x,0);for(let o=0;o<NODES.length;o++)if(o!==node&&g.length<=2)assert.ok(Math.hypot(s.x-NODES[o].x,s.y-NODES[o].y-M.STOP_DY+r)>own,`node ${node}: a banner is nearer stop ${o}`);}
    }
  }
  // the Basic game's team health: enough for half the answers to be wrong, and never less than 50 a student
  const R=await import('../public/total-war/rules.js');
  assert.equal(R.basicTeamHp(2,5,3),15);assert.equal(R.basicTeamHp(6,7,6),126);assert.equal(R.basicTeamHp(1,5,1),5);
  assert.equal(R.gateNeed(6),3);assert.equal(R.gateNeed(2),2);assert.equal(R.gateNeed(0),1);assert.equal(R.BASIC_MOVE_SECONDS,45);
});
