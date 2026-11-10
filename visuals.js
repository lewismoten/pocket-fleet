import { hash, rng } from './game.js';

const TAU = Math.PI * 2;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));

export function drawCadet(ctx, box, officer, options = {}) {
  const look=officer.look||{}, now=options.now||Date.now(), hue=Number(look.hue) || 190;
  const blink=options.expression==='angry' ? false : now%4200<130;
  const talk=options.expression==='talking' || (options.expression==='yelling' && now%450<300);
  ctx.save();ctx.translate(box.x,box.y);ctx.scale(box.w/160,box.h/160);
  ctx.fillStyle='#071723';ctx.fillRect(0,0,160,160);
  if(options.closeup){ctx.translate(-39,-27);ctx.scale(1.5,1.5);}
  const glow=ctx.createRadialGradient(80,70,5,80,70,95);glow.addColorStop(0,`hsla(${hue},75%,60%,.23)`);glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(0,0,160,160);
  const breathe=Math.sin(now/750)*1.5, glance=Math.sin(now/3100)*2;
  ctx.fillStyle=`hsl(${hue} 54% 28%)`;ctx.beginPath();ctx.ellipse(80,145+breathe,61,39,0,0,TAU);ctx.fill();
  ctx.fillStyle=`hsl(${hue} 55% 42%)`;ctx.beginPath();ctx.ellipse(80,143+breathe,51,32,0,0,TAU);ctx.fill();
  ctx.fillStyle='#d7e9e8';ctx.fillRect(73,119,14,21);ctx.fillStyle='#e8c97a';ctx.fillRect(75,126,10,5);
  ctx.fillStyle='#163847';ctx.beginPath();ctx.arc(80,69,57,0,TAU);ctx.fill();
  ctx.strokeStyle='#9adfe0';ctx.lineWidth=7;ctx.beginPath();ctx.arc(80,69,53,0,TAU);ctx.stroke();
  ctx.fillStyle='#99d7e022';ctx.beginPath();ctx.arc(80,69,48,0,TAU);ctx.fill();
  const species=look.species||'human';let faceColor=`hsl(28 38% ${clamp(78-(Number(look.tone)||28)*.65,36,83)}%)`;
  if(species==='alien')faceColor=`hsl(${hue+85} 52% 67%)`;
  if(species==='android')faceColor='#b1c2c4';
  if(species==='feline')faceColor=`hsl(31 56% ${clamp(70-(Number(look.tone)||28)*.45,40,75)}%)`;
  if(species==='amphibian')faceColor=`hsl(${hue+50} 53% 59%)`;
  ctx.fillStyle=faceColor;ctx.beginPath();
  if(look.face==='square'){ctx.roundRect(48,39,64,69,15);}else if(look.face==='long'){ctx.ellipse(80,73,30,43,0,0,TAU);}else{ctx.ellipse(80,73,35,38,0,0,TAU);}ctx.fill();
  if(species==='alien'){ctx.fillStyle=faceColor;ctx.beginPath();ctx.moveTo(60,44);ctx.lineTo(56,21);ctx.lineTo(70,38);ctx.moveTo(100,44);ctx.lineTo(104,21);ctx.lineTo(90,38);ctx.fill();ctx.fillStyle='#d0edce';ctx.fillRect(54,23,5,5);ctx.fillRect(101,23,5,5);}
  if(species==='feline'){ctx.fillStyle=faceColor;ctx.beginPath();ctx.moveTo(48,53);ctx.lineTo(46,28);ctx.lineTo(66,43);ctx.moveTo(112,53);ctx.lineTo(114,28);ctx.lineTo(94,43);ctx.fill();}
  if(species==='android'){ctx.strokeStyle='#557885';ctx.lineWidth=2;ctx.strokeRect(60,45,40,42);ctx.fillStyle='#7be5e4';ctx.fillRect(107,75,5,8);}
  const eyeColor=look.eyes==='gold'?'#a36814':look.eyes==='violet'?'#6e5ac9':'#18343a';
  ctx.strokeStyle=eyeColor;ctx.fillStyle=eyeColor;ctx.lineWidth=3;
  for(const side of [-1,1]){const ex=80+side*14+glance;if(blink){ctx.beginPath();ctx.moveTo(ex-5,72);ctx.lineTo(ex+5,72);ctx.stroke();}else{ctx.beginPath();ctx.ellipse(ex,71,4.5,options.expression==='angry'?3.3:6,0,0,TAU);ctx.fill();}}
  if(options.expression==='angry'||options.expression==='yelling'){ctx.strokeStyle='#26363c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(61,62);ctx.lineTo(74,67);ctx.moveTo(99,62);ctx.lineTo(86,67);ctx.stroke();}
  ctx.strokeStyle='#804b48';ctx.lineWidth=2;ctx.fillStyle='#683d3e';ctx.beginPath();
  if(talk||options.expression==='yelling'){ctx.ellipse(80,92,options.expression==='yelling'?10:7,options.expression==='yelling'?10:7,0,0,TAU);ctx.fill();}
  else {ctx.arc(80,88,8,.1,Math.PI-.1);ctx.stroke();}
  if(species==='feline'){ctx.fillStyle='#8c5754';ctx.beginPath();ctx.moveTo(76,82);ctx.lineTo(84,82);ctx.lineTo(80,87);ctx.fill();}
  if(look.hair==='swept'&&species==='human'){ctx.fillStyle='#26313d';ctx.beginPath();ctx.moveTo(47,59);ctx.quadraticCurveTo(47,19,102,34);ctx.lineTo(111,51);ctx.lineTo(91,43);ctx.lineTo(55,52);ctx.fill();}
  if(look.hair==='halo'&&species==='human'){ctx.strokeStyle='#30353f';ctx.lineWidth=13;ctx.beginPath();ctx.arc(80,51,30,Math.PI,TAU);ctx.stroke();}
  if(look.accessory==='lucky eyepatch'){ctx.fillStyle='#132934';ctx.fillRect(58,65,17,13);ctx.strokeStyle='#132934';ctx.beginPath();ctx.moveTo(57,68);ctx.lineTo(104,55);ctx.stroke();}
  if(look.accessory==='battle scar'){ctx.strokeStyle='#954d57';ctx.beginPath();ctx.moveTo(100,76);ctx.lineTo(107,91);ctx.stroke();}
  if(look.accessory==='bandage'){ctx.fillStyle='#eee1ba';ctx.fillRect(90,93,18,7);}
  ctx.strokeStyle='#e0fbf799';ctx.lineWidth=2;ctx.beginPath();ctx.arc(80,69,47,Math.PI*1.2,Math.PI*1.65);ctx.stroke();
  ctx.restore();
}

function vessel(ctx,x,y,s,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y-s);ctx.lineTo(x+s*.25,y+s*.25);ctx.lineTo(x+s,y+s*.65);ctx.lineTo(x,y+s*.4);ctx.lineTo(x-s,y+s*.65);ctx.lineTo(x-s*.25,y+s*.25);ctx.closePath();ctx.fill();ctx.fillStyle='#183547';ctx.fillRect(x-s*.11,y-s*.16,s*.22,s*.24);}
function body(ctx,obj,x,y,r){
  const hue=obj.hue||190,rand=rng(hash(`${obj.id}:${obj.name}:${hue}`));
  if(obj.kind==='ship'){vessel(ctx,x,y,r,`hsl(${hue} 42% 75%)`);return;}
  if(obj.kind==='station'){ctx.strokeStyle='#96d5d5';ctx.lineWidth=Math.max(2,r*.15);ctx.beginPath();ctx.ellipse(x,y,r*1.2,r*.55,0,0,TAU);ctx.stroke();ctx.fillStyle='#548397';ctx.fillRect(x-r*.6,y-r*.17,r*1.2,r*.34);return;}
  if(obj.kind==='nebula'){for(let i=0;i<6;i++){ctx.fillStyle=`hsla(${hue+i*8},65%,65%,.12)`;ctx.beginPath();ctx.ellipse(x+(rand()-.5)*r*2,y+(rand()-.5)*r,r*(.7+rand()),r*(.25+rand()*.4),rand(),0,TAU);ctx.fill();}return;}
  if(obj.id%3===0){ctx.strokeStyle='#b9af91';ctx.lineWidth=Math.max(2,r*.16);ctx.beginPath();ctx.ellipse(x,y,r*1.6,r*.36,-.23,0,TAU);ctx.stroke();}
  const orb=ctx.createRadialGradient(x-r*.35,y-r*.4,2,x,y,r);orb.addColorStop(0,`hsl(${hue} 55% 79%)`);orb.addColorStop(.72,`hsl(${hue} 47% 45%)`);orb.addColorStop(1,`hsl(${hue} 48% 19%)`);ctx.fillStyle=orb;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();
  if(obj.kind==='moon'){for(let i=0;i<6;i++){const bx=x+(rand()-.5)*r*1.7,by=y+(rand()-.5)*r*1.7;ctx.fillStyle='#1e354744';ctx.beginPath();ctx.arc(bx,by,r*(.05+rand()*.2),0,TAU);ctx.fill();}}
  else if(obj.id%2){for(let i=0;i<9;i++){const by=y-r+i*r*.25;ctx.strokeStyle=`hsla(${hue+20},72%,85%,${.08+rand()*.12})`;ctx.lineWidth=r*.08;ctx.beginPath();for(let px=x-r;px<=x+r;px+=4){const py=by+Math.sin(px*.09+i)*r*.07;if(px===x-r)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.stroke();}}
  else {for(let i=0;i<7;i++){ctx.fillStyle=`hsla(${hue+80},48%,75%,${.18+rand()*.17})`;ctx.beginPath();ctx.ellipse(x+(rand()-.5)*r*1.6,y+(rand()-.5)*r*1.7,r*(.12+rand()*.3),r*(.08+rand()*.18),rand(),0,TAU);ctx.fill();}}
  if(obj.id%4===0){ctx.fillStyle='#ebf7f4bb';ctx.beginPath();ctx.ellipse(x,y-r*.88,r*.53,r*.18,0,0,TAU);ctx.ellipse(x,y+r*.9,r*.48,r*.17,0,0,TAU);ctx.fill();}
  ctx.restore();
  if(obj.id%3===0){ctx.strokeStyle='#eee1bcaa';ctx.lineWidth=Math.max(1,r*.07);ctx.beginPath();ctx.ellipse(x,y,r*1.6,r*.36,-.23,0,TAU);ctx.stroke();}
}

export function drawUniverse(ctx, box, game, ship, options = {}) {
  const places=options.places||[], now=options.now||Date.now(), target=places.find(p=>p.id===ship.targetId)||places[0];
  ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();ctx.translate(box.x,box.y);ctx.scale(box.w/320,box.h/180);
  const correction=(box.w/320)/(box.h/180),paint=(obj,x,y,r)=>{ctx.save();ctx.translate(x,y);ctx.scale(1/correction,1);body(ctx,obj,0,0,r);ctx.restore();};
  const sky=ctx.createLinearGradient(0,0,0,180);sky.addColorStop(0,'#061321');sky.addColorStop(1,'#102b40');ctx.fillStyle=sky;ctx.fillRect(0,0,320,180);
  const stars=rng(hash(`stars:${game.seed}`));for(let i=0;i<105;i++){const baseX=stars()*320,baseY=stars()*180,twinkle=.45+.35*Math.sin(now/900+i),x=((baseX-ship.x*1.7)%320+320)%320,y=((baseY-ship.y*1.25)%180+180)%180;ctx.fillStyle=`rgba(208,237,240,${twinkle})`;ctx.fillRect(x,y,i%14===0?2:1,i%14===0?2:1);}
  if(target){const distance=Math.hypot(ship.x-target.x,ship.y-target.y),mainSize=clamp(22+(42-distance)*.6,18,55);paint(target,175,90,mainSize);
    for(const obj of places){if(obj.id===target.id)continue;const dx=obj.x-target.x,dy=obj.y-target.y;if(Math.hypot(dx,dy)>38)continue;const ox=175+dx*2.4,oy=90+dy*1.8;if(ox<12||ox>310||oy<10||oy>170)continue;paint(obj,ox,oy,clamp(12-Math.hypot(dx,dy)*.12,4,11));}
    ctx.fillStyle='#b6e6df';ctx.font='bold 9px sans-serif';ctx.fillText(target.name.toUpperCase(),9,166);
  }
  if(ship.enemy>0){ctx.strokeStyle='#e67d75';ctx.lineWidth=2;ctx.strokeRect(124,39,102,103);ctx.fillStyle='#ffb09a';ctx.font='bold 9px sans-serif';ctx.fillText(`HOSTILE ${ship.enemy}%`,221,16);}
  for(const effect of (game.effects||[]).filter(e=>e.shipId===ship.id&&now-e.at<2500)){
    const age=Math.max(0,now-effect.at),sx=effect.barrel%2===0?70:250,sy=178,aim=places.find(p=>p.id===effect.targetId),ex=aim&&target&&aim.id!==target.id?clamp(175+(aim.x-target.x)*2.4,16,304):175,ey=aim&&target&&aim.id!==target.id?clamp(90+(aim.y-target.y)*1.8,14,164):90,progress=clamp(age/(effect.kind==='torpedo'?1400:500),0,1);
    ctx.save();ctx.globalAlpha=1-clamp(age/2500,0,1);
    if(effect.kind==='explosion'){ctx.strokeStyle='#ffcf86';ctx.lineWidth=5;ctx.beginPath();ctx.arc(175,90,Math.min(95,age*.11),0,TAU);ctx.stroke();}
    else if(effect.kind==='pod'){ctx.fillStyle='#abf4ef';ctx.beginPath();ctx.ellipse(90-age*.06,155-age*.04,5,3,-.3,0,TAU);ctx.fill();}
    else if(effect.kind==='torpedo'){const x=sx+(ex-sx)*progress,y=sy+(ey-sy)*progress;ctx.shadowColor='#ffbd72';ctx.shadowBlur=11;ctx.fillStyle='#fff2bc';ctx.beginPath();ctx.arc(x,y,3.5,0,TAU);ctx.fill();}
    else{ctx.strokeStyle='#74ecff';ctx.lineWidth=3;ctx.shadowColor='#74ecff';ctx.shadowBlur=10;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+(ex-sx)*progress,sy+(ey-sy)*progress);ctx.stroke();}
    ctx.restore();
  }
  if(ship.incomingHail && now-ship.incomingHail.at<5200){const enemy=ship.incomingHail,seed=enemy.seed||0;ctx.fillStyle='#061421ec';ctx.fillRect(230,28,80,105);ctx.strokeStyle='#e77977';ctx.strokeRect(230,28,80,105);drawCadet(ctx,{x:234,y:32,w:72,h:78},{look:{species:['alien','feline','android'][seed%3],hue:seed%360,face:'long',eyes:'gold'}},{now,expression:now%500<280?'yelling':'angry'});ctx.fillStyle='#ffc6b2';ctx.font='bold 8px sans-serif';ctx.fillText('INCOMING HAIL',235,121);}
  ctx.strokeStyle='#84b8b966';ctx.beginPath();ctx.moveTo(154,90);ctx.lineTo(166,90);ctx.moveTo(160,84);ctx.lineTo(160,96);ctx.stroke();
  ctx.restore();
}
