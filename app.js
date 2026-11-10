import { drawCadet, drawUniverse } from './visuals.js';
import { SYSTEMS, STATIONS, ACTIONS, createGame, createProfile, joinGame, leaveGame, addShip, act, escapePod, advanceGame, creditTime, sector, level, rankMark, unlocks, rng, hash } from './game.js';

const $ = id => document.getElementById(id);
const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = (key, value) => localStorage.setItem(`pf-${key}`, JSON.stringify(value));
const read = key => { try { return JSON.parse(localStorage.getItem(`pf-${key}`)); } catch { return null; } };
let profile = read('profile') || createProfile('Cadet');
let game = read('game') || createGame();
let code = read('code') || '';
let authToken = code ? sessionStorage.getItem(`pf-token-${code}`) || '' : '';
let online = false;
let shipId = read('ship') || 'ship-1';
let station = read('station') || 'captain';
let hostAvailable = false;
let busy = false;
let displayMode = read('display-mode') || 'one';
let deviceOnly = read('device-only') || new URLSearchParams(location.search).get('view') === 'cyd';
let selectedTargetId = null;
const targetByStation = {};
let selectedSystem = 'hull';
let helmPage = 0;
let dockMode = false;
let choosingTarget = false;
let dockedShips = [];
let tapFlash = null;
let animationHandle = 0;
let inQuarters = true;
let previewForward = false;
let lastTime = Date.now();
if (game.players[profile.id]) { game.players[profile.id] = profile; leaveGame(game, profile.id); store('game', game); }
store('profile', profile);
const hints = {
  captain: 'Watch the forward view and send clear orders to the crew.',
  helm: 'Choose a course locally, commit it, then steer, set speed, or approach.',
  weapons: 'Power up once. Pulse and torpedoes charge at different rates.',
  engineering: 'Select a ship system on the diagram, then repair it when ready.',
  science: 'Scan targets and survey strange signals.',
  communications: 'Receive assignments and make first contact.'
};
function toast(message) { const t = $('toast'); t.textContent = message; t.style.display = 'block'; clearTimeout(toast.timer); toast.timer = setTimeout(() => t.style.display = 'none', 3500); }
async function request(path, payload) {
  const headers = authToken ? { 'x-fleet-token': authToken } : {};
  const res = await fetch(`/api/${path}`, payload ? { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(payload) } : { headers });
  const data = await res.json(); if (!res.ok) throw Error(data.error || 'Connection failed'); return data;
}
async function update(path, payload) { const data = await request(path, { code, ...payload }); if (data.token) { authToken = data.token; sessionStorage.setItem(`pf-token-${code}`, authToken); } game = data.game; profile = game.players[profile.id] || profile; persist(); render(); }
function persist() { store('profile', profile); store('ship', shipId); store('station', station); if (!online) store('game', game); }
function currentShip() { return game.ships.find(s => s.id === shipId) || game.ships[0]; }
function targetFor(s) { return targetByStation[s] || (s==='helm'?currentShip().targetId:null) || game.activeMission?.targetId || 1; }
function setTarget(s,id) { targetByStation[s]=Number(id);if(s===station)selectedTargetId=Number(id);render(); }
function actionLabel(s,a,ship) {if(s==='weapons'&&a==='Toggle power')return ship.weaponsOnline?'Power down':'Power up';return a;}
function actionReadyAt(s,a,ship) {if(s==='weapons'&&a.startsWith('Fire'))return ship.weapons?.[a==='Fire pulse'?'pulseReadyAt':'torpedoReadyAt']||0;if(s==='engineering')return ship.engineeringReadyAt?.[a]||0;return 0;}
function actionProgress(s,a,ship,now=Date.now()) {const remaining=Math.max(0,actionReadyAt(s,a,ship)-now);const total=s==='weapons'?(a==='Fire torpedo'?7000:2000):8000;return {remaining,percent:Math.round(100*(1-Math.min(1,remaining/total)))};}
function deviceActions(s) {return s==='helm'?ACTIONS.helm.slice(helmPage*4,helmPage*4+4):ACTIONS[s].slice(0,4);}
function render() {
  document.body.classList.toggle('cyd-only', deviceOnly);
  document.body.classList.toggle('in-quarters', inQuarters);
  $('deviceOnlyButton').textContent = deviceOnly ? 'Exit CYD view' : 'CYD-only view';
  const ship = currentShip(), places = sector(game.seed), target = places.find(p => p.id === ship.targetId);
  selectedTargetId = targetFor(station);
  $('modeBadge').textContent = online ? `FLEET ${code}` : 'SOLO SIMULATION';
  $('sessionInfo').textContent = online ? `Fleet ${code} is live. Share this code with people on the same Wi‑Fi and use this server's address.` : hostAvailable ? 'Solo saves here. Host a fleet to share it over your Wi‑Fi.' : 'Solo saves here. Run npm start for Wi‑Fi fleet play.';
  const accessoryMark = { 'flight jacket': '◆', 'scanner visor': '⌕', 'tool belt': '⚙', 'tactical patch': '✦', 'battle scar': '╱', bandage: '+', 'lucky eyepatch': '◉' }[profile.look.accessory] || '';
  $('profileButton').innerHTML = `<canvas width="36" height="36" aria-hidden="true"></canvas><small>${accessoryMark}</small>`;
  drawPortrait($('profileButton').querySelector('canvas'), profile,{closeup:true});
  $('profileButton').title = `${profile.name} ${rankMark(profile)} · ${profile.look.accessory}`;
  $('shipSelect').innerHTML = game.ships.map(s => `<option value="${safe(s.id)}">${s.locked ? '🔒 ' : ''}${safe(s.name)} · ${s.crew.length} crew</option>`).join(''); $('shipSelect').value = ship.id;
  $('stationSelect').innerHTML = STATIONS.map(s => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join(''); $('stationSelect').value = station;
  $('crewList').innerHTML = ship.crew.map(id => `<div class="crew-person"><canvas width="30" height="30" data-crew-id="${safe(id)}"></canvas>${safe(game.players[id]?.name || 'Unknown crew')} <b>${rankMark(game.players[id] || profile)}</b></div>`).join('') || '<p class="hint">No crew assigned.</p>';
  for(const portrait of $('crewList').querySelectorAll('canvas'))drawPortrait(portrait,game.players[portrait.dataset.crewId]||profile,{closeup:true});
  $('viewTitle').textContent = target ? `Approaching ${target.name}` : `${ship.name} / open space`;
  const alert = ship.alert || (ship.enemy ? 'red' : 'green');
  $('alertBanner').hidden = alert === 'green'; $('alertBanner').className = `alert-banner ${alert}`;
  $('alertBanner').textContent = `${alert.toUpperCase()} ALERT · ${ship.name.toUpperCase()}`;
  $('sectorCode').textContent = `SECTOR ${String(game.seed).slice(-3).padStart(3, '0')}`;
  $('coords').textContent = `X ${Math.round(ship.x)} / Y ${Math.round(ship.y)}`;
  for (const [key, value] of [['hull', ship.hull], ['shield', ship.shields], ['energy', ship.energy]]) { $(key + 'Value').textContent = `${Math.round(value)}%`; $(key + 'Meter').style.width = `${value}%`; }
  $('missionValue').textContent = game.completed;
  const m = game.activeMission;
  $('missionCard').innerHTML = m ? `<span class="pill">${safe(m.type.toUpperCase())}</span><h3>${safe(m.title)}</h3><p>${m.type === 'defense' ? 'Set course, approach, and defend the target.' : m.type === 'survey' ? 'Approach and use a science scan.' : m.type === 'diplomacy' ? 'Approach and negotiate.' : 'Approach and dock at the destination.'}</p>` : '<span class="pill">STANDING BY</span><h3>Awaiting orders</h3><p>Visit Communications and request a mission to begin your voyage.</p>';
  $('targetSelect').innerHTML = places.map(p => `<option value="${p.id}">${safe(p.name)} · ${safe(p.kind)}</option>`).join('');
  $('targetSelect').value = String(targetFor(station));
  $('targetControl').hidden=station==='engineering';$('systemControl').hidden=station!=='engineering';
  $('targetControl').querySelector('label').textContent=station==='helm'?'Choose course (local until Set course)':'Choose target for this station';
  $('systemSelect').innerHTML=SYSTEMS.map(s=>`<option value="${s}">${s[0].toUpperCase()+s.slice(1)} · ${Math.round(ship.systems?.[s]??100)}%</option>`).join('');$('systemSelect').value=selectedSystem;
  $('stationHeading').textContent = station;
  $('stationHint').textContent = hints[station];
  $('actionList').innerHTML = ACTIONS[station].map(a => {const progress=actionProgress(station,a,ship),disabled=(station==='weapons'&&a.startsWith('Fire')&&!ship.weaponsOnline)||progress.remaining>0;return `<button data-action="${safe(a)}" aria-disabled="${disabled?'true':'false'}">${safe(actionLabel(station,a,ship))}${progress.remaining>0?` · ${(progress.remaining/1000).toFixed(1)}s`:''}<span class="cooldown-meter"><i style="width:${progress.percent}%"></i></span></button>`;}).join('');
  $('escapeButton').disabled = !ship.crew.includes(profile.id);
  $('eventList').innerHTML = game.events.map(e => `<div class="event"><small>LOG ${String(e.tick).padStart(3, '0')}</small>${safe(e.text)}</div>`).join('');
  $('map').innerHTML = places.map(p => `<span class="map-dot ${p.id === ship.targetId ? 'target' : ''}" style="left:${p.x}%;top:${p.y}%" title="${safe(p.name)}"></span>`).join('') + `<span class="map-dot ship" style="left:${ship.x}%;top:${ship.y}%" title="${safe(ship.name)}"></span>`;
  drawSpace(ship, target);
  renderDevices(ship, places);
  renderQuarters();
}
function drawPortrait(canvas, officer, options={}) { drawCadet(canvas.getContext('2d'), {x:0,y:0,w:canvas.width,h:canvas.height}, officer, options); }
function renderQuarters() {
  $('quartersName').textContent = `${profile.name} ${rankMark(profile)}`;
  $('quartersRank').textContent = `LEVEL ${level(profile.xp)} OFFICER`;
  $('quartersAccessory').textContent = profile.look?.accessory === 'none' ? 'Standard issue uniform' : profile.look?.accessory || 'Standard issue uniform';
  $('quartersStats').innerHTML = [
    ['XP', profile.xp], ['Missions', profile.successes], ['Kills', profile.kills],
    ['Restorations', profile.deaths], ['Pods launched', profile.escapes || 0], ['Blast survivors', profile.survivedExplosions || 0],
    ['Close calls', profile.closeCalls || 0], ['Best escape', profile.bestEscapeMs == null ? '—' : `${(profile.bestEscapeMs/1000).toFixed(1)}s`], ['Crewmates', profile.crewmates?.length || 0]
  ].map(([label,value])=>`<span><strong>${safe(value)}</strong>${safe(label)}</span>`).join('');
  $('quartersMedals').textContent = profile.medals?.length ? profile.medals.join(' · ') : 'No medals yet. Your first mission is waiting.';
  $('quartersHistory').innerHTML = (profile.history || []).slice(0,5).map(h=>`<div>${safe(h)}</div>`).join('') || '<div>No entries yet.</div>';
  $('boardButton').textContent = profile.pod?.status === 'drifting' ? 'Board ship (end pod watch)' : 'Board the bridge';
  drawPortrait($('quartersPortrait'), profile);
  drawQuartersCyd();
}
function drawQuartersCyd() {
  const canvas=$('quartersCyd'),ctx=canvas.getContext('2d'),now=Date.now();ctx.fillStyle='#05111e';ctx.fillRect(0,0,320,240);ctx.textBaseline='top';
  ctx.fillStyle='#9de6d8';ctx.font='bold 13px sans-serif';ctx.fillText('POCKET FLEET',9,7);ctx.textAlign='right';ctx.fillText(dockMode?'DOCK >':'MY ROOM >',311,7);ctx.textAlign='left';
  ctx.strokeStyle='#477481';ctx.beginPath();ctx.moveTo(8,27);ctx.lineTo(312,27);ctx.stroke();
  if(!dockMode){drawCadet(ctx,{x:9,y:36,w:126,h:155},profile,{now});ctx.fillStyle='#e9f5f2';ctx.font='bold 16px sans-serif';ctx.fillText(profile.name.slice(0,15),143,47);ctx.fillStyle='#9cdbcf';ctx.font='12px sans-serif';ctx.fillText(`LEVEL ${level(profile.xp)} ${rankMark(profile)}`,143,76);ctx.fillText(`${profile.xp} XP · ${profile.successes} missions`,143,100);ctx.fillText(`${profile.escapes||0} pods · ${profile.kills} kills`,143,122);ctx.fillStyle='#173847';ctx.fillRect(9,197,302,27);ctx.fillStyle='#b8f4e3';ctx.font='bold 13px sans-serif';ctx.fillText('BOARD BRIDGE',104,203);}
  else{ctx.fillStyle='#9dbfc5';ctx.font='11px sans-serif';ctx.fillText('DOCKED SHIPS / THIS HOST',10,34);const docks=dockedShips.slice(0,4);if(!docks.length){ctx.fillStyle='#acc4cc';ctx.fillText(hostAvailable?'No ships docked. Tap Refresh below.':'Open from a local host to browse ships.',11,68);}docks.forEach((d,i)=>{const y=57+i*37;ctx.fillStyle='#102d3e';ctx.fillRect(8,y,304,33);ctx.fillStyle='#e8f5ed';ctx.font='bold 11px sans-serif';ctx.fillText(d.ship.slice(0,20),16,y+4);ctx.fillStyle='#a9c4ca';ctx.font='10px sans-serif';ctx.fillText(`${d.crew}/${d.capacity} crew · ${d.crew>=d.capacity?'FULL':d.shipLocked||d.fleetLocked?'LOCKED':'OPEN'} · LAN ?`,16,y+19);});ctx.fillStyle='#174a50';ctx.fillRect(8,211,304,19);ctx.fillStyle='#c0f4e2';ctx.font='bold 10px sans-serif';ctx.fillText('TAP A SHIP OR PREPARE YOUR OWN BELOW',17,215);}
  ctx.fillStyle='#17636a';ctx.fillRect(0,232,320,8);
}
function drawSpace(ship) { const canvas=$('spaceView'),ctx=canvas.getContext('2d');drawUniverse(ctx,{x:0,y:0,w:canvas.width,h:canvas.height},game,ship,{places:sector(game.seed)});ctx.fillStyle='#9ed0ce';ctx.font='12px monospace';ctx.fillText(`PF / ${ship.name.toUpperCase()} / HDG ${ship.heading}° / SPD ${ship.speed||0}`,18,canvas.height-15); }
function renderDevices(ship, places) {
  const shown = displayMode === 'all' ? [...STATIONS, 'forward'] : [previewForward ? 'forward' : station];
  const grid = $('deviceGrid'), key = shown.join(',');
  if (grid.dataset.key !== key) {
    grid.dataset.key = key; grid.classList.toggle('one', displayMode === 'one');
    grid.innerHTML = shown.map(s => `<div class="device-card"><header>${safe(s)} · 320 × 240</header><canvas width="320" height="240" data-station="${s}" aria-label="${s} CYD screen"></canvas></div>`).join('');
  }
  for (const card of grid.querySelectorAll('.device-card')) {
    const canvas=card.querySelector('canvas');card.classList.toggle('active',canvas.dataset.station === (previewForward ? 'forward' : station));
    drawDevice(canvas,ship,places);
  }
  $('oneDisplay').classList.toggle('primary',displayMode==='one'&&!previewForward);
  $('allDisplays').classList.toggle('primary',displayMode==='all');
  $('forwardDisplay').classList.toggle('primary',displayMode==='one'&&previewForward);
}
function drawForwardMini(ctx,ship,target,area) { drawUniverse(ctx,area,game,ship,{places:sector(game.seed)}); }
function drawDevice(canvas, ship, places) {
  const s=canvas.dataset.station,ctx=canvas.getContext('2d'),alert=ship.alert||'green',target=places.find(p=>p.id===targetFor(s)),now=Date.now();
  ctx.fillStyle='#02090f';ctx.fillRect(0,0,320,240);ctx.textBaseline='top';ctx.textAlign='left';
  ctx.fillStyle='#8fdfd7';ctx.font='bold 14px Arial';ctx.fillText(s==='helm'?`PAGE ${helmPage+1}/3 ›`:'POCKET FLEET',9,7);
  ctx.fillStyle='#a8bdc4';ctx.textAlign='right';ctx.fillText(s.toUpperCase()+' ›',311,7);ctx.textAlign='left';
  if(choosingTarget&&s===station){
    ctx.fillStyle='#a8bdc4';ctx.textAlign='right';ctx.fillText('BACK ›',311,7);ctx.textAlign='left';
    ctx.fillStyle='#8fdfd7';ctx.font='bold 13px Arial';ctx.fillText(s==='helm'?'CHOOSE COURSE':'CHOOSE TARGET',10,27);
    places.slice(0,8).forEach((place,i)=>{const y=47+i*22,selected=targetFor(s)===place.id;ctx.fillStyle=selected?'#234e58':'#102d3e';ctx.fillRect(8,y,304,20);ctx.fillStyle=selected?'#f5d486':'#f0f5f1';ctx.font='bold 11px Arial';ctx.fillText(`${i+1}  ${place.name.slice(0,17)}`,14,y+3);ctx.fillStyle='#9bded2';ctx.textAlign='right';ctx.font='9px Arial';ctx.fillText(place.kind.slice(0,7),306,y+5);ctx.textAlign='left';});
    ctx.fillStyle='#91a9af';ctx.font='9px Arial';ctx.fillText('Selection stays local until SET COURSE',8,225);
    return;
  }
  const scene={x:7,y:29,w:306,h:s==='forward'?188:86};ctx.fillStyle='#071a27';ctx.fillRect(scene.x,scene.y,scene.w,scene.h);
  if(s==='forward'||s==='captain')drawForwardMini(ctx,ship,target,scene);
  else if(s==='helm'){
    ctx.strokeStyle='#315b6a';for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(154,72,15+i*22,0,Math.PI*2);ctx.stroke();}
    const heading=(ship.heading||0)*Math.PI/180;ctx.strokeStyle='#83ded4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(154,72);ctx.lineTo(154+Math.cos(heading)*45,72+Math.sin(heading)*45);ctx.stroke();
    ctx.fillStyle='#a6e3c7';ctx.beginPath();ctx.moveTo(154+Math.cos(heading)*14,72+Math.sin(heading)*14);ctx.lineTo(150,77);ctx.lineTo(156,77);ctx.fill();
    if(target){ctx.fillStyle='#f0c185';ctx.beginPath();ctx.arc(235,47,6,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#b7f2db';ctx.font='bold 16px Arial';ctx.fillText('↑',148,33);ctx.fillText('↓',148,85);ctx.fillText('←',91,64);ctx.fillText('→',207,64);
    ctx.fillStyle='#b9cbd2';ctx.font='11px Arial';ctx.fillText(`HDG ${ship.heading}°   SPEED ${ship.speed||0}   X${Math.round(ship.x)} Y${Math.round(ship.y)}`,15,98);
  }else if(s==='weapons'){
    ctx.strokeStyle=ship.weaponsOnline?'#e77476':'#617585';ctx.lineWidth=2;ctx.beginPath();ctx.arc(160,71,34,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(115,71);ctx.lineTo(205,71);ctx.moveTo(160,31);ctx.lineTo(160,112);ctx.stroke();
    ctx.fillStyle=target?.kind==='ship'?'#e88d83':'#9dc9d1';ctx.beginPath();ctx.moveTo(160,60);ctx.lineTo(150,84);ctx.lineTo(170,84);ctx.fill();
    ctx.fillStyle=ship.weaponsOnline?'#f5a0a1':'#9eb5bb';ctx.font='bold 11px Arial';ctx.fillText(ship.weaponsOnline?'ARMED':'SAFE · POWER UP',14,97);
    const shot=(game.effects||[]).find(e=>e.shipId===ship.id&&(e.kind==='pulse'||e.kind==='torpedo')&&now-e.at<1100);if(shot){const sx=shot.barrel%2?295:25;ctx.strokeStyle=shot.kind==='pulse'?'#6ceeff':'#ffbf77';ctx.lineWidth=shot.kind==='pulse'?3:1;ctx.beginPath();ctx.moveTo(sx,110);ctx.lineTo(160,73);ctx.stroke();}
  }else if(s==='engineering'){
    const nodes=[['bridge',160,42],['communications',62,73],['weapons',258,73],['engines',160,97],['hull',160,70]];
    ctx.strokeStyle='#497380';ctx.lineWidth=4;for(const [name,x,y] of nodes){ctx.beginPath();ctx.moveTo(160,70);ctx.lineTo(x,y);ctx.stroke();}
    for(const [name,x,y] of nodes){const v=ship.systems?.[name]??100;ctx.fillStyle=v<35?'#a74755':v<70?'#ae8b47':'#2c8a81';ctx.beginPath();ctx.arc(x,y,name===selectedSystem?15:12,0,Math.PI*2);ctx.fill();ctx.strokeStyle=name===selectedSystem?'#e7fff2':'#779eaa';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#ecf6f0';ctx.font='bold 8px Arial';ctx.textAlign='center';ctx.fillText(name.slice(0,4).toUpperCase(),x,y-5);ctx.textAlign='left';}
  }else if(s==='science'){
    ctx.strokeStyle='#315b6a';for(let i=1;i<=3;i++){ctx.beginPath();ctx.arc(160,72,i*24,0,Math.PI*2);ctx.stroke();}const angle=now/750;ctx.strokeStyle='#a6e3c7';ctx.beginPath();ctx.moveTo(160,72);ctx.lineTo(160+Math.cos(angle)*75,72+Math.sin(angle)*75);ctx.stroke();ctx.fillStyle='#ecd18b';ctx.beginPath();ctx.arc(196,51,4,0,Math.PI*2);ctx.fill();
  }else if(s==='communications'){
    const recent=game.events?.[0],active=recent?.at&&now-recent.at<5000;ctx.strokeStyle='#9ddcd9';ctx.lineWidth=2;ctx.beginPath();for(let x=15;x<305;x+=4){const wave=active?Math.sin(x*.12+now/90)*14*Math.sin(x*.026+now/250):Math.sin(x*.05+now/600)*2;if(x===15)ctx.moveTo(x,72+wave);else ctx.lineTo(x,72+wave);}ctx.stroke();ctx.fillStyle='#94b8c1';ctx.font='11px Arial';ctx.fillText(active?'INCOMING TRANSMISSION':'FLEET CHANNEL OPEN',18,98);
  }
  if(s==='forward'){ctx.fillStyle='#b9d6da';ctx.font='bold 11px Arial';ctx.fillText(`${ship.name} · ${places.find(p=>p.id===ship.targetId)?.name||'OPEN SPACE'}`,10,222);}
  else{
    ctx.fillStyle='#a7cbd0';ctx.font='bold 11px Arial';ctx.fillText(`H${Math.round(ship.hull)}  S${Math.round(ship.shields)}  E${Math.round(ship.energy)}`,9,122);
    ctx.textAlign='right';ctx.fillStyle='#a6e3c7';ctx.fillText(s==='engineering'?`${selectedSystem.toUpperCase()} ›`:s==='helm'?`CHOOSE ${(target?.name||'TARGET').slice(0,8)} ›`:(target?.name||'TARGET')+' ›',311,122);ctx.textAlign='left';
    deviceActions(s).forEach((action,i)=>{const y=144+i*21,progress=actionProgress(s,action,ship,now),disabled=(s==='weapons'&&action.startsWith('Fire')&&!ship.weaponsOnline)||progress.remaining>0;ctx.fillStyle=disabled?'#192a32':'#173944';ctx.fillRect(8,y,304,19);ctx.strokeStyle='#3f7680';ctx.strokeRect(8,y,304,19);ctx.fillStyle=disabled?'#657d85':'#b0f1e5';ctx.font='bold 11px Arial';ctx.fillText(`${s==='helm'?helmPage*4+i+1:i+1}  ${actionLabel(s,action,ship)}${progress.remaining>0?`  ${(progress.remaining/1000).toFixed(1)}s`:''}`,16,y+2);ctx.fillStyle='#264951';ctx.fillRect(10,y+16,299,2);ctx.fillStyle=disabled?'#8bc9bd':'#54ad9d';ctx.fillRect(10,y+16,299*progress.percent/100,2);});
  }
  ctx.fillStyle=alert==='red'?'#c44a57':alert==='yellow'?'#c9a94e':'#17636a';ctx.fillRect(0,232,320,8);ctx.fillStyle='#f4eee3';ctx.font='bold 8px Arial';ctx.fillText('POD · HOLD BOOT',8,233);
  if(tapFlash?.station===s&&now-tapFlash.at<230){ctx.strokeStyle='#b2ffdf';ctx.lineWidth=4;ctx.strokeRect(2,2,316,236);}
}
async function chooseStation(next) {
  if (station !== next) { station = next; selectedTargetId=targetFor(next); profile.stationSessions[station]++; persist(); if (online) { try { await update('profile', { profile }); } catch (err) { toast(err.message); } } }
  render();
}
async function performAction(action, actionStation = station) {
  if (busy) return; busy = true;
  try { const payload = { playerId: profile.id, shipId, station: actionStation, action, targetId: targetFor(actionStation), system:selectedSystem };
    if (online) await update('action', payload); else { act(game, profile.id, shipId, actionStation, action, payload.targetId, {system:selectedSystem}); profile = game.players[profile.id]; persist(); render(); }
    if (action === 'Request mission' && game.activeMission) { targetByStation.helm = game.activeMission.targetId; render(); }
  } catch (err) { toast(err.message); } finally { busy = false; }
}
async function startSolo() { online = false; code = ''; authToken = ''; store('code', ''); game = read('game') || createGame(); if (!game.ships.some(s=>s.id===shipId)) shipId='ship-1'; joinGame(game, profile, shipId); profile.stationSessions[station]++; inQuarters=false;lastTime=Date.now(); persist(); render(); toast('Solo voyage ready'); }
async function boardBridge() { if (!online) return startSolo(); try { const pin=sessionStorage.getItem(`pf-pin-${code}`)||'', shipPin=sessionStorage.getItem(`pf-ship-pin-${code}-${shipId}`)||''; await update('join',{profile,shipId,pin,shipPin}); profile.stationSessions[station]++; inQuarters=false;lastTime=Date.now(); persist(); render(); } catch(e){toast(e.message);} }
async function returnQuarters() { try { if(online) await update('leave',{playerId:profile.id}); else { leaveGame(game,profile.id); persist(); } inQuarters=true; render();window.scrollTo(0,0); } catch(e){toast(e.message);} }
async function launchPod() { if(busy)return; busy=true; try { if(online) await update('escape',{playerId:profile.id,shipId}); else { escapePod(game,profile.id,shipId); profile=game.players[profile.id];persist(); } inQuarters=true;render();window.scrollTo(0,0);toast('Escape pod launched. Watch your record for the ship outcome.'); } catch(e){toast(e.message);} finally{busy=false;} }
async function host(shipName=$('prepareShipName').value,pin=$('preparePin').value.trim()) { if (!hostAvailable) return toast('Run npm start to host a fleet on Wi‑Fi'); try { const result = await request('create', { name: $('fleetName').value, shipName, pin }); code = result.code; online = true; game = result.game; await update('join', { profile, shipId: 'ship-1', pin }); if(pin)sessionStorage.setItem(`pf-pin-${code}`,pin); shipId = 'ship-1'; store('code', code); inQuarters=true; await update('leave',{playerId:profile.id}); await refreshDocks(); toast(`${game.name} ready · ID ${code}`); } catch (e) { toast(e.message); } }
async function join(requested = $('codeInput').value.trim().toUpperCase()) { if (!requested) return toast('Select a fleet or enter its ID'); const previous={code,authToken,online}; try { code = requested; const pin=$('joinPin').value.trim() || sessionStorage.getItem(`pf-pin-${code}`) || ''; await update('join', { profile, shipId: 'ship-1', pin }); if(pin)sessionStorage.setItem(`pf-pin-${code}`,pin); online = true; shipId = 'ship-1'; store('code', code); inQuarters=true; await update('leave',{playerId:profile.id}); toast(`Joined ${game.name || 'fleet'} ${code}`); } catch (e) { code=previous.code;authToken=previous.authToken;online=previous.online;toast(e.message); } }
async function refreshFleets() { if (!hostAvailable) return toast('Open this app from the local fleet host to scan'); try { const { fleets } = await request('fleets'); $('fleetList').innerHTML = fleets.length ? fleets.map(f => `<div class="fleet-row"><span><strong>${safe(f.name)}</strong><small>${safe(f.code)} · ${f.locked ? '🔒 code' : 'open'} · ${f.crew} crew</small></span><button data-fleet="${safe(f.code)}">Join</button></div>`).join('') : '<p class="hint">No fleets on this host yet.</p>'; await refreshDocks(); } catch (e) { toast(e.message); } }
async function refreshDocks() {if(!hostAvailable)return;try{const data=await request('docks');dockedShips=data.docks||[];$('dockList').innerHTML=dockedShips.length?dockedShips.map((d,i)=>`<div class="dock-card"><span><strong>${safe(d.ship)}</strong><small>${safe(d.fleet)} · ${d.crew}/${d.capacity} crew · ${d.crew>=d.capacity?'full':d.shipLocked||d.fleetLocked?'🔒 code':'open'} · Wi-Fi RSSI available on CYD · ${d.protocol===2?'compatible':'version mismatch'}</small></span><button data-dock="${i}" ${d.protocol!==2||d.crew>=d.capacity?'disabled':''}>${d.crew>=d.capacity?'Full':'Request boarding'}</button></div>`).join(''):'<p class="hint">No ships docked on this host.</p>';drawQuartersCyd();}catch(e){toast(e.message);}}
async function requestBoarding(index) {const dock=dockedShips[index];if(!dock)return;const pin=dock.fleetLocked?prompt('Fleet lock code')||'':'';const shipPin=dock.shipLocked?prompt('Ship lock code')||'':'';const previous={code,authToken,online,shipId};try{code=dock.code;shipId=dock.shipId;await update('join',{profile,shipId,pin,shipPin});online=true;store('code',code);if(pin)sessionStorage.setItem(`pf-pin-${code}`,pin);if(shipPin)sessionStorage.setItem(`pf-ship-pin-${code}-${shipId}`,shipPin);inQuarters=false;render();toast(`Boarded ${dock.ship}`);}catch(e){code=previous.code;authToken=previous.authToken;online=previous.online;shipId=previous.shipId;toast(e.message);}}
$('soloButton').onclick = startSolo;
$('boardButton').onclick = boardBridge;
$('editFromQuarters').onclick = () => $('profileButton').click();
$('escapeButton').onclick = launchPod;
$('quartersButton').onclick = returnQuarters;
$('hostButton').onclick = () => host($('prepareShipName').value,$('hostPin').value.trim());
$('prepareShip').onclick = () => host($('prepareShipName').value,$('preparePin').value.trim());
$('refreshDocks').onclick = refreshDocks;
$('dockList').onclick = e => {const b=e.target.closest('[data-dock]');if(b)requestBoarding(Number(b.dataset.dock));};
$('roomTab').onclick = () => {dockMode=false;$('dockPanel').hidden=true;$('roomTab').classList.add('primary');$('dockTab').classList.remove('primary');drawQuartersCyd();};
$('dockTab').onclick = () => {dockMode=true;$('dockPanel').hidden=false;$('dockTab').classList.add('primary');$('roomTab').classList.remove('primary');refreshDocks();drawQuartersCyd();};
$('quartersCyd').onclick = e => {const r=e.target.getBoundingClientRect(),x=(e.clientX-r.left)*320/r.width,y=(e.clientY-r.top)*240/r.height;if(y<29&&x>170){dockMode?$('roomTab').click():$('dockTab').click();return;}if(!dockMode&&y>194&&y<230)boardBridge();if(dockMode&&y>=57&&y<205)requestBoarding(Math.floor((y-57)/37));};
$('joinButton').onclick = () => join();
$('scanButton').onclick = refreshFleets;
$('fleetList').onclick = e => { const b=e.target.closest('[data-fleet]'); if (!b) return; $('codeInput').value=b.dataset.fleet; join(b.dataset.fleet); };
$('shipSelect').onchange = async e => { const previous = shipId, next = e.target.value; shipId = next; try { if (online) { const shipPin=$('shipJoinPin').value.trim() || sessionStorage.getItem(`pf-ship-pin-${code}-${shipId}`) || ''; await update('join', { profile, shipId, pin: sessionStorage.getItem(`pf-pin-${code}`) || '', shipPin }); if(shipPin)sessionStorage.setItem(`pf-ship-pin-${code}-${shipId}`,shipPin); $('shipJoinPin').value=''; } else { joinGame(game, profile, shipId); persist(); render(); } } catch (err) { shipId=previous;render();toast(err.message); } };
$('addShipButton').onclick = async () => { const name = $('shipName').value.trim(), pin=$('shipCreatePin').value.trim(); if (!name) return toast('Name your ship first'); try { if (online) { await update('ship', { name, pin, playerId: profile.id }); shipId = game.ships.at(-1).id; await update('join', { profile, shipId, pin: sessionStorage.getItem(`pf-pin-${code}`) || '', shipPin: pin }); if(pin)sessionStorage.setItem(`pf-ship-pin-${code}-${shipId}`,pin); } else { shipId = addShip(game, name).id; joinGame(game, profile, shipId); persist(); render(); } $('shipName').value = ''; $('shipCreatePin').value=''; } catch (err) { toast(err.message); } };
$('stationSelect').onchange = async e => { await chooseStation(e.target.value); };
$('targetSelect').onchange = e => setTarget(station,e.target.value);
$('systemSelect').onchange = e => {selectedSystem=e.target.value;render();};
$('actionList').onclick = e => { const button=e.target.closest('[data-action]'); if (button) {button.classList.add('registered');setTimeout(()=>button.classList.remove('registered'),230);performAction(button.dataset.action);} };
$('oneDisplay').onclick = () => { displayMode='one';previewForward=false;store('display-mode',displayMode);render(); };
$('allDisplays').onclick = () => { displayMode='all';previewForward=false;store('display-mode',displayMode);render(); };
$('forwardDisplay').onclick = () => { displayMode='one';previewForward=true;store('display-mode',displayMode);render(); };
$('deviceOnlyButton').onclick = () => { deviceOnly=!deviceOnly;store('device-only',deviceOnly);history.replaceState({},'',deviceOnly ? `${location.pathname}?view=cyd` : location.pathname);render();window.scrollTo(0,0); };
$('deviceGrid').onclick = async e => { const canvas=e.target.closest('canvas[data-station]'); if(!canvas)return; const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*320/rect.width,y=(e.clientY-rect.top)*240/rect.height,s=canvas.dataset.station;tapFlash={station:s,at:Date.now()};drawDevice(canvas,currentShip(),sector(game.seed));if(choosingTarget&&s===station){if(y<29&&x>170)choosingTarget=false;else if(y>=47&&y<223){const index=Math.floor((y-47)/22),place=sector(game.seed)[index];if(place){targetByStation[s]=place.id;choosingTarget=false;}}render();return;}if(y>=232){await launchPod();return;} if(s==='forward'){if(y<29&&x>170){previewForward=false;render();}return;} if(y<29&&x>170){await chooseStation(STATIONS[(STATIONS.indexOf(s)+1)%STATIONS.length]);return;} if(y<29&&s==='helm'&&x<110){helmPage=(helmPage+1)%3;render();return;} if(s==='helm'&&y>=29&&y<115){const direction=y<52?'up':y>91?'down':x<125?'left':x>193?'right':null;if(direction){await chooseStation(s);await performAction(`Move ${direction}`,s);return;}}if(s==='engineering'&&y>=29&&y<115){const nodes=[['bridge',160,42],['communications',62,73],['weapons',258,73],['engines',160,97],['hull',160,70]],hit=nodes.find(([,nx,ny])=>Math.hypot(x-nx,y-ny)<17);if(hit){selectedSystem=hit[0];render();return;}}if(y>=118&&y<140&&x>185){if(s==='engineering')selectedSystem=SYSTEMS[(SYSTEMS.indexOf(selectedSystem)+1)%SYSTEMS.length];else choosingTarget=true;render();return;} if(y>=144&&y<228){const action=deviceActions(s)[Math.floor((y-144)/21)];if(action){await chooseStation(s);await performAction(action,s);}} };
function portraitDraft() { return { ...profile, look: { hue: Number($('lookHue').value), tone: Number($('portraitTone').value), hair: $('hairStyle').value, species:$('species').value,face:$('faceShape').value,eyes:$('eyeStyle').value,accessory: $('accessory').value } }; }
function previewPortrait() { drawPortrait($('profilePortrait'), portraitDraft()); }
$('profileButton').onclick = () => { $('profileName').value = profile.name; $('lookHue').value = profile.look?.hue ?? 190; $('portraitTone').value = profile.look?.tone ?? 28; $('hairStyle').value = profile.look?.hair || 'crop';$('species').value=profile.look?.species||'human';$('faceShape').value=profile.look?.face||'round';$('eyeStyle').value=profile.look?.eyes||'bright'; $('accessory').innerHTML = unlocks(profile).map(a => `<option>${safe(a)}</option>`).join(''); $('accessory').value = profile.look?.accessory || 'none'; $('profileStats').innerHTML = `Level ${level(profile.xp)} · ${profile.xp} XP · ${rankMark(profile)}<br>${profile.missions} missions · ${profile.kills} kills · ${profile.deaths} restorations<br>${profile.escapes||0} pods · ${profile.survivedExplosions||0} blast survivors · ${profile.closeCalls||0} close calls<br>Medals: ${profile.medals.map(safe).join(', ') || 'none'}<br>Crewmates: ${(profile.crewmates || []).map(safe).join(', ') || 'none'}<br>Recent battle: ${safe(profile.battles?.[0] || 'none')}<br>${STATIONS.map(s => `${s}: ${Math.floor(profile.stationSeconds[s]/60)} min`).join(' · ')}`; previewPortrait(); $('profileDialog').showModal(); };
for(const id of ['lookHue','portraitTone','hairStyle','species','faceShape','eyeStyle','accessory']) $(id).oninput=previewPortrait;
$('saveProfile').onclick = async () => { profile.name = $('profileName').value.trim().slice(0,24) || 'Cadet'; profile.look = portraitDraft().look; if (online) { try { await update('profile', { profile }); } catch(e) { toast(e.message); } } else { game.players[profile.id] = profile; persist(); render(); } };
async function heartbeat() { const now = Date.now(), seconds = Math.min(60, Math.round((now-lastTime)/1000)); lastTime = now; if (!seconds || inQuarters) return; if (online) { try { await update('time', { playerId: profile.id, station, seconds }); } catch { toast('Fleet connection interrupted'); } } else { creditTime(game, profile.id, station, seconds); persist(); } }
setInterval(heartbeat, 30000);
setInterval(() => { if(!online && advanceGame(game)){profile=game.players[profile.id]||profile;persist();render();} },1000);
setInterval(() => { if(inQuarters){drawQuartersCyd();drawPortrait($('quartersPortrait'),profile);return;} const ship=currentShip(), places=sector(game.seed); for(const canvas of document.querySelectorAll('#deviceGrid canvas'))drawDevice(canvas,ship,places);drawSpace(ship);for(const button of $('actionList').querySelectorAll('[data-action]')){const a=button.dataset.action,p=actionProgress(station,a,ship),disabled=(station==='weapons'&&a.startsWith('Fire')&&!ship.weaponsOnline)||p.remaining>0;button.setAttribute('aria-disabled',disabled?'true':'false');button.firstChild.textContent=actionLabel(station,a,ship)+(p.remaining>0?` · ${(p.remaining/1000).toFixed(1)}s`:'');button.querySelector('i').style.width=`${p.percent}%`;} },250);
setInterval(async () => { if (!online || busy) return; try { const result = await request(`state?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(profile.id)}`); game = result.game; profile = game.players[profile.id] || profile; render(); } catch { /* transient LAN interruption */ } }, 2000);
try { await request('health'); hostAvailable = true; if (code) { try { const data = await request(`state?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(profile.id)}`); game=data.game; profile=game.players[profile.id] || profile; online=true; } catch { try { await update('join', { profile, shipId: 'ship-1', pin: sessionStorage.getItem(`pf-pin-${code}`) || '' }); online=true; } catch { code='';authToken='';store('code',''); } } if(online && game.ships.some(s=>s.crew.includes(profile.id)))await update('leave',{playerId:profile.id}); refreshFleets(); } } catch { code = ''; store('code',''); }
render();
