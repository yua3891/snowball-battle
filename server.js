const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const WORLD = { w: 3200, h: 2200 };
const TICK_MS = 16;               // ~60Hz simulation
const BROADCAST_MS = 33;          // ~30Hz snapshots
const PLAYER_SPEED = 255;
const PLAYER_R = 16;
const ATTACK_RANGE = 500;
const SNOWBALL_SPEED = 1450;
const SNOWBALL_DAMAGE = 20;
const ATTACK_CD = 40; // 只做极短防抖；正常连续点击基本按鼠标速度投掷
const IDLE_FREEZE_MS = 8000;
const OUT_OF_COMBAT_MS = 5000;
const THAW_MS = 700;
const BOT_RESPAWN_MS = 5000; // 仅机器人自动复活；真人玩家必须点击“立即复活”
const SPAWN_PROTECT_MS = 1800;
const GRID = 44;

const BOT_NAMES = ['雪球王','小企鹅','冰糖葫芦','雪地狐','冬冬','小雪怪','棉花糖','北风','雪橇手','白熊','雪团子','冰晶','雪国使者','糖雪球','疾风雪'];

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist2(a, b, c, d) { const x = a - c, y = b - d; return x * x + y * y; }
function pointSegDist2(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1;
  const wx = px - x1, wy = py - y1;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return dist2(px, py, x1, y1);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return dist2(px, py, x2, y2);
  const t = c1 / c2;
  return dist2(px, py, x1 + t * vx, y1 + t * vy);
}
function ellipseHit(px, py, o, r = 0) {
  const cos = Math.cos(-(o.rot || 0)), sin = Math.sin(-(o.rot || 0));
  const dx = px - o.x, dy = py - o.y;
  const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
  const rx = (o.rx || 1) + r, ry = (o.ry || 1) + r;
  return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
}

const mapSeed = Math.floor(Math.random() * 1e9);
let map = generateMap();
let pathfinder = buildPathfinder(map);
const players = {};
let projectiles = [];
const score = { blue: 0, red: 0 };
const feed = [];
const sockets = new Map();
const botTargets = { blue: 0, red: 0 };
let playerSeq = 1, ballSeq = 1, feedSeq = 1;

function generateMap() {
  const obstacles = [];
  const decorations = [];

  // 不阻挡移动的冰面、雪块、树、房子，主要用于画面还原
  for (let i = 0; i < 22; i++) decorations.push({ type: 'icePatch', x: rand(150, WORLD.w - 150), y: rand(150, WORLD.h - 150), rx: rand(70, 180), ry: rand(35, 95), rot: rand(-0.8, 0.8) });
  for (let i = 0; i < 20; i++) decorations.push({ type: 'rock', x: rand(80, WORLD.w - 80), y: rand(80, WORLD.h - 80), s: rand(0.8, 1.4) });
  for (let i = 0; i < 15; i++) decorations.push({ type: 'cabin', x: rand(140, WORLD.w - 140), y: rand(140, WORLD.h - 140), s: rand(0.88, 1.18) });
  for (let i = 0; i < 3; i++) decorations.push({ type: 'fort', x: rand(260, WORLD.w - 260), y: rand(220, WORLD.h - 220), s: rand(0.95, 1.15) });

  for (let c = 0; c < 22; c++) {
    const cx = rand(120, WORLD.w - 120), cy = rand(120, WORLD.h - 120);
    const n = Math.floor(rand(3, 8));
    for (let j = 0; j < n; j++) {
      decorations.push({ type: 'tree', x: clamp(cx + rand(-120, 120), 50, WORLD.w - 50), y: clamp(cy + rand(-100, 100), 50, WORLD.h - 50), s: rand(0.9, 1.28) });
    }
  }

  // 湖：阻挡移动
  for (let i = 0; i < 8; i++) {
    obstacles.push({ type: 'lake', x: rand(220, WORLD.w - 220), y: rand(220, WORLD.h - 220), rx: rand(70, 165), ry: rand(42, 110), rot: rand(-0.9, 0.9) });
  }

  // 栅栏：阻挡移动
  const dirs = [[1,0],[0,1],[.707,.707],[.707,-.707],[-.707,.707]];
  for (let g = 0; g < 14; g++) {
    let x = rand(90, WORLD.w - 700), y = rand(90, WORLD.h - 520);
    let dirIndex = Math.floor(rand(0, dirs.length));
    const pieces = Math.floor(rand(2, 6));
    for (let k = 0; k < pieces; k++) {
      if (Math.random() < 0.7) dirIndex = (dirIndex + (Math.random() < .5 ? 1 : dirs.length - 1)) % dirs.length;
      const [dx, dy] = dirs[dirIndex];
      const len = rand(140, 320);
      const x2 = clamp(x + dx * len, 60, WORLD.w - 60);
      const y2 = clamp(y + dy * len, 60, WORLD.h - 60);
      obstacles.push({ type: 'fence', x1: x, y1: y, x2, y2, width: 16 });
      x = x2; y = y2;
    }
  }

  return { seed: mapSeed, world: WORLD, obstacles, decorations };
}

function obstacleHit(x, y, r = PLAYER_R) {
  for (const o of map.obstacles) {
    if (o.type === 'fence') {
      const rr = (o.width || 16) * .5 + r;
      if (pointSegDist2(x, y, o.x1, o.y1, o.x2, o.y2) < rr * rr) return true;
    } else if (o.type === 'lake') {
      if (ellipseHit(x, y, o, r)) return true;
    }
  }
  return false;
}

function randomSpawn() {
  for (let i = 0; i < 320; i++) {
    const p = { x: rand(60, WORLD.w - 60), y: rand(60, WORLD.h - 60) };
    if (!obstacleHit(p.x, p.y, 26)) return p;
  }
  return { x: WORLD.w / 2, y: WORLD.h / 2 };
}

function buildPathfinder(curMap) {
  const gridW = Math.ceil(WORLD.w / GRID), gridH = Math.ceil(WORLD.h / GRID);
  const blockedGrid = new Uint8Array(gridW * gridH);
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const wx = clamp(gx * GRID + GRID / 2, PLAYER_R, WORLD.w - PLAYER_R);
      const wy = clamp(gy * GRID + GRID / 2, PLAYER_R, WORLD.h - PLAYER_R);
      if (obstacleHit(wx, wy, PLAYER_R + 4)) blockedGrid[gy * gridW + gx] = 1;
    }
  }
  function cellIndex(gx, gy) { return gy * gridW + gx; }
  function worldCell(x, y) { return { gx: clamp(Math.floor(x / GRID), 0, gridW - 1), gy: clamp(Math.floor(y / GRID), 0, gridH - 1) }; }
  function cellWorld(gx, gy) { return { x: clamp(gx * GRID + GRID / 2, PLAYER_R, WORLD.w - PLAYER_R), y: clamp(gy * GRID + GRID / 2, PLAYER_R, WORLD.h - PLAYER_R) }; }
  function nearestOpen(gx, gy) {
    if (!blockedGrid[cellIndex(gx, gy)]) return { gx, gy };
    for (let r = 1; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = gx + dx, ny = gy + dy;
        if (nx >= 0 && ny >= 0 && nx < gridW && ny < gridH && !blockedGrid[cellIndex(nx, ny)]) return { gx: nx, gy: ny };
      }
    }
    return { gx, gy };
  }
  class MinHeap {
    constructor(){ this.a=[]; }
    push(v,p){ const n={v,p}; this.a.push(n); let i=this.a.length-1; while(i){ const q=(i-1)>>1; if(this.a[q].p<=p) break; this.a[i]=this.a[q]; i=q; } this.a[i]=n; }
    pop(){ if(!this.a.length) return null; const root=this.a[0], last=this.a.pop(); if(this.a.length){ let i=0; while(true){ let l=i*2+1, r=l+1; if(l>=this.a.length) break; let c=(r<this.a.length&&this.a[r].p<this.a[l].p)?r:l; if(this.a[c].p>=last.p) break; this.a[i]=this.a[c]; i=c; } this.a[i]=last; } return root.v; }
    get size(){ return this.a.length; }
  }
  function findPath(sx, sy, tx, ty) {
    let s = worldCell(sx, sy), t = worldCell(tx, ty);
    s = nearestOpen(s.gx, s.gy); t = nearestOpen(t.gx, t.gy);
    const start = cellIndex(s.gx, s.gy), goal = cellIndex(t.gx, t.gy);
    if (start === goal) return [{ x: tx, y: ty }];
    const N = gridW * gridH;
    const gScore = new Float64Array(N); gScore.fill(Infinity); gScore[start] = 0;
    const came = new Int32Array(N); came.fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const h = (gx, gy) => Math.hypot(gx - t.gx, gy - t.gy);
    heap.push(start, h(s.gx, s.gy));
    const dirs = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414]];
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) { found = true; break; }
      const cx = cur % gridW, cy = Math.floor(cur / gridW);
      for (const [dx, dy, cost] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
        const ni = cellIndex(nx, ny);
        if (blockedGrid[ni] || closed[ni]) continue;
        if (dx && dy) {
          if (blockedGrid[cellIndex(cx + dx, cy)] || blockedGrid[cellIndex(cx, cy + dy)]) continue;
        }
        const ng = gScore[cur] + cost;
        if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; heap.push(ni, ng + h(nx, ny)); }
      }
    }
    if (!found) return [{ x: tx, y: ty }];
    const cells = []; let cur = goal;
    while (cur !== start && cur >= 0) { cells.push(cur); cur = came[cur]; }
    cells.reverse();
    const pts = []; let lastDx = null, lastDy = null;
    for (let i = 0; i < cells.length; i++) {
      const ci = cells[i], gx = ci % gridW, gy = Math.floor(ci / gridW);
      if (i < cells.length - 1) {
        const ni = cells[i+1], ngx = ni % gridW, ngy = Math.floor(ni / gridW);
        const dx = ngx - gx, dy = ngy - gy;
        if (lastDx === dx && lastDy === dy) continue;
        lastDx = dx; lastDy = dy;
      }
      pts.push(cellWorld(gx, gy));
    }
    if (!obstacleHit(tx, ty, PLAYER_R + 2)) pts.push({ x: tx, y: ty });
    return pts.slice(0, 48);
  }
  return { gridW, gridH, blockedGrid, findPath };
}

function teamCount(t) { return Object.values(players).filter(p => p.team === t).length; }
function botCount(t) { return Object.values(players).filter(p => p.team === t && p.bot).length; }
function livingPlayers() { return Object.keys(players).length; }
function makePlayer(team, name, bot = false) {
  const s = randomSpawn(), now = Date.now(), id = (bot ? 'b' : 'p') + (playerSeq++);
  return {
    id, name, team, bot,
    x: s.x, y: s.y, hp: 100, alive: true,
    kills: 0, deaths: 0, hits: 0,
    path: [], targetX: s.x, targetY: s.y,
    moving: false, facingX: 0, facingY: 1,
    lastMoveAction: now, lastAttackAction: now, lastDamageAt: 0, lastAttackAt: 0,
    throwAt: 0, killedById: null, killedByName: '', killedByTeam: null,
    frozen: false, thawUntil: 0, respawnAt: 0, protectedUntil: now + SPAWN_PROTECT_MS,
    botNextThink: now + rand(250, 900),
  };
}

function addFeed(text, team='neutral') { feed.push({ id: feedSeq++, text, team, at: Date.now() }); while (feed.length > 10) feed.shift(); }
function publicPlayers() {
  const out = {};
  for (const p of Object.values(players)) {
    out[p.id] = {
      id: p.id, name: p.name, team: p.team, bot: p.bot,
      x: p.x, y: p.y, hp: p.hp, alive: p.alive,
      kills: p.kills, deaths: p.deaths, hits: p.hits,
      moving: p.moving, facingX: p.facingX, facingY: p.facingY,
      frozen: p.frozen, thawUntil: p.thawUntil, respawnAt: p.respawnAt,
      protectedUntil: p.protectedUntil, throwAt: p.throwAt,
      killedById: p.killedById, killedByName: p.killedByName, killedByTeam: p.killedByTeam,
    };
  }
  return out;
}
function dynamicState() {
  return { players: publicPlayers(), projectiles, score, feed, config: { botTargets }, serverTime: Date.now() };
}

function removePlayer(id, reasonText=null) {
  const p = players[id];
  if (!p) return;
  if (reasonText) addFeed(reasonText, p.team);
  delete players[id];
}
function reconcileBots() {
  for (const team of ['blue','red']) {
    let bots = Object.values(players).filter(p => p.bot && p.team === team);
    while (bots.length > botTargets[team]) {
      const victim = bots.pop();
      removePlayer(victim.id, `${victim.name} 离开了${team==='blue'?'蓝':'红'}方机器人队列`);
    }
    bots = Object.values(players).filter(p => p.bot && p.team === team);
    while (bots.length < botTargets[team]) {
      const p = makePlayer(team, BOT_NAMES[(playerSeq + bots.length) % BOT_NAMES.length], true);
      players[p.id] = p;
      addFeed(`${p.name} 加入${team==='blue'?'蓝':'红'}方机器人`, team);
      bots.push(p);
    }
  }
}

function setDestination(p, x, y) {
  x = clamp(Number(x) || p.x, PLAYER_R, WORLD.w - PLAYER_R);
  y = clamp(Number(y) || p.y, PLAYER_R, WORLD.h - PLAYER_R);
  p.targetX = x; p.targetY = y;
  p.path = pathfinder.findPath(p.x, p.y, x, y);
}
function wakeIfFrozen(p) {
  const now = Date.now();
  if (p.frozen) {
    p.frozen = false;
    p.thawUntil = now + THAW_MS;
    p.lastMoveAction = now;
    p.lastAttackAction = now;
    addFeed(`${p.name} 从雪人状态醒来`, p.team);
  }
}
function damage(target, owner) {
  const now = Date.now();
  if (!target.alive || target.frozen || target.thawUntil > now || target.protectedUntil > now) return false;
  target.hp -= SNOWBALL_DAMAGE;
  target.lastDamageAt = now;
  owner.hits++;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.path = [];
    target.deaths++;
    target.respawnAt = target.bot ? now + BOT_RESPAWN_MS : 0;
    target.killedById = owner.id;
    target.killedByName = owner.name + (owner.bot ? ' [机]' : '');
    target.killedByTeam = owner.team;
    owner.kills++;
    score[owner.team]++;
    addFeed(`${owner.name} 用雪球击倒了 ${target.name}`, owner.team);
  }
  return true;
}
function respawn(p) {
  const s = randomSpawn(), now = Date.now();
  Object.assign(p, {
    x: s.x, y: s.y, targetX: s.x, targetY: s.y, path: [], hp: 100,
    alive: true, frozen: false, thawUntil: 0, respawnAt: 0,
    protectedUntil: now + SPAWN_PROTECT_MS, lastMoveAction: now,
    lastAttackAction: now, lastDamageAt: 0, moving: false,
    killedById: null, killedByName: '', killedByTeam: null
  });
}
function freezeCheck(p) {
  if (!p.alive || p.frozen || p.thawUntil > Date.now()) return;
  const now = Date.now();
  const idle = now - Math.max(p.lastMoveAction, p.lastAttackAction);
  const outCombat = now - p.lastDamageAt;
  if (idle >= IDLE_FREEZE_MS && outCombat >= OUT_OF_COMBAT_MS) {
    p.frozen = true;
    p.path = [];
    p.moving = false;
    addFeed(`${p.name} 冻成了雪人 ☃`, p.team);
  }
}
function movePlayer(p, dt) {
  p.moving = false;
  if (!p.alive || p.frozen || p.thawUntil > Date.now()) return;
  while (p.path.length) {
    const w = p.path[0], d = Math.hypot(w.x - p.x, w.y - p.y);
    if (d < 6) p.path.shift(); else break;
  }
  if (!p.path.length) return;
  const w = p.path[0], dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
  if (d < 1) return;
  const step = Math.min(d, PLAYER_SPEED * dt);
  const nx = p.x + dx / d * step, ny = p.y + dy / d * step;
  if (!obstacleHit(nx, ny)) {
    p.x = nx; p.y = ny; p.moving = true;
    p.facingX = dx / d; p.facingY = dy / d;
    p.lastMoveAction = Date.now();
  } else {
    p.path = pathfinder.findPath(p.x, p.y, p.targetX, p.targetY);
  }
}
function updateProjectiles(dt) {
  const kept = [];
  for (const s of projectiles) {
    const ox = s.x, oy = s.y;
    const speed = Math.hypot(s.vx, s.vy) || 1;
    const remaining = Math.max(0, s.max - s.travel);
    const step = Math.min(speed * dt, remaining);
    s.x += (s.vx / speed) * step; s.y += (s.vy / speed) * step;
    s.travel += step;
    let hit = false;
    for (const p of Object.values(players)) {
      if (p.team === s.team || p.id === s.ownerId || !p.alive || p.frozen) continue;
      if (dist2(p.x, p.y, s.x, s.y) < (PLAYER_R + 11) * (PLAYER_R + 11)) {
        const owner = players[s.ownerId];
        if (owner) damage(p, owner);
        hit = true; break;
      }
    }
    if (!hit && s.travel < s.max && s.x > -10 && s.y > -10 && s.x < WORLD.w + 10 && s.y < WORLD.h + 10) kept.push(s);
  }
  projectiles = kept;
}
function botThink(p) {
  const now = Date.now();
  if (!p.bot || !p.alive || p.frozen || p.thawUntil > now || now < p.botNextThink) return;
  p.botNextThink = now + rand(300, 680);
  const enemies = Object.values(players).filter(e => e.team !== p.team && e.alive && !e.frozen);
  let nearest = null, nd = Infinity;
  for (const e of enemies) {
    const d = dist2(p.x, p.y, e.x, e.y);
    if (d < nd) { nd = d; nearest = e; }
  }
  if (!nearest) {
    setDestination(p, rand(60, WORLD.w - 60), rand(60, WORLD.h - 60));
    return;
  }
  if (nd < ATTACK_RANGE * ATTACK_RANGE * .95) {
    onBotAttack(p, nearest.x, nearest.y);
    if (nd < 150 * 150) {
      const dx = p.x - nearest.x, dy = p.y - nearest.y, m = Math.hypot(dx, dy) || 1;
      setDestination(p, p.x + dx / m * rand(180, 300), p.y + dy / m * rand(180, 300));
    }
  } else {
    setDestination(p, nearest.x + rand(-90, 90), nearest.y + rand(-90, 90));
  }
}
function onBotAttack(p, x, y) {
  const now = Date.now();
  if (now - p.lastAttackAt < ATTACK_CD) return;
  let dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
  if (d < 5) return;
  const targetDistance = Math.min(d, ATTACK_RANGE);
  dx /= d; dy /= d;
  p.facingX = dx; p.facingY = dy; p.lastAttackAt = now; p.lastAttackAction = now; p.throwAt = now;
  projectiles.push({ id: 's' + ballSeq++, ownerId: p.id, team: p.team, x: p.x + dx * 22, y: p.y + dy * 22, vx: dx * SNOWBALL_SPEED, vy: dy * SNOWBALL_SPEED, travel: 0, max: Math.max(8, targetDistance - 22) });
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bat': 'text/plain; charset=utf-8'
  }[ext] || 'application/octet-stream');
}

const server = http.createServer((req, res) => {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, players: livingPlayers(), bots: botTargets, seed: mapSeed }));
  }
  const file = path.join(ROOT, path.normalize(pathname).replace(/^([.][.][/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); }
    else { res.writeHead(200, { 'content-type': mime(file), 'cache-control': 'no-store' }); res.end(data); }
  });
});

server.on('upgrade', (req, socket) => {
  if (req.url !== '/ws') return socket.destroy();
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sockets.set(socket, { playerId: null, buffer: Buffer.alloc(0) });
  sendWS(socket, { type: 'hello', map, state: dynamicState() });
  socket.on('data', chunk => handleSocketData(socket, chunk));
  socket.on('close', () => disconnect(socket));
  socket.on('error', () => disconnect(socket));
});

function disconnect(socket) {
  const meta = sockets.get(socket);
  if (meta?.playerId) {
    const p = players[meta.playerId];
    if (p) removePlayer(meta.playerId, `${p.name} 离开了雪地`);
  }
  sockets.delete(socket);
  try { socket.destroy(); } catch {}
}
function sendWS(socket, obj) {
  if (socket.destroyed) return;
  const payload = Buffer.from(JSON.stringify(obj));
  let head;
  if (payload.length < 126) { head = Buffer.from([0x81, payload.length]); }
  else if (payload.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(payload.length, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(payload.length), 2); }
  socket.write(Buffer.concat([head, payload]));
}
function handleSocketData(socket, chunk) {
  const meta = sockets.get(socket); if (!meta) return;
  meta.buffer = Buffer.concat([meta.buffer, chunk]);
  while (true) {
    const b = meta.buffer;
    if (b.length < 2) return;
    const opcode = b[0] & 0x0f, masked = !!(b[1] & 0x80);
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    const maskLen = masked ? 4 : 0;
    if (b.length < off + maskLen + len) return;
    if (opcode === 8) { disconnect(socket); return; }
    let payload = b.subarray(off + maskLen, off + maskLen + len);
    if (masked) {
      const mask = b.subarray(off, off + 4), out = Buffer.alloc(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4];
      payload = out;
    }
    meta.buffer = b.subarray(off + maskLen + len);
    if (opcode === 1) { try { onMessage(socket, JSON.parse(payload.toString('utf8'))); } catch {} }
  }
}
function onMessage(socket, m) {
  const meta = sockets.get(socket); if (!meta) return;
  if (m.type === 'join' && !meta.playerId) {
    const team = m.team === 'red' ? 'red' : 'blue';
    const p = makePlayer(team, '玩家' + String(playerSeq).padStart(2, '0'));
    players[p.id] = p; meta.playerId = p.id;
    addFeed(`${p.name} 加入${team === 'blue' ? '蓝方' : '红方'}`, team);
    sendWS(socket, { type: 'joined', id: p.id, team });
    return;
  }
  const p = players[meta.playerId];
  if (!p) return;
  if (m.type === 'move') {
    // 雪人状态下的第一次右键既负责解冻，也把目标点保存下来。
    // 解冻期间 movePlayer 暂停；解冻结束后会自动沿同一路径继续移动，无需用户再点第二次。
    wakeIfFrozen(p);
    if (!p.alive) return;
    setDestination(p, m.x, m.y);
    p.lastMoveAction = Date.now();
  }
  if (m.type === 'attack') {
    wakeIfFrozen(p); const now = Date.now();
    if (p.thawUntil > now || !p.alive || p.frozen || now - p.lastAttackAt < ATTACK_CD) return;
    let dx = (Number(m.x) || p.x) - p.x, dy = (Number(m.y) || p.y) - p.y, d = Math.hypot(dx, dy);
    if (d < 5) return;
    // 点到哪里就飞到哪里：近距离按点击距离收球，远距离最多 ATTACK_RANGE。
    const targetDistance = Math.min(d, ATTACK_RANGE);
    dx /= d; dy /= d;
    p.facingX = dx; p.facingY = dy; p.lastAttackAt = now; p.lastAttackAction = now; p.throwAt = now;
    projectiles.push({ id: 's' + ballSeq++, ownerId: p.id, team: p.team, x: p.x + dx * 22, y: p.y + dy * 22, vx: dx * SNOWBALL_SPEED, vy: dy * SNOWBALL_SPEED, travel: 0, max: Math.max(8, targetDistance - 22) });
  }
  if (m.type === 'respawnNow') {
    if (!p.alive) respawn(p);
  }
  if (m.type === 'setBots') {
    botTargets.blue = clamp(Math.floor(Number(m.blue) || 0), 0, 20);
    botTargets.red = clamp(Math.floor(Number(m.red) || 0), 0, 20);
    reconcileBots();
    addFeed(`机器人配置更新：蓝方 ${botTargets.blue} / 红方 ${botTargets.red}`, 'neutral');
  }
}

let last = Date.now(), broadcastAcc = 0;
setInterval(() => {
  const now = Date.now(), dt = Math.min(.06, (now - last) / 1000);
  last = now;
  for (const p of Object.values(players)) {
    if (p.bot && !p.alive && p.respawnAt && now >= p.respawnAt) respawn(p);
    botThink(p);
    movePlayer(p, dt);
    freezeCheck(p);
  }
  updateProjectiles(dt);
  broadcastAcc += TICK_MS;
  if (broadcastAcc >= BROADCAST_MS) {
    broadcastAcc = 0;
    const msg = { type: 'state', state: dynamicState() };
    for (const s of sockets.keys()) sendWS(s, msg);
  }
}, TICK_MS);

server.listen(PORT, '0.0.0.0', () => console.log(`Snow Battle V6.2 running: http://localhost:${PORT}`));
