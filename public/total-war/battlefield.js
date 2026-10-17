import {POINTS,NODES,EDGES,shortest,validRoute,routePoints,positionAt,routeCost,edgeCost,road} from './movement.js';



import {BANNERS,bannerFor} from './banners.js';



const $=s=>document.querySelector(s),canvas=$('#field'),ctx=canvas.getContext('2d',{alpha:false});

const W=1440,H=900,TAU=Math.PI*2;

const palette={gold:'#d8bd80',cyan:'#87e7d7',red:'#f17c95'};

const squads=['kuro','jun'].map(id=>({...bannerFor(id),node:0,order:null,budget:POINTS,bonus:0}));

let selected=0,preview=[],round=1,phase='plan',elapsed=0,last=0,view={scale:1,sy:1,x:0,y:0},manifest,assets={},terrain,torch=[],marches=[],sound=false,audio,tactical=false,inspected=null;

const mutedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

const STORE='academy-rift.total-war.standards.v2';

function ellipse(g,x,y,rx,ry,color){g.fillStyle=color;g.beginPath();g.ellipse(x,y,rx,ry,0,0,TAU);g.fill();}

function line(g,p,color,width=1){g.strokeStyle=color;g.lineWidth=width;g.lineJoin='round';g.lineCap='round';g.beginPath();p.forEach((q,i)=>i?g.lineTo(q.x??q[0],q.y??q[1]):g.moveTo(q.x??q[0],q.y??q[1]));g.stroke();}

function glow(g,x,y,r,color){const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,color);gr.addColorStop(1,'transparent');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);}

function riverX(y){const p=[[0,700],[100,743],[200,770],[245,765],[300,790],[400,768],[500,746],[600,752],[700,750],[800,755],[900,812]];for(let i=1;i<p.length;i++){if(y<=p[i][0]){const t=(y-p[i-1][0])/(p[i][0]-p[i-1][0]);return p[i-1][1]+t*(p[i][1]-p[i-1][1]);}}return 812;}

function buildTerrain(){

  terrain=document.createElement('canvas');terrain.width=W;terrain.height=H;

  terrain.getContext('2d').drawImage(assets.landscape,0,0,W,H);

  torch=[[426,344],[492,383],[453,181],[692,225],[822,227],[682,588],[814,588],[997,574],[946,402],[1039,406],[1193,423],[1227,485]];

}

function label(text,x,y,color='#d5dbc4',size=11){ctx.font=`600 ${size}px "Rift Body"`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=4;ctx.strokeStyle='#102029d9';ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);}

function drawRoute(route,col,t,solid=false){if(route.length<2)return;const pts=routePoints(route);line(ctx,pts,'#10272bd0',7);ctx.save();ctx.shadowColor=col;ctx.shadowBlur=10;ctx.setLineDash(solid?[]:[7,9]);ctx.lineDashOffset=-t*14;line(ctx,pts,col,2.2);ctx.restore();}

function company(s,i,t){

  const m=marches[i],active=phase==='march'&&m?.points.length;

  const startSpread=squads[0].node===squads[1].node?(i===0?-38:38):0;

  const endShared=phase==='march'&&squads[0].order.at(-1)===squads[1].order.at(-1);

  const endSpread=endShared?(i===0?-38:38):0;

  const p=active?positionAt(m.points,m.distance):NODES[s.node];

  const settle=active?Math.max(0,1-(m.total-m.distance)/55):0;

  const ox=active?startSpread*Math.max(0,1-m.distance/65)+endSpread*settle:startSpread;

  const x=p.x+ox,y=p.y+5;

  ellipse(ctx,x,y,22,7,'#04131e9c');glow(ctx,x,y,29,s.color+'35');

  ctx.save();ctx.strokeStyle=i===selected?'#f5de9b':s.color+'99';ctx.lineWidth=i===selected?2:1;ctx.beginPath();ctx.ellipse(x,y,24,8,0,0,TAU);ctx.stroke();ctx.restore();

  const img=assets[s.src],w=i===selected?64:58,h=w*1.5;

  // A portrait standard moves as one army token. Only its cloth flexes in the breeze.

  for(let yy=0;yy<img.height;yy+=12){const fraction=yy/img.height,sway=mutedMotion?0:Math.sin(t*2.1+i+fraction*4)*1.2*fraction;ctx.drawImage(img,0,yy,img.width,Math.min(12,img.height-yy),x-w/2+sway,y-h+fraction*h,w,Math.min(12,img.height-yy)/img.height*h);}

  label(i===0?'I':'II',x,y-h-8,'#f2ddb0',10);

  s.screen={x,y:y-h/2};const hit=document.querySelector(`[data-standard="${i}"]`);if(hit){hit.style.left=(x*view.scale+view.x)+'px';hit.style.top=((y-h/2)*view.sy+view.y)+'px';}

}

function effect(id,x,y,size,t,opacity=1){const f=manifest.FX[id],img=assets[f.src];if(!img)return;const frame=mutedMotion?0:Math.floor(t*9)%f.n;ctx.save();ctx.globalAlpha=opacity;ctx.globalCompositeOperation='screen';ctx.drawImage(img,frame*f.w,0,f.w,f.h,x-size/2,y-size,size,size);ctx.restore();}

function draw(t){

  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#12232d';ctx.fillRect(0,0,canvas.width,canvas.height);const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(view.scale*dpr,0,0,view.sy*dpr,view.x*dpr,view.y*dpr);

  ctx.drawImage(terrain,0,0);

  // Refracted water is a live layer sampled from the terrain, never a full-screen filter.

  if(!mutedMotion){

    for(let y=0;y<H;y+=5){if(y>222&&y<274||y>584&&y<642||y>386&&y<438)continue;const x=riverX(y),shift=Math.sin(y*.1+t*1.7)*1.2;ctx.drawImage(terrain,x-20,y,40,5,x-20+shift,y,40,5);}

    for(let i=0;i<90;i++){const y=(i*37+t*9)%H;if(y>222&&y<274||y>584&&y<642||y>386&&y<438)continue;const x=riverX(y)+Math.sin(i*41.13)*17;line(ctx,[[x,y],[x+3+Math.sin(t+i)*2,y+.5]],i%3?'#7bd1d015':'#b2e2d32a',.8);}

  }

  if(tactical)for(const [a,b] of EDGES){const points=road(a,b),rough=edgeCost(a,b)>1;ctx.save();ctx.setLineDash(rough?[3,5]:[]);line(ctx,points,rough?'#dfac7890':'#a6cfbc65',rough?2:1);ctx.restore();const mid=points[Math.floor(points.length/2)];ellipse(ctx,mid.x,mid.y,10,8,'#0c2027d9');label(String(edgeCost(a,b)),mid.x,mid.y,rough?'#f0be83':'#b8d9c9',10);}

  squads.forEach(s=>{if(s.order)drawRoute(s.order,s.color+'ae',t,true);});if(phase==='plan')drawRoute(preview,palette.gold,t);

  NODES.forEach((n,i)=>{const active=preview.includes(i),can=routeCost(shortest(squads[selected].node,i))<=squads[selected].budget,col=n.kind==='buff'?'#a7e7dc':n.kind==='lair'?'#de91b6':'#b0c4ad';ctx.save();ctx.strokeStyle=active?'#f0d596':col+(can?'a8':'65');ctx.lineWidth=active?2:1;ctx.beginPath();ctx.ellipse(n.x,n.y+5,active?23:n.kind==='crossroads'?12:18,active?9:6,0,0,TAU);ctx.stroke();ellipse(ctx,n.x,n.y+5,2.5,2,active?'#ffe5aa':col);ctx.restore();if(n.kind==='buff')glow(ctx,n.x,n.y-12,28,'#65dbc21c');});

  const units=squads.map((s,i)=>({y:phase==='march'&&marches[i]?.points.length?positionAt(marches[i].points,marches[i].distance).y:NODES[s.node].y,draw:()=>company(s,i,t)})).sort((a,b)=>a.y-b.y);for(const unit of units)unit.draw();

  for(const [x,y] of torch){const f=mutedMotion?1:.85+Math.sin(t*7+x)*.15;glow(ctx,x,y-26,24,'#ffd58c27');ellipse(ctx,x,y-27,2.1*f,4*f,'#ffda95');ellipse(ctx,x,y-27,1,2,'#fff5c4');}

  // Elemental light breathes over the original-style crystal architecture.

  for(const [x,y,color] of [[158,251,'#7bdfff'],[1265,270,'#ff4e8e'],[990,398,'#de72fc'],[575,76,'#83edff'],[233,149,'#7bdfff']]){

    const pulse=mutedMotion?.7:.65+Math.sin(t*1.6)*.2;ctx.save();ctx.globalAlpha=pulse;ctx.globalCompositeOperation='screen';glow(ctx,x,y,40,color+'6a');ctx.restore();

    if(!mutedMotion)for(let j=0;j<7;j++){const z=(t*.18+j/7)%1;ellipse(ctx,x+Math.sin(j*13+t)*12,y-z*40,1,1,color+Math.floor((1-z)*130).toString(16).padStart(2,'0'));}

  }

  effect('bfire1',495,606,30,t,.65);

  for(let i=0;i<45;i++){const x=(i*137.2+Math.sin(t*.24+i)*18)%W,y=180+(i*79.4+t*(i%2?2:-1))%535,a=.15+(Math.sin(t+i*2)+1)*.2;ellipse(ctx,x,y,1.2,1.2,`rgba(184,224,169,${a})`);}

  // Soft drifting ground mist; restrained so routes and silhouettes stay legible.

  for(let i=0;i<5;i++){const x=(t*4+i*350)%1800-180,y=200+i*110;ctx.save();ctx.translate(x,y);ctx.scale(3,.4);glow(ctx,0,0,90,'#9bd1c609');ctx.restore();}

  const v=ctx.createRadialGradient(W/2,H/2,320,W/2,H/2,850);v.addColorStop(0,'transparent');v.addColorStop(1,'#061222c9');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);

  NODES.forEach((n,i)=>{

    const active=preview.includes(i),show=n.kind!=='crossroads'||active||i===1||tactical;if(!show)return;

    const dy=n.y>700?-30:n.kind==='home'||n.kind==='enemy'?50:30;

    label(n.name,n.x,n.y+dy,n.kind==='buff'?'#b5ecda':n.kind==='lair'?'#e8b3cb':active?'#f0dfab':'#d2d6c6',n.kind==='crossroads'?10:11);

    if(n.bonus)label(`+${n.bonus} MP NEXT ROUND`,n.x,n.y+dy+14,'#96cdb8',8);

    else if(n.kind==='lair')label('MONSTER SITE',n.x,n.y+dy+14,'#c395ab',8);

    if(active&&i!==squads[selected].node)label(`${routeCost(preview.slice(0,preview.indexOf(i)+1))} MP`,n.x,n.y-13,'#f0d596',9);

  });

}

function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),footer=$('.command-bar').getBoundingClientRect().height;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);view.scale=r.width/W;view.sy=Math.min(view.scale,Math.max(.2,(r.height-footer-180)/690));view.x=0;view.y=110-94*view.sy;positionButtons();}

function positionButtons(){document.querySelectorAll('.waypoint').forEach((el,i)=>{el.style.left=(NODES[i].x*view.scale+view.x)+'px';el.style.top=(NODES[i].y*view.sy+view.y)+'px';});}

function notify(text){$('#notice').textContent=text;}

function select(i){if(phase!=='plan')return;selected=i;preview=squads[i].order?[...squads[i].order]:[];inspected=preview.at(-1)??null;notify(`Chart ${squads[i].name}’s route. Stone roads cost 1 MP; rough trails cost 2.`);updateUI();tone(330+i*110,.07);}

function choose(i){if(phase!=='plan')return;const s=squads[selected];inspected=i;

  if(preview.length>1&&preview.includes(i))preview=preview.slice(0,preview.indexOf(i)+1);

  else if(preview.length>1)preview=[...preview,...shortest(preview.at(-1),i).slice(1)];else preview=shortest(s.node,i);

  const cost=routeCost(preview);notify(cost>s.budget?`Route needs ${cost} MP; ${s.name} has ${s.budget}. Tap an earlier waypoint or clear the route.`:NODES[i].desc);updateUI();tone(520,.06);

}

function updateUI(){

  const s=squads[selected],shown=phase==='plan'?preview:(s.order||[]),cost=routeCost(shown),ready=squads.filter(s=>s.order).length;

  document.querySelectorAll('.squad').forEach((b,i)=>{const unit=squads[i];b.classList.toggle('selected',i===selected);b.setAttribute('aria-pressed',i===selected);b.disabled=phase!=='plan';b.querySelector('img').src=unit.portrait;b.querySelector('img').alt=unit.name;b.querySelector('strong').textContent=unit.name;b.querySelector('small').textContent=unit.element.toUpperCase()+' STANDARD';$('#status-'+i).textContent=phase==='march'?(unit.order?.length>1?'Advancing':'Holding'):phase==='arrived'?(unit.bonus?`+${unit.bonus} MP next round`:'At destination'):unit.order?(unit.order.length>1?'Orders committed':'Holding'):unit.budget>POINTS?`${unit.budget} MP · shrine blessing`:'Awaiting orders';});

  $('#route-title').textContent=s.name.toUpperCase()+' · '+(inspected!==null?NODES[inspected].name.toUpperCase():'MOVEMENT');

  $('#pips').replaceChildren(...Array.from({length:s.budget},(_,i)=>{const e=document.createElement('i');e.className=i<cost?'spent':'';return e;}));$('#budget').innerHTML=`${Math.max(0,s.budget-cost)} <small>/ ${s.budget} MP</small>`;

  $('#route-detail').textContent=phase==='arrived'?(s.bonus?`Shrine secured. +${s.bonus} MP next round.`:'Standards in position. Begin the next round.'):cost?`${cost} MP to ${NODES[shown.at(-1)].name} · ${Math.max(0,s.budget-cost)} reserved`:'Choose waypoints to build your own route.';

  $('#site-reward').textContent=inspected!==null?(NODES[inspected].bonus?`ARRIVAL: +${NODES[inspected].bonus} MP NEXT ROUND`:NODES[inspected].kind==='lair'?'MONSTER REWARD · CONCEPT ONLY':'STONE 1 MP / ROUGH 2 MP'):'STONE 1 MP / ROUGH 2 MP';

  $('#commit').disabled=phase!=='plan'||cost===0||!validRoute(preview,s.node,s.budget);$('#reserve').disabled=phase!=='plan';$('#clear-route').disabled=phase!=='plan'||!preview.length;

  $('#march').disabled=phase==='march'||phase==='plan'&&ready<2;$('#march').innerHTML=phase==='arrived'?'Begin next round <span id="ready">ALL STANDARDS ARRIVED</span>':phase==='march'?'Standards advancing <span id="ready">MARCHING</span>':`Begin simultaneous march <span id="ready">${ready} / 2 READY</span>`;

  $('#phase').textContent=phase==='plan'?'PLAN YOUR MARCH':phase==='march'?'THE STANDARDS ADVANCE':'ORDERS COMPLETE';$('#round').textContent='ROUND '+String(round).padStart(2,'0');

  document.querySelectorAll('.waypoint').forEach((b,i)=>{b.disabled=phase!=='plan';b.setAttribute('aria-label',`${NODES[i].name}, ${routeCost(shortest(s.node,i))} movement points from ${s.name}`);});

  document.querySelectorAll('[data-standard]').forEach((b,i)=>{b.disabled=phase!=='plan';b.setAttribute('aria-label',`Select ${squads[i].name} standard`);});

}

function save(){try{localStorage.setItem(STORE,JSON.stringify({round,phase:phase==='arrived'?'arrived':'plan',squads:squads.map(({id,node,order,budget,bonus})=>({id,node,order:phase==='arrived'?null:order,budget,bonus}))}));}catch{}}

function restore(){try{const d=JSON.parse(localStorage.getItem(STORE));if(!d||!Number.isInteger(d.round)||d.round<1||!Array.isArray(d.squads)||d.squads.length!==2)return;

  if(d.squads[0].id===d.squads[1].id||!d.squads.every(s=>BANNERS.some(b=>b.id===s.id)&&Number.isInteger(s.node)&&NODES[s.node]&&Number.isInteger(s.budget)&&s.budget>=4&&s.budget<=6&&Number.isInteger(s.bonus)&&s.bonus>=0&&s.bonus<=2&&(s.order===null||validRoute(s.order,s.node,s.budget))))return;

  round=d.round;phase=d.phase==='arrived'?'arrived':'plan';d.squads.forEach((s,i)=>Object.assign(squads[i],bannerFor(s.id),s));

}catch{}}

function commit(hold=false){const s=squads[selected];if(phase!=='plan'||!hold&&!validRoute(preview,s.node,s.budget))return;s.order=hold?[s.node]:[...preview];preview=[...s.order];save();notify(hold?`${s.name} holds. ${s.budget} MP reserved.`:`${s.name}’s orders are sealed. ${squads.every(s=>s.order)?'Both standards are ready.':'Plan the other company’s route.'}`);updateUI();tone(660,.15);}

function begin(){if(phase==='arrived'){phase='plan';round++;squads.forEach(s=>{s.order=null;s.budget=POINTS+s.bonus;s.bonus=0;});preview=[];inspected=null;save();updateUI();notify('A new round. Shrine blessings have been added to movement points.');return;}if(phase!=='plan'||squads.some(s=>!s.order))return;

  phase='march';marches=squads.map(s=>{const points=routePoints(s.order);return {points,distance:0,total:points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0)};});preview=[];elapsed=0;updateUI();notify('Orders sealed. Both standards advance together.');tone(220,.3);

}

function tick(now){const dt=last?Math.min((now-last)/1000,.05):0;last=now;elapsed+=dt;if(phase==='march'){

  const speed=70*Math.min(1,elapsed/.55);marches.forEach(m=>m.distance=Math.min(m.total,m.distance+dt*speed));

  if(marches.every(m=>m.distance>=m.total)){squads.forEach(s=>{const destination=s.order.at(-1);s.bonus=destination!==s.node?(NODES[destination].bonus||0):0;s.node=destination;});phase='arrived';save();updateUI();notify(squads.some(s=>s.bonus)?'Shrine blessings secured. Their movement bonuses activate next round.':'The advance is complete. Plan your next move.');tone(440,.25);}

  }draw(now/1000);requestAnimationFrame(tick);

}

function renderGallery(){const canChange=phase==='plan'&&squads[selected].node===0&&!squads[selected].order;

  $('#banner-hint').textContent=canChange?`Choose the standard for company ${selected===0?'I':'II'}. Character art is unchanged.`:'Browse all ten standards. Change a company at the Crystal Fortress before committing its orders.';

  $('#banner-grid').replaceChildren(...BANNERS.map(b=>{const card=document.createElement('button');card.className='banner-choice';card.setAttribute('aria-label',`Choose ${b.fullName} banner`);card.disabled=!canChange||squads[1-selected].id===b.id;card.setAttribute('aria-pressed',squads[selected].id===b.id);card.innerHTML=`<img src="${b.src}" alt="${b.fullName} portrait standard"><strong>${b.fullName}</strong><small>${b.element} / ${b.role}</small>`;card.onclick=()=>{Object.assign(squads[selected],b);assets[b.src]&&save();preview=[];inspected=null;updateUI();$('#banner-gallery').close();notify(`${b.name}’s standard now commands company ${selected===0?'I':'II'}.`);};return card;}));

}

function tone(hz,duration){if(!sound||!audio)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(.0001,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.045,audio.currentTime+.02);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration+.02);}

function toggleSound(){if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();audio.resume();sound=!sound;$('#sound').setAttribute('aria-pressed',sound);$('#sound').setAttribute('aria-label',sound?'Mute ambient sound':'Enable ambient sound');if(sound){tone(440,.4);if(!audio.ambient){const gain=audio.createGain();gain.gain.value=0;gain.connect(audio.destination);for(const f of [110,164.81,220.3]){const o=audio.createOscillator();o.frequency.value=f;o.type='sine';o.connect(gain);o.start();}audio.ambient=gain;}}if(audio.ambient)audio.ambient.gain.setTargetAtTime(sound?.008:0,audio.currentTime,.5);}

async function load(){

  try{

    manifest=await fetch('../theatre/manifest.json').then(r=>{if(!r.ok)throw Error('Effect manifest unavailable');return r.json();});

    const sources=[['landscape','art/moonveil-branches.png'],[manifest.FX.bfire1.src,'../'+manifest.FX.bfire1.src],...BANNERS.map(b=>[b.src,b.src])];

    await Promise.all(sources.map(([key,src])=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{assets[key]=img;resolve();};img.onerror=()=>reject(Error('Could not load '+src));img.src=src;})));

    await document.fonts.ready;buildTerrain();restore();preview=squads[selected].order?[...squads[selected].order]:[];

    NODES.forEach((n,i)=>{const b=document.createElement('button');b.className='waypoint';b.textContent=n.name;b.addEventListener('click',()=>choose(i));$('#destinations').append(b);});

    squads.forEach((s,i)=>{const b=document.createElement('button');b.className='standard-hit';b.dataset.standard=i;b.addEventListener('click',()=>select(i));$('#standards').append(b);});

    resize();updateUI();notify(`Select a destination to chart ${squads[selected].name}’s march.`);if(phase==='arrived')notify('The march is complete. Begin the next round when ready.');$('#loading').classList.add('hidden');requestAnimationFrame(tick);

  }catch(e){$('#loading').textContent='The battlefield could not load. Refresh to retry.';console.error(e);}

}

document.querySelectorAll('.squad').forEach(b=>b.addEventListener('click',()=>select(Number(b.dataset.squad))));$('#commit').onclick=()=>commit();$('#reserve').onclick=()=>commit(true);$('#march').onclick=begin;$('#sound').onclick=toggleSound;

$('#clear-route').onclick=()=>{preview=[];inspected=null;updateUI();notify('Route preview cleared. Committed orders stay in place until you replace them.');};

$('#help').onclick=()=>$('#guide').showModal();document.querySelectorAll('.close').forEach(b=>b.onclick=()=>b.closest('dialog').close());

$('#banners').onclick=()=>{renderGallery();$('#banner-gallery').showModal();};$('#bestiary').onclick=()=>$('#monster-gallery').showModal();

$('#routes').onclick=()=>{tactical=!tactical;$('#routes').setAttribute('aria-pressed',tactical);};

$('#restart').onclick=()=>{squads.forEach(s=>{s.node=0;s.order=null;s.budget=POINTS;s.bonus=0;});round=1;phase='plan';selected=0;preview=[];inspected=null;marches=[];save();updateUI();notify('Choose a destination. Shrines reward detours; rough trails cost 2 MP.');$('#guide').close();};

window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden&&audio)audio.suspend();else if(sound&&audio)audio.resume();});

load();

