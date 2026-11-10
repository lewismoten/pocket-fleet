export const STATIONS = ['captain', 'helm', 'weapons', 'engineering', 'science', 'communications'];
export const ACTIONS = {
  captain: ['Red alert', 'Yellow alert', 'Stand down', 'Order: advance'],
  helm: ['Set course', 'Thrust', 'Turn left', 'Turn right', 'Speed up', 'Slow down', 'Approach target', 'Evade', 'Dock', 'Move up', 'Move down', 'Move left', 'Move right'],
  weapons: ['Toggle power', 'Fire pulse', 'Fire torpedo'],
  engineering: ['Repair system', 'Boost engines', 'Recharge shields'],
  science: ['Scan sector', 'Scan target', 'Analyze anomaly'],
  communications: ['Request mission', 'Hail target', 'Negotiate', 'Transmit report']
};
export const SYSTEMS = ['hull','engines','weapons','bridge','communications'];
export const PULSE_WARMUP_MS = 2000, TORPEDO_WARMUP_MS = 5000, PULSE_COOLDOWN_MS = 1600, TORPEDO_COOLDOWN_MS = 7000;
export const ENGINEERING_COOLDOWN_MS = 8000;
export const WIFI_WORDS = ['astro','comet','cosmo','orbit','lunar','scout','spark','beeps','solar','venus','earth','pluto','titan','atlas','orion','draco','hydra','aries','virgo','vesta','ceres','rigel','astra','flare','radar','quark','laser','alien'];

export function rng(seed) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function randomSeed() {if(globalThis.crypto?.getRandomValues){const bytes=new Uint32Array(1);globalThis.crypto.getRandomValues(bytes);return bytes[0];}return Math.floor(Math.random()*2**32);}
const names = ['Aster', 'Vela', 'Morrow', 'Sable', 'Iona', 'Kestrel', 'Orchid', 'Atlas'];
const kinds = ['colony', 'moon', 'station', 'nebula', 'ship'];
export function sector(seed) {
  const r = rng(seed);
  return Array.from({ length: 8 }, (_, i) => ({
    id: i + 1, name: `${pick(r, names)} ${i + 1}`, kind: i < 4 ? ['colony', 'ship', 'station', 'nebula'][i] : pick(r, kinds),
    x: Math.round(12 + r() * 76), y: Math.round(16 + r() * 68), hue: Math.round(r() * 360)
  }));
}
export function mission(seed, index) {
  const r = rng(hash(`${seed}:${index}`));
  const types = [
    ['supply run', 'Deliver medical supplies to'],
    ['convoy', 'Escort a merchant ship to'],
    ['diplomacy', 'Transport an envoy to'],
    ['survey', 'Survey the anomaly near'],
    ['defense', 'Repel raiders near']
  ];
  const [type, verb] = pick(r, types);
  const candidates = sector(seed).filter(p => type === 'survey' ? p.kind === 'nebula' : type === 'defense' ? p.kind === 'colony' : p.kind === 'colony' || p.kind === 'station');
  const target = pick(r, candidates);
  return { id: index, type, targetId: target.id, title: `${verb} ${target.name}`, progress: 0, status: 'available' };
}
export function createGame(seed = randomSeed()) {
  return {
    seed, tick: 0, events: [{ tick: 0, text: 'Fleet command online. Open communications for your first assignment.' }], effects: [],
    ships: [{ id: 'ship-1', name: 'Wayfarer', locked: false, hull: 100, shields: 80, energy: 100, weaponsOnline: false, weapons: { pulseReadyAt: 0, torpedoReadyAt: 0, barrel: 0 }, systems: Object.fromEntries(SYSTEMS.map(s=>[s,100])), engineeringReadyAt: {}, x: 50, y: 50, heading: 0, speed: 1, targetId: null, enemy: 0, alert: 'green', crew: [] }],
    players: {}, missionIndex: 1, activeMission: null, completed: 0
  };
}
export function createProfile(name = 'Cadet') {
  return { id: `p-${Math.random().toString(36).slice(2, 10)}`, name: String(name).slice(0, 24), xp: 0,
    deaths: 0, kills: 0, missions: 0, successes: 0, stationSeconds: Object.fromEntries(STATIONS.map(s => [s, 0])),
    stationSessions: Object.fromEntries(STATIONS.map(s => [s, 0])), medals: [], history: [], crewmates: [], battles: [],
    escapes: 0, survivedExplosions: 0, closeCalls: 0, bestEscapeMs: null, pod: null,
    look: { hue: 190, tone: 28, hair: 'crop', accessory: 'none', species: 'human', face: 'round', eyes: 'bright' } };
}
export function level(xp) { return 1 + Math.floor(Math.sqrt(xp / 100)); }
export function rankMark(profile) { const n = level(profile.xp); return n >= 7 ? '✦✦' : n >= 4 ? '✦' : n >= 2 ? '◆' : ''; }
export function unlocks(profile) {
  const out = ['none', 'flight jacket'];
  if (profile.stationSeconds.science >= 300) out.push('scanner visor');
  if (profile.stationSeconds.engineering >= 300) out.push('tool belt');
  if (profile.stationSeconds.weapons >= 300) out.push('tactical patch');
  if (profile.deaths >= 1) out.push('battle scar', 'bandage');
  if (profile.deaths >= 3 && profile.stationSeconds.captain >= 300) out.push('lucky eyepatch');
  return out;
}
function log(g, text) { g.events.unshift({ tick: g.tick, text, at: Date.now() }); g.events.length = Math.min(g.events.length, 25); }
function award(p, xp) { p.xp += xp; }
function damageShip(g, ship, damage) {
  const blocked=Math.min(ship.shields,damage);ship.shields-=blocked;ship.hull-=damage-blocked;
  if(damage>blocked){ship.systems ||= Object.fromEntries(SYSTEMS.map(s=>[s,100]));const system=SYSTEMS[hash(`${g.seed}:${g.tick}:${ship.id}`)%SYSTEMS.length];ship.systems[system]=clamp(ship.systems[system]-(damage-blocked)*2,0,100);}
}
function die(g, ship, now = Date.now()) {
  g.effects ||= []; g.effects.unshift({ shipId: ship.id, kind: 'explosion', at: now, tick: g.tick }); g.effects.length = Math.min(g.effects.length, 8);
  for (const p of Object.values(g.players)) {
    if (p.pod?.shipId !== ship.id || p.pod.status !== 'drifting') continue;
    const elapsed = Math.max(0, now - p.pod.launchedAt);
    p.pod.status = 'survived'; p.pod.escapeToExplosionMs = elapsed;
    p.survivedExplosions = (p.survivedExplosions || 0) + 1;
    p.bestEscapeMs = p.bestEscapeMs == null ? elapsed : Math.min(p.bestEscapeMs, elapsed);
    if (elapsed <= 10000) p.closeCalls = (p.closeCalls || 0) + 1;
    const bonus = elapsed <= 120000 ? Math.max(1, Math.round(300 / (1 + elapsed / 1000))) : 0;
    award(p, bonus);
    p.history.unshift(`Escaped ${ship.name} ${Math.round(elapsed / 1000)}s before it exploded (+${bonus} XP).`);
    if (elapsed <= 5000 && !p.medals.includes('Narrow escape')) p.medals.push('Narrow escape');
    log(g, `${p.name}'s pod survived the loss of ${ship.name}.`);
  }
  ship.hull = 100; ship.shields = 40; ship.energy = 70; ship.enemy = 0; ship.alert = 'green'; ship.weaponsOnline = false; ship.weapons = {pulseReadyAt:0,torpedoReadyAt:0,barrel:0};ship.lastCombatAt = null; ship.x = 50; ship.y = 50;
  ship.systems=Object.fromEntries(SYSTEMS.map(s=>[s,100]));ship.engineeringReadyAt={};
  for (const id of ship.crew) {
    const p = g.players[id]; if (!p) continue;
    p.deaths++; p.history.unshift(`Lost ${ship.name} in sector ${g.seed}; restored from neural backup.`);
  }
  log(g, `${ship.name} was lost. Crew aboard restored from neural backups; launched pods survived independently.`);
}
export function joinGame(g, profile, shipId = 'ship-1') {
  if (!g.ships.some(s => s.id === shipId)) throw Error('Ship not found');
  const destination=g.ships.find(s=>s.id===shipId);if(destination.crew.length>=8&&!destination.crew.includes(profile.id))throw Error('Ship crew is full');
  profile.crewmates ||= []; profile.battles ||= [];
  profile.escapes ||= 0; profile.survivedExplosions ||= 0; profile.closeCalls ||= 0;
  if (profile.pod?.status === 'drifting') profile.pod.status = 'rescued';
  g.players[profile.id] = profile;
  for (const s of g.ships) s.crew = s.crew.filter(id => id !== profile.id);
  const ship = g.ships.find(s => s.id === shipId);
  for (const id of ship.crew) {
    const other = g.players[id]; if (!other) continue;
    other.crewmates ||= [];
    if (!other.crewmates.includes(profile.name)) other.crewmates.push(profile.name);
    if (!profile.crewmates.includes(other.name)) profile.crewmates.push(other.name);
  }
  ship.crew.push(profile.id);
  log(g, `${profile.name} joined ${g.ships.find(s => s.id === shipId).name}.`);
  return g;
}
export function leaveGame(g, playerId) {
  const ship = g.ships.find(s => s.crew.includes(playerId));
  if (ship) { ship.crew = ship.crew.filter(id => id !== playerId); log(g, `${g.players[playerId]?.name || 'Crew member'} returned to station quarters.`); }
  return g;
}
export function addShip(g, name, locked = false) {
  if (g.ships.length >= 8) throw Error('Fleet is full');
  const clean = String(name || 'New ship').trim().slice(0, 24);
  const ship = { id: `ship-${g.ships.length + 1}`, name: clean, locked: !!locked, hull: 100, shields: 80, energy: 100, weaponsOnline: false, weapons: {pulseReadyAt:0,torpedoReadyAt:0,barrel:0}, systems: Object.fromEntries(SYSTEMS.map(s=>[s,100])), engineeringReadyAt: {}, x: 50, y: 50, heading: 0, speed: 1, targetId: null, enemy: 0, alert: 'green', crew: [] };
  g.ships.push(ship); log(g, `${clean} joined the fleet.`); return ship;
}
export function escapePod(g, playerId, shipId, now = Date.now()) {
  const p = g.players[playerId], ship = g.ships.find(s => s.id === shipId);
  if (!p || !ship?.crew.includes(playerId)) throw Error('Board a ship before launching a pod');
  ship.crew = ship.crew.filter(id => id !== playerId);
  p.escapes = (p.escapes || 0) + 1;
  p.pod = { shipId, shipName: ship.name, launchedAt: now, status: 'drifting' };
  p.history.unshift(`Launched an escape pod from ${ship.name}.`);
  g.tick++; log(g, `${p.name} launched an escape pod from ${ship.name}.`);
  g.effects ||= []; g.effects.unshift({ shipId, kind: 'pod', at: now, tick: g.tick }); g.effects.length = Math.min(g.effects.length, 8);
  return g;
}
export function advanceGame(g, now = Date.now()) {
  let changed = false;
  for (const ship of g.ships) {
    if (!ship.enemy) { ship.lastCombatAt = null; continue; }
    if (!ship.lastCombatAt) { ship.lastCombatAt = now; continue; }
    const steps = Math.min(30, Math.floor((now - ship.lastCombatAt) / 1000));
    if (steps <= 0) continue;
    changed = true; ship.lastCombatAt += steps * 1000;
    for (let i = 0; i < steps; i++) {
      g.tick++;
      const damage = 5 + (g.tick % 4);
      damageShip(g,ship,damage);
      if (ship.hull <= 0) { die(g, ship, ship.lastCombatAt - (steps - i - 1) * 1000); break; }
    }
  }
  return changed;
}
export function act(g, playerId, shipId, station, action, targetId, options = {}, now = Date.now()) {
  const p = g.players[playerId], ship = g.ships.find(s => s.id === shipId);
  if (!p || !ship || !ship.crew.includes(playerId)) throw Error('Join this ship first');
  if (!ACTIONS[station]?.includes(action)) throw Error('Unknown station action');
  ship.weapons ||= {pulseReadyAt:0,torpedoReadyAt:0,barrel:0};ship.systems ||= Object.fromEntries(SYSTEMS.map(s=>[s,100]));ship.engineeringReadyAt ||= {};
  if (station === 'weapons' && action.startsWith('Fire')) {
    if (!ship.weaponsOnline) throw Error('Power up weapons before firing');
    const readyAt = action === 'Fire pulse' ? ship.weapons.pulseReadyAt : ship.weapons.torpedoReadyAt;
    if (now < readyAt) throw Error(`${action === 'Fire pulse' ? 'Pulse' : 'Torpedo'} charging`);
    if (ship.energy < (action === 'Fire torpedo' ? 16 : 8)) throw Error('Not enough energy to fire');
  }
  if (station === 'weapons' && action === 'Toggle power' && !ship.weaponsOnline && ship.energy < 5) throw Error('Not enough energy to power weapons');
  if (station === 'engineering' && now < (ship.engineeringReadyAt[action] || 0)) throw Error('Engineering system cooling down');
  if (station === 'helm' && action === 'Thrust' && !(ship.speed || 0)) throw Error('Increase speed before thrust');
  if (station === 'helm' && action === 'Thrust' && ship.energy < (ship.speed || 0)*2) throw Error('Not enough energy to thrust');
  if (station === 'helm' && action.startsWith('Move ') && (!(ship.speed || 0) || ship.energy < (2+(ship.speed || 0)))) throw Error('Increase speed or charge energy before maneuvering');
  if (station === 'helm' && action === 'Approach target' && !(ship.speed || 0)) throw Error('Increase speed before approach');
  const chosenTargetId=targetId??ship.targetId??g.activeMission?.targetId;
  if (station === 'helm' && action === 'Dock' && (!sector(g.seed).some(x=>x.id===Number(chosenTargetId)&&Math.hypot(x.x-ship.x,x.y-ship.y)<=12))) throw Error('Move within docking range');
  if (station === 'engineering' && ((action === 'Repair system' && ship.energy<10) || (action === 'Recharge shields' && ship.energy<8))) throw Error('Not enough energy');
  g.tick++;
  const target = sector(g.seed).find(x => x.id === Number(chosenTargetId));
  const label = target?.name || 'target';
  if (station === 'captain') {
    if (action === 'Red alert') ship.alert = 'red';
    if (action === 'Yellow alert') ship.alert = 'yellow';
    if (action === 'Stand down') ship.alert = 'green';
    log(g, `${p.name}: ${action}.`);
  }
  if (station === 'helm') {
    if (action === 'Set course' && target) { ship.targetId = target.id; ship.heading = Math.round(Math.atan2(target.y - ship.y, target.x - ship.x) * 180 / Math.PI); log(g, `${ship.name} sets course for ${label}.`);if(target.kind==='ship'){ship.incomingHail={name:`${target.name} commander`,seed:hash(`${g.seed}:${target.id}`),at:now};log(g,`${target.name} requests a channel before contact.`);} }
    else if (action === 'Turn left' || action === 'Turn right') {ship.heading = ((ship.heading + (action === 'Turn left' ? -30 : 30)) % 360 + 360) % 360;log(g,`${ship.name} turns ${action === 'Turn left' ? 'left' : 'right'} to ${ship.heading}°.`);}
    else if (action === 'Speed up' || action === 'Slow down') {ship.speed=clamp((ship.speed||0)+(action==='Speed up'?1:-1),0,4);log(g,`${ship.name} sets speed ${ship.speed}.`);}
    else if (action.startsWith('Move ')) {const step=2+(ship.speed||0)*2;const direction=action.slice(5);ship.x=clamp(ship.x+(direction==='left'?-step:direction==='right'?step:0),0,100);ship.y=clamp(ship.y+(direction==='up'?-step:direction==='down'?step:0),0,100);ship.heading={right:0,down:90,left:180,up:270}[direction];ship.energy=clamp(ship.energy-2-(ship.speed||0),0,100);log(g,`${ship.name} maneuvers ${direction} to ${Math.round(ship.x)}, ${Math.round(ship.y)}.`);}
    else if (action === 'Thrust') {const speed=ship.speed||0;if(!speed)throw Error('Increase speed before thrust');if(ship.energy<speed*2)throw Error('Not enough energy to thrust');const radians=ship.heading*Math.PI/180;ship.x=clamp(ship.x+Math.cos(radians)*(3+speed*3),0,100);ship.y=clamp(ship.y+Math.sin(radians)*(3+speed*3),0,100);ship.energy=clamp(ship.energy-speed*2,0,100);log(g,`${ship.name} moves to ${Math.round(ship.x)}, ${Math.round(ship.y)}.`);}
    else if (action === 'Approach target' && ship.targetId) {
      const dest = sector(g.seed).find(x => x.id === ship.targetId);
      if (ship.speed < 1) throw Error('Increase speed before approach');
      const step=4+ship.speed*4, distance=Math.hypot(dest.x-ship.x,dest.y-ship.y), factor=Math.min(1,step/Math.max(1,distance));
      ship.x=clamp(ship.x+(dest.x-ship.x)*factor,0,100);ship.y=clamp(ship.y+(dest.y-ship.y)*factor,0,100);
      ship.energy = clamp(ship.energy - 3-ship.speed*2, 0, 100); log(g, `${ship.name} approaches ${dest.name}.`);
    } else if (action === 'Evade') { ship.shields = clamp(ship.shields - 3, 0, 100); ship.enemy = clamp(ship.enemy - 8, 0, 100); log(g, `${ship.name} performs evasive maneuvers.`); }
    else if (action === 'Dock') {if (!target || Math.hypot(target.x-ship.x,target.y-ship.y)>12)throw Error('Move within docking range');ship.energy = clamp(ship.energy + 20, 0, 100); log(g, `${ship.name} docks and takes on supplies.`); }
  }
  if (station === 'weapons') {
    if (action === 'Toggle power') {if(!ship.weaponsOnline){ship.weaponsOnline=true;ship.energy-=5;ship.weapons.pulseReadyAt=now+PULSE_WARMUP_MS;ship.weapons.torpedoReadyAt=now+TORPEDO_WARMUP_MS;log(g,`${ship.name} weapons warming up.`);}else{ship.weaponsOnline=false;log(g,`${ship.name} weapons safe.`);}}
    else {
      const damage = action === 'Fire torpedo' ? 34 : 19;
      if (!ship.enemy && target?.kind === 'ship') { ship.enemy = 70; ship.lastCombatAt = now; ship.alert = 'red';ship.incomingHail={name:`${target.name} commander`,seed:hash(`${g.seed}:${target.id}`),at:now};log(g, `${target.name} returns fire!`); }
      ship.energy -= action === 'Fire torpedo' ? 16 : 8;
      const kind=action==='Fire torpedo'?'torpedo':'pulse';ship.weapons[kind+'ReadyAt']=now+(kind==='torpedo'?TORPEDO_COOLDOWN_MS:PULSE_COOLDOWN_MS);const barrel=ship.weapons.barrel++%2;
      g.effects ||= []; g.effects.unshift({ shipId, kind, barrel, targetId: target?.id || ship.targetId, at: now, tick: g.tick }); g.effects.length = Math.min(g.effects.length, 8);
      if (ship.enemy > 0) { ship.enemy = clamp(ship.enemy - damage, 0, 100); if (!ship.enemy) { p.kills++; p.battles ||= []; p.battles.unshift(`Disabled raider aboard ${ship.name} in sector ${g.seed}.`); award(p, 35); log(g, `${p.name} disabled the raider!`); } }
    }
    log(g, `${p.name}: ${action}.`);
  }
  if (station === 'engineering') {
    if (action === 'Repair system') {const system=SYSTEMS.includes(options.system)?options.system:'hull';if(ship.energy<10)throw Error('Not enough energy to repair');ship.energy-=10;ship.systems[system]=clamp(ship.systems[system]+20,0,100);if(system==='hull')ship.hull=clamp(ship.hull+16,0,100);log(g,`${p.name} repairs ${system}.`);}
    if (action === 'Boost engines') {ship.energy=clamp(ship.energy+18,0,100);ship.systems.engines=clamp(ship.systems.engines+4,0,100);}
    if (action === 'Recharge shields') {if(ship.energy<8)throw Error('Not enough energy to recharge shields');ship.energy-=8;ship.shields=clamp(ship.shields+16,0,100);}
    ship.engineeringReadyAt[action]=now+ENGINEERING_COOLDOWN_MS;
    log(g, `${p.name}: ${action}.`);
  }
  if (station === 'science') { log(g, `${p.name}: ${action}. ${target ? `${label} is a ${target.kind}.` : 'Signal mapped.'}`); }
  if (station === 'communications') {
    if (action === 'Request mission' && !g.activeMission) { g.activeMission = mission(g.seed, g.missionIndex++); g.activeMission.status = 'active'; log(g, `New mission: ${g.activeMission.title}.`); }
    else if (action === 'Negotiate' && ship.enemy > 0) { ship.enemy = clamp(ship.enemy - 30, 0, 100); log(g, `${p.name} opened a channel; raiders are standing down.`); }
    else log(g, `${p.name}: ${action}.`);
  }
  if (g.activeMission && g.activeMission.status === 'active') {
    const m = g.activeMission, dest = sector(g.seed).find(x => x.id === m.targetId);
    const atTarget = Math.hypot(ship.x - dest.x, ship.y - dest.y) < 12;
    if (m.type === 'defense' && atTarget && !ship.enemy && m.progress === 0) { ship.enemy = 70; ship.lastCombatAt = now; ship.alert = 'red';ship.incomingHail={name:'Raider commander',seed:hash(`${g.seed}:raider`),at:now}; m.progress = 1; log(g, 'Raiders incoming. Defend the colony!'); }
    const done = m.type === 'defense' ? m.progress && !ship.enemy : atTarget && ((m.type === 'survey' && station === 'science') || (m.type === 'diplomacy' && action === 'Negotiate') || (m.type === 'supply run' && action === 'Dock') || (m.type === 'convoy' && action === 'Dock'));
    if (done) { m.status = 'complete'; g.completed++; for (const id of ship.crew) { const crew = g.players[id]; crew.missions++; crew.successes++; award(crew, 80); crew.history.unshift(`Completed ${m.title} aboard ${ship.name}.`); if (!crew.medals.includes('First voyage')) crew.medals.push('First voyage'); } log(g, `Mission complete: ${m.title}.`); g.activeMission = null; }
  }
  if (ship.enemy > 0) { damageShip(g,ship,3+(g.tick%5)); if (ship.hull <= 0) die(g, ship, now); }
  award(p, 3);
  return g;
}
export function creditTime(g, playerId, station, seconds) {
  const p = g.players[playerId]; if (!p || !STATIONS.includes(station)) return;
  p.stationSeconds[station] += Math.min(60, Math.max(0, seconds));
}
