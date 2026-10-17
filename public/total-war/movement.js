// Total War is isolated from Arena. Terrain costs and geometry are shared by UI and simulation.
export const POINTS = 4;
export const NODES = [
  {x:227,y:463,name:'Academy Ward',kind:'home',desc:'Your warbands muster here and come back here to rest.'},
  {x:427,y:392,name:'Lantern Crossroads',kind:'crossroads',desc:'The central decision: climb north, follow the southern road, or brave the ford.'},
  {x:477,y:195,name:'Whispering Watch',kind:'outpost',desc:'The northern approach. Detour to the Windspire or press for Moonstone Bridge.'},
  {x:762,y:244,name:'Moonstone Bridge',kind:'bridge',desc:'Northern river crossing. A narrow approach feeds into the eastern ruins.'},
  {x:925,y:241,name:'Old Sanctum',kind:'ruin',desc:'A fork towards the eastern gate or the long observatory detour.'},
  {x:1218,y:472,name:'Crimson Fortress',kind:'enemy',desc:'The opposing fortress. Movement ends here; combat is not yet implemented.'},
  {x:501,y:593,name:'Silverwood Camp',kind:'camp',desc:'The southern staging ground. The quarry is a separate, optional expedition.'},
  {x:753,y:608,name:'Willow Bridge',kind:'bridge',desc:'The southern crossing. The Drowned Vault branches away from the fortress road.'},
  {x:1033,y:573,name:'Sunken Watch',kind:'outpost',desc:'Choose the direct inner approach or the outer orchard loop.'},
  {x:990,y:410,name:'Riftstone Circle',kind:'circle',desc:'The eastern route hub, reached quickly through the costly central ford.'},
  {x:345,y:269,name:'Crescent Junction',kind:'crossroads',desc:'A woodland fork between Moonwell, Highridge and Whispering Watch.'},
  {x:233,y:167,name:'Moonwell',kind:'buff',bonus:1,monster:0,desc:'Rested march: arrive here for +1 MP next round. This path ends at the well.'},
  {x:404,y:138,name:'Highridge Trail',kind:'crossroads',desc:'A longer northern loop. Rough woodland stretches cost 2 MP.'},
  {x:575,y:94,name:'Windspire',kind:'buff',bonus:2,monster:1,desc:'Tailwind: arrive here for +2 MP next round. Return by the same path.'},
  {x:327,y:518,name:'Willow Junction',kind:'crossroads',desc:'The southern departure road splits towards camp and the ancient grove.'},
  {x:186,y:735,name:'Ancient Grove',kind:'buff',bonus:1,monster:2,desc:'Rootstride: arrive here for +1 MP next round. A secluded dead-end sanctuary.'},
  {x:536,y:744,name:'Riftglass Quarry',kind:'lair',monster:3,desc:'Basilisk territory. Proposed reward: armour-piercing crystal. Combat reward is a concept only.'},
  {x:586,y:400,name:'Briar Hollow',kind:'crossroads',desc:'The short way across the map, but the rough ford consumes more movement.'},
  {x:768,y:410,name:'Shattered Ford',kind:'ford',desc:'A third crossing over exposed stepping stones. Both approaches cost 2 MP.'},
  {x:885,y:400,name:'Eastbank Steps',kind:'crossroads',desc:'A rocky exit from the ford, leading into the eastern rune circle.'},
  {x:853,y:753,name:'Drowned Vault',kind:'lair',monster:4,desc:'Ferryman territory. Proposed reward: a scouting lantern. Combat reward is a concept only.'},
  {x:1108,y:100,name:'Stargazer Ridge',kind:'crossroads',desc:'The long eastern loop, with an optional observatory at its far end.'},
  {x:1317,y:153,name:'Star Observatory',kind:'buff',bonus:1,desc:'Starpaths: arrive here for +1 MP next round. No onward route to the fortress.'},
  {x:1194,y:590,name:'Crimson Orchard',kind:'crossroads',desc:'An outer approach to the fortress, or a dangerous detour into the brood nest.'},
  {x:1316,y:753,name:'Crimson Nest',kind:'lair',monster:5,desc:'Broodmother territory. Proposed reward: a siege sigil. Combat reward is a concept only.'},
  {x:1040,y:288,name:'Ashen Junction',kind:'crossroads',desc:'The inner eastern fork connects the sanctuary, ridge and fortress approach.'}
];
export const EDGES = [[0,1],[0,14],[1,10],[10,2],[10,12],[12,2],[10,11],[2,13],[2,3],[3,4],[4,25],[25,5],[4,21],[21,22],[21,25],[1,6],[14,6],[14,15],[6,16],[6,7],[7,8],[7,20],[8,23],[23,5],[23,24],[8,9],[9,25],[9,5],[1,17],[17,18],[18,19],[19,9]];
const rough=new Set(['10,12','12,2','14,15','6,16','7,20','23,24','17,18','18,19']);
export function edgeCost(a,b){const edge=EDGES.find(([x,y])=>x===a&&y===b||y===a&&x===b);return edge?(rough.has(edge.join(','))?2:1):Infinity;}
export function routeCost(route){return route.slice(1).reduce((sum,n,i)=>sum+edgeCost(route[i],n),0);}
export function shortest(from,to){
  const distance=NODES.map(()=>Infinity),paths=NODES.map(()=>[]),remaining=new Set(NODES.map((_,i)=>i));distance[from]=0;paths[from]=[from];
  while(remaining.size){const a=[...remaining].reduce((best,n)=>distance[n]<distance[best]?n:best);remaining.delete(a);if(a===to)return paths[a];if(!Number.isFinite(distance[a]))break;
    for(const [x,y] of EDGES){const b=x===a?y:y===a?x:null;if(b===null||!remaining.has(b))continue;const cost=distance[a]+edgeCost(a,b);if(cost<distance[b]){distance[b]=cost;paths[b]=[...paths[a],b];}}
  }return [];
}
export function validRoute(route,origin,budget=POINTS){return Array.isArray(route)&&route.length>0&&route[0]===origin&&route.every(n=>Number.isInteger(n)&&NODES[n])&&Number.isFinite(routeCost(route))&&routeCost(route)<=budget;}
export function road(a,b){
  const bends={
    '0,1':[[260,422],[338,411]],'0,14':[[250,494],[285,514]],'1,10':[[430,351],[387,309]],
    '10,2':[[409,254],[470,237]],'10,12':[[373,218],[365,190]],'12,2':[[424,166],[437,188]],
    '10,11':[[299,238],[253,210]],'2,13':[[517,162],[548,115]],'2,3':[[556,217],[640,240],[686,244]],
    '3,4':[[840,257],[885,253]],'4,25':[[971,267]],'25,5':[[1101,323],[1171,370],[1176,424]],
    '4,21':[[982,205],[1044,137]],'21,22':[[1188,116],[1260,139]],'21,25':[[1067,163],[1067,238]],
    '1,6':[[463,457],[485,521]],'14,6':[[390,523],[466,528]],'14,15':[[307,566],[276,617],[225,685]],
    '6,16':[[497,639],[487,673],[515,712]],'6,7':[[565,605],[651,611]],'7,8':[[839,614],[934,600]],
    '7,20':[[821,628],[838,683],[856,717]],'8,23':[[1089,590],[1141,600]],'23,5':[[1221,548],[1208,505]],
    '23,24':[[1249,622],[1268,650],[1283,701]],'8,9':[[1019,508],[1014,457]],'9,25':[[1004,368]],
    '9,5':[[1073,410],[1135,407],[1174,443]],'1,17':[[499,401],[541,409]],'17,18':[[646,404],[700,390]],
    '18,19':[[824,413],[850,397]],'19,9':[[941,408]]
  };
  const knots=[NODES[a],...(bends[`${a},${b}`]||[]).map(([x,y])=>({x,y})),NODES[b]],pts=[];
  for(let i=0;i<knots.length-1;i++){
    const p0=knots[Math.max(0,i-1)],p1=knots[i],p2=knots[i+1],p3=knots[Math.min(knots.length-1,i+2)];
    for(let j=0;j<20;j++){const t=j/20,t2=t*t,t3=t2*t;const val=k=>.5*(2*p1[k]+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3);pts.push({x:val('x'),y:val('y')});}
  }pts.push({x:NODES[b].x,y:NODES[b].y});return pts;
}
export function routePoints(route){return route.slice(1).flatMap((n,i)=>{const a=route[i],edge=EDGES.find(([x,y])=>x===a&&y===n||y===a&&x===n);const points=road(...edge);return (edge[0]===a?points:points.reverse()).slice(i?1:0);});}
export function positionAt(points,distance){
  if(!points.length)return null;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=Math.hypot(b.x-a.x,b.y-a.y);if(distance<=d){const t=Math.max(0,distance/d);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,dx:b.x-a.x,dy:b.y-a.y,done:false};}distance-=d;}
  return {...points.at(-1),dx:1,dy:0,done:true};
}
