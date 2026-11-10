import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, createProfile, joinGame, addShip, act, sector, mission, creditTime, unlocks, escapePod, advanceGame } from '../game.js';

test('sector and mission are reproducible from a seed', () => {
  assert.deepEqual(sector(42), sector(42));
  assert.deepEqual(mission(42, 1), mission(42, 1));
  assert.notDeepEqual(sector(42), sector(43));
});

test('crew can complete a supply run across ships and keep progression', () => {
  const g = createGame(42), p = createProfile('Ari'); joinGame(g, p);
  const second = addShip(g, 'Starlark'); joinGame(g, p, second.id);
  assert.deepEqual(g.ships[0].crew, []);
  assert.deepEqual(second.crew, [p.id]);
  act(g, p.id, second.id, 'communications', 'Request mission');
  // Move directly to the target to isolate completion rules from travel steps.
  const target = sector(g.seed).find(t => t.id === g.activeMission.targetId);
  second.x = target.x; second.y = target.y;
  const action = { 'supply run': ['helm', 'Dock'], convoy: ['helm', 'Dock'], diplomacy: ['communications', 'Negotiate'], survey: ['science', 'Scan target'], defense: ['helm', 'Dock'] }[g.activeMission.type];
  if (g.activeMission.type === 'defense') { act(g, p.id, second.id, ...action); act(g, p.id, second.id, 'weapons', 'Toggle power', undefined, {}, 1000); let time=7000; while (second.enemy > 0) {act(g, p.id, second.id, 'weapons', 'Fire torpedo', undefined, {}, time);time+=7100;} }
  else act(g, p.id, second.id, ...action);
  assert.equal(g.completed, 1);
  assert.equal(p.successes, 1);
  assert.ok(p.medals.includes('First voyage'));
  assert.ok(p.xp >= 80);
});

test('station time and restorations unlock visible rewards', () => {
  const g = createGame(5), p = createProfile('Jun'); joinGame(g, p);
  for (let i = 0; i < 5; i++) creditTime(g, p.id, 'science', 60);
  assert.ok(unlocks(p).includes('scanner visor'));
  p.deaths = 3; p.stationSeconds.captain = 300;
  assert.ok(unlocks(p).includes('lucky eyepatch'));
});

test('a ship target can be engaged and red alert reaches the crew state', () => {
  const g = createGame(42), p = createProfile('Rae'); joinGame(g, p);
  const target = sector(g.seed).find(t => t.kind === 'ship');
  assert.ok(target);
  act(g, p.id, 'ship-1', 'helm', 'Set course', target.id);
  assert.equal(g.ships[0].targetId, target.id);
  act(g, p.id, 'ship-1', 'captain', 'Red alert');
  assert.equal(g.ships[0].alert, 'red');
  assert.throws(() => act(g, p.id, 'ship-1', 'weapons', 'Fire pulse', target.id), /Power up/);
  act(g, p.id, 'ship-1', 'weapons', 'Toggle power', undefined, {}, 1000);
  assert.throws(() => act(g, p.id, 'ship-1', 'weapons', 'Fire pulse', target.id, {}, 1500), /charging/);
  act(g, p.id, 'ship-1', 'weapons', 'Fire pulse', target.id, {}, 3100);
  assert.equal(g.effects[0].kind, 'pulse');
  assert.equal(g.effects[0].targetId, target.id);
  assert.ok(g.ships[0].enemy > 0);
  act(g, p.id, 'ship-1', 'captain', 'Stand down');
  assert.equal(g.ships[0].alert, 'green');
  act(g, p.id, 'ship-1', 'weapons', 'Toggle power');
  assert.equal(g.ships[0].weaponsOnline, false);
});

test('a fleet can include a ship marked as locked', () => {
  const g = createGame(7);
  const ship = addShip(g, 'Privateer', true);
  assert.equal(ship.locked, true);
  assert.equal(g.ships[0].locked, false);
});

test('escape timing is recorded and faster escapes earn a larger bonus', () => {
  const g = createGame(9), fast = createProfile('Fast'), slow = createProfile('Slow');
  joinGame(g, fast); joinGame(g, slow);
  escapePod(g, slow.id, 'ship-1', 1000);
  escapePod(g, fast.id, 'ship-1', 9000);
  const ship = g.ships[0]; ship.enemy = 70; ship.shields = 0; ship.hull = 1; ship.lastCombatAt = 9000;
  advanceGame(g, 11000);
  assert.equal(fast.survivedExplosions, 1);
  assert.equal(slow.survivedExplosions, 1);
  assert.ok(fast.xp > slow.xp);
  assert.ok(fast.bestEscapeMs < slow.bestEscapeMs);
  assert.equal(fast.pod.status, 'survived');
});

test('helm target selection remains local until course commit, then thrust moves the ship', () => {
  const g=createGame(42),p=createProfile('Pilot');joinGame(g,p);const ship=g.ships[0],target=sector(g.seed)[1];
  assert.equal(ship.targetId,null);
  act(g,p.id,ship.id,'helm','Set course',target.id);
  assert.equal(ship.targetId,target.id);
  const start=[ship.x,ship.y];act(g,p.id,ship.id,'helm','Speed up');act(g,p.id,ship.id,'helm','Thrust');
  assert.notDeepEqual([ship.x,ship.y],start);assert.equal(ship.speed,2);
  act(g,p.id,ship.id,'helm','Turn left');assert.ok(ship.heading>=0&&ship.heading<360);
  const beforeUp=ship.y;act(g,p.id,ship.id,'helm','Move up');assert.ok(ship.y<beforeUp);
});

test('weapons warm up separately, cool down after firing, and alternate barrels', () => {
  const g=createGame(12),p=createProfile('Gunner');joinGame(g,p);const ship=g.ships[0];
  const helmTarget=sector(g.seed)[0],weaponTarget=sector(g.seed)[1];
  act(g,p.id,ship.id,'helm','Set course',helmTarget.id);
  act(g,p.id,ship.id,'weapons','Toggle power',undefined,{},1000);
  assert.throws(()=>act(g,p.id,ship.id,'weapons','Fire pulse',weaponTarget.id,{},2000),/charging/);
  act(g,p.id,ship.id,'weapons','Fire pulse',weaponTarget.id,{},3100);
  assert.equal(g.effects[0].barrel,0);
  assert.equal(ship.targetId,helmTarget.id);
  assert.throws(()=>act(g,p.id,ship.id,'weapons','Fire pulse',weaponTarget.id,{},4000),/charging/);
  assert.throws(()=>act(g,p.id,ship.id,'weapons','Fire torpedo',weaponTarget.id,{},5000),/charging/);
  act(g,p.id,ship.id,'weapons','Fire torpedo',weaponTarget.id,{},6100);
  assert.equal(g.effects[0].barrel,1);
});

test('engineering selects a system and its repair has a cooldown', () => {
  const g=createGame(14),p=createProfile('Fixer');joinGame(g,p);const ship=g.ships[0];ship.systems.weapons=40;
  act(g,p.id,ship.id,'engineering','Repair system',undefined,{system:'weapons'},1000);
  assert.equal(ship.systems.weapons,60);
  assert.throws(()=>act(g,p.id,ship.id,'engineering','Repair system',undefined,{system:'weapons'},2000),/cooling down/);
  act(g,p.id,ship.id,'engineering','Repair system',undefined,{system:'weapons'},9000);
  assert.equal(ship.systems.weapons,80);
});
