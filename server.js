import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, createProfile, joinGame, leaveGame, addShip, act, escapePod, advanceGame, creditTime, sector, STATIONS, level, rankMark } from './game.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const rooms = new Map();
const roomPins = new Map();
const shipPins = new Map();
const roomTokens = new Map();
const failedPins = new Map();
const profileFile = join(root, '.data', 'profiles.json');
const savedProfiles = new Map();
let saveQueue = Promise.resolve();
try { for (const [id, profile] of Object.entries(JSON.parse(await readFile(profileFile, 'utf8')))) savedProfiles.set(id, profile); } catch { /* First run */ }
function saveProfiles(g) {
  for (const [id, profile] of Object.entries(g.players)) savedProfiles.set(id, profile);
  const snapshot = JSON.stringify(Object.fromEntries(savedProfiles));
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await mkdir(join(root, '.data'), { recursive: true });
    await writeFile(profileFile + '.tmp', snapshot);
    await rename(profileFile + '.tmp', profileFile);
  });
  return saveQueue;
}
const port = Number(process.env.PORT || 8787);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.bin': 'application/octet-stream' };
const rootAssets = new Set(['index.html', 'flash.html', 'app.js', 'game.js', 'visuals.js', 'style.css', 'manifest.webmanifest', 'favicon.svg', 'web-flash/manifest.json', 'web-flash/manifest-cyd35c.json', 'web-flash/manifest-cardputer-adv.json', 'web-flash/pocket-fleet-cyd.bin', 'web-flash/pocket-fleet-cyd35c.bin', 'web-flash/pocket-fleet-cardputer-adv.bin']);
const characterPreviews = new Set(['characters/preview.html', 'characters/preview_masks.html', 'characters/indexed_preview_data.js', 'characters/preview_data.js']);
const reply = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(data)); };
async function body(req) { let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 16384) throw Error('Request too large'); } return JSON.parse(data || '{}'); }
function room(code) { const g = rooms.get(String(code || '').toUpperCase()); if (!g) throw Error('Fleet code not found'); return g; }
function member(g, id, req) { if (!id || !g.players[id] || roomTokens.get(g.code)?.get(req.headers['x-fleet-token']) !== id) throw Error('Join this fleet first'); }
function code() { const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let c;do{c=[...randomBytes(5)].map(n=>alphabet[n%alphabet.length]).join('');}while(rooms.has(c));return c; }
function mergeProfile(fresh, incoming, existing) {
  const p = { ...fresh, ...(existing || {}), id: fresh.id };
  const numberFields = ['xp','deaths','kills','missions','successes','escapes','survivedExplosions','closeCalls','soloMissions','soloKills'];
  for (const key of numberFields) p[key] = Math.max(0, Number(p[key]) || 0, Number(incoming[key]) || 0);
  for (const key of ['stationSeconds','stationSessions']) {
    p[key] = { ...fresh[key], ...(p[key] || {}) };
    for (const station of STATIONS) p[key][station] = Math.max(0, Number(p[key][station]) || 0, Number(incoming[key]?.[station]) || 0);
  }
  for (const [key, limit] of [['medals',20],['history',40],['battles',20],['crewmates',40]])
    p[key] = [...new Set([...(Array.isArray(incoming[key]) ? incoming[key] : []), ...(p[key] || [])].filter(x => typeof x === 'string').map(x => x.slice(0, 180)))].slice(0, limit);
  p.bestEscapeMs = [p.bestEscapeMs,incoming.bestEscapeMs].filter(x => x != null && Number.isFinite(Number(x)) && Number(x) >= 0).map(Number).reduce((a,b)=>Math.min(a,b),Infinity);
  if (!Number.isFinite(p.bestEscapeMs)) p.bestEscapeMs = null;
  if (incoming.pod && (!p.pod || Number(incoming.pod.launchedAt)>Number(p.pod.launchedAt))) p.pod = incoming.pod;
  p.name = String(incoming.name || p.name).slice(0,24); p.look = incoming.look || p.look;
  return p;
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' }); return res.end(); }
      if (url.pathname === '/api/health') return reply(res, 200, { ok: true, protocol: 2 });
      if (url.pathname === '/api/fleets') return reply(res, 200, { fleets: [...rooms].map(([code, g]) => ({ code, name: g.name, locked: g.locked, ships: g.ships.length, crew: Object.keys(g.players).length, protocol: 2 })) });
      if (url.pathname === '/api/docks') { const limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit'))||100));return reply(res, 200, { protocol: 2, docks: [...rooms].flatMap(([code,g])=>g.ships.map(s=>({code,fleet:g.name,shipId:s.id,ship:s.name,fleetLocked:g.locked,shipLocked:!!s.locked,crew:s.crew.length,capacity:8,protocol:2}))).slice(0,limit) }); }
      if (url.pathname === '/api/ships') { const g = room(url.searchParams.get('code')); if (g.locked && url.searchParams.get('pin') !== roomPins.get(g.code)) throw Error('Incorrect fleet lock code'); return reply(res, 200, { ships: g.ships.map(s => ({ id: s.id, name: s.name, locked: !!s.locked, crew: s.crew.length })) }); }
      if (url.pathname === '/api/create' && req.method === 'POST') { const b = await body(req), c = code(), pin = String(b.pin || '').trim(); if (pin && !/^\d{4,8}$/.test(pin)) throw Error('Lock code must be 4–8 digits'); const g = createGame(randomBytes(4).readUInt32LE()); g.code = c; g.name = String(b.name || 'New fleet').trim().slice(0, 28) || 'New fleet';g.ships[0].name=String(b.shipName||'Wayfarer').trim().slice(0,24)||'Wayfarer'; g.locked = !!pin; rooms.set(c, g); roomTokens.set(c, new Map()); if (pin) roomPins.set(c, pin); return reply(res, 200, { code: c, game: g }); }
      if (url.pathname === '/api/state') { const g = room(url.searchParams.get('code')); member(g, url.searchParams.get('playerId'), req); if (advanceGame(g)) await saveProfiles(g); return reply(res, 200, { game: g }); }
      if (url.pathname === '/api/device') { const g = room(url.searchParams.get('code')), id = url.searchParams.get('playerId'); member(g, id, req); if (advanceGame(g)) await saveProfiles(g); const ship = g.ships.find(s => s.id === url.searchParams.get('shipId')) || g.ships[0], p = g.players[id]; return reply(res, 200, { serverTime: Date.now(), seed:g.seed, ship, profile: { id: p.id, name: p.name, xp: p.xp, deaths: p.deaths, kills: p.kills, missions: p.missions, successes: p.successes, soloMissions: p.soloMissions || 0, soloKills: p.soloKills || 0, stationSeconds: p.stationSeconds, stationSessions: p.stationSessions, escapes: p.escapes || 0, survivedExplosions: p.survivedExplosions || 0, closeCalls: p.closeCalls || 0, bestEscapeMs: p.bestEscapeMs, pod: p.pod, look: p.look, medals: p.medals, history: (p.history || []).slice(0, 6), battles: (p.battles || []).slice(0, 4), crewmates: (p.crewmates || []).slice(0, 8) }, mission: g.activeMission, events: g.events.slice(0, 2), targets: sector(g.seed), effects: (g.effects || []).slice(0, 2) }); }
      if (req.method !== 'POST') return reply(res, 405, { error: 'POST required' });
      const b = await body(req), g = room(b.code);
      let joinToken;
      if (url.pathname === '/api/join') {
        if (!b.profile?.id) throw Error('Profile id required');
        const ip = req.socket.remoteAddress || 'unknown', attempt = failedPins.get(ip);
        if (g.locked && attempt?.until > Date.now() && attempt.count >= 5) throw Error('Too many lock attempts; try again in one minute');
        if (g.locked && String(b.pin || '') !== roomPins.get(String(b.code).toUpperCase())) {
          failedPins.set(ip, { count: (attempt?.until > Date.now() ? attempt.count : 0) + 1, until: Date.now() + 60000 });
          throw Error('Incorrect fleet lock code');
        }
        if (g.locked) failedPins.delete(ip);
        const destination = g.ships.find(s => s.id === (b.shipId || 'ship-1'));
        if (!destination) throw Error('Ship not found');
        if (destination.locked && String(b.shipPin || '') !== shipPins.get(`${g.code}:${destination.id}`)) throw Error('Incorrect ship lock code');
        const existing = g.players[b.profile.id] || savedProfiles.get(b.profile.id), fresh = createProfile(b.profile.name);
        fresh.id = String(b.profile.id).slice(0, 32);
        const p = mergeProfile(fresh, b.profile, existing);
        joinGame(g, p, b.shipId || 'ship-1');
        joinToken = randomBytes(18).toString('base64url'); roomTokens.get(g.code).set(joinToken, p.id);
      }
      else if (url.pathname === '/api/ship') { member(g, b.playerId, req); const pin = String(b.pin || '').trim(); if (pin && !/^\d{4,8}$/.test(pin)) throw Error('Ship lock code must be 4–8 digits'); const ship = addShip(g, b.name, !!pin); if (pin) shipPins.set(`${g.code}:${ship.id}`, pin); }
      else if (url.pathname === '/api/action') { member(g, b.playerId, req); act(g, b.playerId, b.shipId, b.station, b.action, b.targetId, {system:b.system}); }
      else if (url.pathname === '/api/escape') { member(g, b.playerId, req); escapePod(g, b.playerId, b.shipId); }
      else if (url.pathname === '/api/leave') { member(g, b.playerId, req); leaveGame(g, b.playerId); }
      else if (url.pathname === '/api/time') { member(g, b.playerId, req); creditTime(g, b.playerId, b.station, Number(b.seconds) || 0); }
      else if (url.pathname === '/api/profile') { member(g, b.profile?.id, req); const p = g.players[b.profile.id]; p.name = String(b.profile.name || p.name).slice(0, 24); p.look = b.profile.look || p.look; if (b.profile.stationSessions) for (const s of STATIONS) p.stationSessions[s] = Math.max(p.stationSessions[s], Number(b.profile.stationSessions[s]) || 0); }
      else return reply(res, 404, { error: 'Unknown endpoint' });
      await saveProfiles(g);
      return reply(res, 200, joinToken ? b.compact ? { token: joinToken } : { game: g, token: joinToken } : { game: g });
    }
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (pathname.split('/').some(part => part === '..' || part.startsWith('.'))) return reply(res, 404, { error: 'Not found' });
    const normalized = normalize(pathname).replace(/^\/+/, '');
    const characterImage = normalized.startsWith('characters/') && normalized.endsWith('.png');
    if (!rootAssets.has(normalized) && !characterPreviews.has(normalized) && !characterImage) return reply(res, 404, { error: 'Not found' });
    const file = join(root, normalized), content = await readFile(file);
    const headers = { 'content-type': mime[extname(file)] || 'application/octet-stream' };
    if (normalized === 'flash.html' || normalized.startsWith('web-flash/')) headers['cache-control'] = 'no-store';
    res.writeHead(200, headers); res.end(content);
  } catch (err) { reply(res, err.code === 'ENOENT' ? 404 : 400, { error: err.message }); }
});
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  server.listen(port, '0.0.0.0', () => console.log(`Pocket Fleet on http://localhost:${port}`));
}
