(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const joinPanel = document.getElementById('joinPanel');
  const hud = document.getElementById('hud');
  const deathOverlay = document.getElementById('deathOverlay');
  const toast = document.getElementById('toast');
  const statusEl = document.getElementById('connectionStatus');
  const els = {
    blueCount: q('blueCount'), redCount: q('redCount'),
    hudBlueCount: q('hudBlueCount'), hudRedCount: q('hudRedCount'),
    blueScore: q('blueScore'), redScore: q('redScore'),
    kills: q('kills'), deaths: q('deaths'), hits: q('hits'),
    stateText: q('stateText'),
    hpFill: q('hpFill'), hpText: q('hpText'),
    feed: q('battleFeed'), online: q('onlineCount'),
    botBlue: q('botBlue'), botRed: q('botRed'), deathTitle: q('deathTitle')
  };
  function q(id) { return document.getElementById(id); }

  const PLAYER_SPEED = 255;
  const PLAYER_R = 16;
  const GRID = 44;
  const CELL = 128;

  let dpr = 1, vw = innerWidth, vh = innerHeight;
  let ws, myId = null, team = null;
  let map = { world: { w: 3200, h: 2200 }, obstacles: [], decorations: [], seed: 0 };
  let state = { players: {}, projectiles: [], score: { blue: 0, red: 0 }, feed: [], config: { botTargets: { blue: 0, red: 0 } } };
  const visualPlayers = new Map();
  const visualBalls = new Map();
  const bursts = [];
  let localPath = [];
  let clickMark = null;
  let camera = { x: 0, y: 0, initialized: false };
  let mouse = { x: 0, y: 0 };
  let lastFrame = performance.now();
  let lastToastAt = 0;
  let configOpen = false;
  let gridCache = null;

  const images = { blue: null, red: null, fx: null, snowBlue: null, snowRed: null };
  let assetReady = false;
  Promise.all([
    loadImage('./assets/blue_norm.webp').then(img => images.blue = img),
    loadImage('./assets/red_norm.webp').then(img => images.red = img),
    loadImage('./assets/effects_sheet.webp').then(img => images.fx = img),
    loadImage('./assets/snowman_blue.webp').then(img => images.snowBlue = img),
    loadImage('./assets/snowman_red.webp').then(img => images.snowRed = img),
  ]).then(() => assetReady = true);

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    vw = innerWidth; vh = innerHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  addEventListener('resize', resize); resize();

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws`;
    try { ws = new WebSocket(url); } catch { statusEl.textContent = '无法连接服务器'; return; }
    ws.onopen = () => {
      statusEl.textContent = '雪地服务器已连接';
      document.querySelectorAll('.team-btn').forEach(b => b.disabled = false);
    };
    ws.onclose = () => {
      statusEl.textContent = '连接断开，正在重连…';
      document.querySelectorAll('.team-btn').forEach(b => b.disabled = true);
      setTimeout(connect, 1000);
    };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.type === 'hello') {
        map = m.map || map;
        gridCache = null;
        applyState(m.state, true);
      } else if (m.type === 'joined') {
        myId = m.id; team = m.team;
        joinPanel.classList.add('hidden');
        hud.classList.remove('hidden');
      } else if (m.type === 'state') {
        applyState(m.state, false);
      } else if (m.type === 'toast' && m.playerId === myId) {
        showToast(m.text);
      }
    };
  }
  document.querySelectorAll('.team-btn').forEach(b => b.disabled = true);
  connect();
  q('joinBlue').onclick = () => send({ type: 'join', team: 'blue' });
  q('joinRed').onclick = () => send({ type: 'join', team: 'red' });
  q('configToggle').onclick = () => {
    configOpen = !configOpen;
    q('configPanel').classList.toggle('hidden', !configOpen);
    if (configOpen && state.config?.botTargets) {
      els.botBlue.value = state.config.botTargets.blue;
      els.botRed.value = state.config.botTargets.red;
      setTimeout(() => els.botBlue.focus(), 0);
    }
  };
  // 配置面板打开时绝不被服务器状态覆盖，输入框可正常编辑。
  q('applyConfig').onclick = () => {
    const blue = clamp(Math.floor(Number(els.botBlue.value) || 0), 0, 20);
    const red = clamp(Math.floor(Number(els.botRed.value) || 0), 0, 20);
    els.botBlue.value = blue; els.botRed.value = red;
    send({ type: 'setBots', blue, red });
  };
  q('respawnNow').onclick = () => send({ type: 'respawnNow' });

  function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  function applyState(next, initial) {
    const oldPlayers = state.players || {};
    state = next || state;
    for (const p of Object.values(state.players || {})) {
      let v = visualPlayers.get(p.id);
      if (!v) {
        v = { x: p.x, y: p.y, serverX: p.x, serverY: p.y, bob: Math.random() * 10, lastThrowAt: 0, facingX: 0, facingY: 1, sampleAt: next.serverTime || Date.now(), netVx: 0, netVy: 0, renderMoving: false, localFacingUntil: 0 };
        visualPlayers.set(p.id, v);
      }
      const sampleAt = next.serverTime || Date.now();
      const sampleDt = Math.max(0, (sampleAt - (v.sampleAt || sampleAt)) / 1000);
      if (sampleDt > 0.008 && sampleDt < 0.25) {
        const rawVx = (p.x - v.serverX) / sampleDt, rawVy = (p.y - v.serverY) / sampleDt;
        v.netVx = v.netVx * 0.55 + rawVx * 0.45;
        v.netVy = v.netVy * 0.55 + rawVy * 0.45;
      }
      v.sampleAt = sampleAt;
      v.serverX = p.x; v.serverY = p.y;
      if (!(p.id === myId && Date.now() < (v.localFacingUntil || 0))) {
        v.facingX = p.facingX || v.facingX; v.facingY = p.facingY || v.facingY;
      }
      if (p.throwAt && (!oldPlayers[p.id] || p.throwAt !== oldPlayers[p.id].throwAt)) v.lastThrowAt = p.throwAt;
      const prev = oldPlayers[p.id];
      if (prev && p.hp < prev.hp && p.alive) bursts.push({ x: p.x, y: p.y, t: 0 });
    }
    for (const id of [...visualPlayers.keys()]) if (!state.players[id]) visualPlayers.delete(id);
    if (initial) {
      for (const [id, v] of visualPlayers) {
        const p = state.players[id];
        if (p) { v.x = p.x; v.y = p.y; }
      }
    }
    if (state.config?.botTargets && !configOpen) {
      els.botBlue.value = state.config.botTargets.blue;
      els.botRed.value = state.config.botTargets.red;
    }
    updateHUD();
  }

  // 只拦截浏览器原生右键菜单，不再拦截 pointerdown/mousedown。
  // 之前在捕获阶段对右键 pointerdown 调用 preventDefault，会让部分浏览器不再派发兼容 mouse 事件，
  // 从而误伤游戏自己的右键移动。这里改成：contextmenu 全局禁用，游戏输入事件正常透传。
  const blockContextMenu = e => { e.preventDefault(); return false; };
  for (const target of [window, document, document.documentElement, document.body, canvas, deathOverlay]) {
    target.addEventListener('contextmenu', blockContextMenu, { capture: true, passive: false });
  }
  window.oncontextmenu = document.oncontextmenu = document.body.oncontextmenu = () => false;

  // V6.3：鼠标改用浏览器原生 CSS cursor，不再把鼠标画进 Canvas。
  // 这样鼠标位置由系统合成器直接更新，不受游戏帧率、摄像机插值或 Canvas 重绘影响。
  function updateEnemyCursor(clientX, clientY) {
    mouse.x = clientX; mouse.y = clientY;
    if (!myId || !state.players?.[myId]) { canvas.classList.remove('enemy-hover'); return; }
    const me = state.players[myId];
    const wx = clientX + camera.x, wy = clientY + camera.y;
    let enemyHover = false;
    for (const p of Object.values(state.players || {})) {
      if (p.id === myId || p.team === me.team || !p.alive) continue;
      const v = visualPlayers.get(p.id);
      if (!v) continue;
      // 人物本体 + 昵称下方区域略放大，降低“明明指到人但没变色”的感觉。
      const dx = wx - v.x, dy = wy - (v.y - 6);
      if ((dx * dx) / (31 * 31) + (dy * dy) / (43 * 43) <= 1) { enemyHover = true; break; }
    }
    canvas.classList.toggle('enemy-hover', enemyHover);
  }
  canvas.addEventListener('pointermove', e => updateEnemyCursor(e.clientX, e.clientY), { passive: true });
  canvas.addEventListener('pointerleave', () => canvas.classList.remove('enemy-hover'));

  canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('pointerdown', e => {
    if (e.button === 2) e.preventDefault(); // 仅在游戏画布自身阻止默认动作，不阻断事件链
    if (!myId) return;
    const world = screenToWorld(e.clientX, e.clientY);
    const me = state.players?.[myId];
    if (!me || !me.alive) return;
    if (e.button === 2) {
      const v = visualPlayers.get(myId);
      if (v) localPath = findPathLocal(v.x, v.y, world.x, world.y);
      clickMark = { x: world.x, y: world.y, t: 0 };
      send({ type: 'move', x: world.x, y: world.y });
    }
    if (e.button === 0) {
      // 本地立即面向鼠标攻击方向，不等待下一帧服务器快照，避免投掷动作总像朝右。
      const v = visualPlayers.get(myId);
      if (v) {
        const dx = world.x - v.x, dy = world.y - v.y, d = Math.hypot(dx, dy);
        if (d > 1) { v.facingX = dx / d; v.facingY = dy / d; }
        v.localFacingUntil = Date.now() + 240;
        v.lastThrowAt = Date.now();
      }
      send({ type: 'attack', x: world.x, y: world.y });
    }
  }, { passive: false });

  function screenToWorld(x, y) { return { x: x + camera.x, y: y + camera.y }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pointSegDist2(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1, vy = y2 - y1, wx = px - x1, wy = py - y1, c1 = vx * wx + vy * wy;
    if (c1 <= 0) return (px - x1) ** 2 + (py - y1) ** 2;
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return (px - x2) ** 2 + (py - y2) ** 2;
    const t = c1 / c2, dx = px - (x1 + t * vx), dy = py - (y1 + t * vy);
    return dx * dx + dy * dy;
  }
  function ellipseHit(px, py, o, r = 0) {
    const cos = Math.cos(-(o.rot || 0)), sin = Math.sin(-(o.rot || 0));
    const dx = px - o.x, dy = py - o.y;
    const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
    const rx = (o.rx || 1) + r, ry = (o.ry || 1) + r;
    return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
  }
  function obstacleHit(x, y, r = PLAYER_R) {
    for (const o of map.obstacles || []) {
      if (o.type === 'fence') {
        const rr = (o.width || 16) * .5 + r;
        if (pointSegDist2(x, y, o.x1, o.y1, o.x2, o.y2) < rr * rr) return true;
      } else if (o.type === 'lake') {
        if (ellipseHit(x, y, o, r)) return true;
      }
    }
    return false;
  }

  function ensureGrid() {
    const gw = Math.ceil(map.world.w / GRID), gh = Math.ceil(map.world.h / GRID);
    if (gridCache && gridCache.seed === map.seed) return gridCache;
    const blocked = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const x = clamp(gx * GRID + GRID / 2, PLAYER_R, map.world.w - PLAYER_R);
        const y = clamp(gy * GRID + GRID / 2, PLAYER_R, map.world.h - PLAYER_R);
        if (obstacleHit(x, y, PLAYER_R + 4)) blocked[gy * gw + gx] = 1;
      }
    }
    return gridCache = { seed: map.seed, gw, gh, blocked };
  }
  class Heap {
    constructor() { this.a = []; }
    push(v, p) { const n = { v, p }; this.a.push(n); let i = this.a.length - 1; while (i) { const q = (i - 1) >> 1; if (this.a[q].p <= p) break; this.a[i] = this.a[q]; i = q; } this.a[i] = n; }
    pop() { if (!this.a.length) return null; const r = this.a[0], last = this.a.pop(); if (this.a.length) { let i = 0; while (true) { let l = i * 2 + 1, rr = l + 1; if (l >= this.a.length) break; let c = rr < this.a.length && this.a[rr].p < this.a[l].p ? rr : l; if (this.a[c].p >= last.p) break; this.a[i] = this.a[c]; i = c; } this.a[i] = last; } return r.v; }
    get size() { return this.a.length; }
  }
  function findPathLocal(sx, sy, tx, ty) {
    const { gw, gh, blocked } = ensureGrid();
    const idx = (x, y) => y * gw + x;
    const wc = (x, y) => ({ x: clamp(Math.floor(x / GRID), 0, gw - 1), y: clamp(Math.floor(y / GRID), 0, gh - 1) });
    const cw = (x, y) => ({ x: clamp(x * GRID + GRID / 2, PLAYER_R, map.world.w - PLAYER_R), y: clamp(y * GRID + GRID / 2, PLAYER_R, map.world.h - PLAYER_R) });
    function openCell(c) {
      if (!blocked[idx(c.x, c.y)]) return c;
      for (let r = 1; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = c.x + dx, y = c.y + dy;
        if (x >= 0 && y >= 0 && x < gw && y < gh && !blocked[idx(x, y)]) return { x, y };
      }
      return c;
    }
    let s = openCell(wc(sx, sy)), t = openCell(wc(tx, ty));
    const start = idx(s.x, s.y), goal = idx(t.x, t.y);
    if (start === goal) return [{ x: tx, y: ty }];
    const N = gw * gh, g = new Float64Array(N); g.fill(Infinity); g[start] = 0;
    const came = new Int32Array(N); came.fill(-1);
    const closed = new Uint8Array(N), heap = new Heap(), h = (x, y) => Math.hypot(x - t.x, y - t.y);
    const dirs = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414]];
    heap.push(start, h(s.x, s.y)); let found = false;
    while (heap.size) {
      const cur = heap.pop(); if (closed[cur]) continue; closed[cur] = 1; if (cur === goal) { found = true; break; }
      const cx = cur % gw, cy = Math.floor(cur / gw);
      for (const [dX, dY, cost] of dirs) {
        const nx = cx + dX, ny = cy + dY; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = idx(nx, ny); if (blocked[ni] || closed[ni]) continue;
        if (dX && dY && (blocked[idx(cx + dX, cy)] || blocked[idx(cx, cy + dY)])) continue;
        const ng = g[cur] + cost;
        if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; heap.push(ni, ng + h(nx, ny)); }
      }
    }
    if (!found) return [{ x: tx, y: ty }];
    const cells = []; let cur = goal;
    while (cur !== start && cur >= 0) { cells.push(cur); cur = came[cur]; }
    cells.reverse();
    const pts = []; let lastDX = null, lastDY = null;
    for (let i = 0; i < cells.length; i++) {
      const ci = cells[i], gx = ci % gw, gy = Math.floor(ci / gw);
      if (i < cells.length - 1) {
        const ni = cells[i + 1], ngx = ni % gw, ngy = Math.floor(ni / gw), dx = ngx - gx, dy = ngy - gy;
        if (lastDX === dx && lastDY === dy) continue;
        lastDX = dx; lastDY = dy;
      }
      pts.push(cw(gx, gy));
    }
    if (!obstacleHit(tx, ty, PLAYER_R + 2)) pts.push({ x: tx, y: ty });
    return pts.slice(0, 48);
  }

  function updateHUD() {
    const ps = Object.values(state.players || {}), bc = ps.filter(p => p.team === 'blue').length, rc = ps.filter(p => p.team === 'red').length;
    els.blueCount.textContent = bc;
    els.redCount.textContent = rc;
    els.hudBlueCount.textContent = bc;
    els.hudRedCount.textContent = rc;
    els.online.textContent = bc + rc;
    els.blueScore.textContent = state.score?.blue ?? 0;
    els.redScore.textContent = state.score?.red ?? 0;
    const me = state.players?.[myId];
    if (me) {
      els.kills.textContent = me.kills || 0;
      els.deaths.textContent = me.deaths || 0;
      els.hits.textContent = me.hits || 0;
      els.hpFill.style.height = (me.hp || 0) + '%';
      els.hpText.textContent = (me.hp || 0) + '%';
      if (!me.alive) {
        els.stateText.textContent = '等待复活';
        els.deathTitle.textContent = me.killedByName ? `被 ${me.killedByName} 的雪球击倒了` : '被雪球击倒了';
        deathOverlay.classList.remove('hidden');
        localPath = [];
      } else {
        deathOverlay.classList.add('hidden');
        els.stateText.textContent = me.frozen ? '☃ 雪人无敌' : (me.thawUntil > Date.now() ? '❄ 解冻中' : (me.protectedUntil > Date.now() ? '出生保护' : '战斗中'));
      }
    }
    const list = (state.feed || []).slice(-7);
    els.feed.innerHTML = list.map(f => `<div class="feed-line ${f.team || ''}">${escapeHtml(f.text)}</div>`).join('');
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  function showToast(text) { lastToastAt = Date.now(); toast.textContent = text; setTimeout(() => { if (Date.now() - lastToastAt > 1000) toast.textContent = ''; }, 1100); }

  function updateVisuals(dt) {
    const now = Date.now();
    for (const p of Object.values(state.players || {})) {
      let v = visualPlayers.get(p.id);
      if (!v) { v = { x: p.x, y: p.y, serverX: p.x, serverY: p.y, bob: 0, lastThrowAt: p.throwAt || 0, facingX: p.facingX || 0, facingY: p.facingY || 1, sampleAt: state.serverTime || Date.now(), netVx: 0, netVy: 0, renderMoving: false, localFacingUntil: 0 }; visualPlayers.set(p.id, v); }
      v.serverX = p.x; v.serverY = p.y;
      if ((p.facingX || p.facingY) && !(p.id === myId && Date.now() < (v.localFacingUntil || 0))) { v.facingX = p.facingX; v.facingY = p.facingY; }

      if (p.id === myId && p.alive && !p.frozen && p.thawUntil <= now) {
        while (localPath.length && Math.hypot(localPath[0].x - v.x, localPath[0].y - v.y) < 7) localPath.shift();
        if (localPath.length) {
          const w = localPath[0], dx = w.x - v.x, dy = w.y - v.y, d = Math.hypot(dx, dy);
          if (d > 0.001) {
            const step = Math.min(d, PLAYER_SPEED * dt), nx = v.x + dx / d * step, ny = v.y + dy / d * step;
            if (!obstacleHit(nx, ny)) { v.x = nx; v.y = ny; }
            else localPath = [];
          }
        }
        const err = Math.hypot(p.x - v.x, p.y - v.y);
        // 小误差缓慢吸附，避免频繁“拉扯”；只有明显不同步才快速纠正。
        if (err > 150) { v.x = p.x; v.y = p.y; localPath = []; }
        else if (err > 70) {
          const k = 1 - Math.exp(-dt * 10);
          v.x += (p.x - v.x) * k; v.y += (p.y - v.y) * k;
        } else if (err > 16) {
          const k = 1 - Math.exp(-dt * 2.6);
          v.x += (p.x - v.x) * k; v.y += (p.y - v.y) * k;
        }
        if (!p.moving && localPath.length === 0 && err > 2) {
          const k = 1 - Math.exp(-dt * 10);
          v.x += (p.x - v.x) * k; v.y += (p.y - v.y) * k;
        }
        v.renderMoving = localPath.length > 0 || p.moving;
      } else {
        // 其他玩家用“速度外推 + 插值”，减少 30Hz 网络快照带来的走走停停感。
        const age = Math.min(0.085, Math.max(0, (Date.now() - (v.sampleAt || Date.now())) / 1000));
        const targetX = v.serverX + (v.netVx || 0) * age;
        const targetY = v.serverY + (v.netVy || 0) * age;
        const k = 1 - Math.exp(-dt * 13.5);
        v.x += (targetX - v.x) * k; v.y += (targetY - v.y) * k;
        v.renderMoving = p.moving || Math.hypot(v.netVx || 0, v.netVy || 0) > 18;
      }
      v.bob += dt * (v.renderMoving ? 12 : 4);
    }

    const live = new Set();
    for (const s of state.projectiles || []) {
      const speed = Math.hypot(s.vx, s.vy) || 1;
      const lag = Math.max(0, (Date.now() - (state.serverTime || Date.now())) / 1000);
      const extra = Math.min(speed * lag, Math.max(0, (s.max ?? 500) - (s.travel ?? 0)));
      const targetX = s.x + (s.vx / speed) * extra;
      const targetY = s.y + (s.vy / speed) * extra;
      let b = visualBalls.get(s.id);
      if (!b) { b = { x: targetX, y: targetY, angle: Math.atan2(s.vy, s.vx), t: 0, trail: [], team: s.team }; visualBalls.set(s.id, b); }
      b.t += dt;
      b.team = s.team;
      b.angle = Math.atan2(s.vy, s.vx);
      // 根据服务器时间预测当前位置，再做小幅校正；视觉速度不再被快照频率拖慢。
      const k = 1 - Math.exp(-dt * 28);
      b.x += (targetX - b.x) * k; b.y += (targetY - b.y) * k;
      b.trail.push({ x: b.x, y: b.y, a: 1 });
      if (b.trail.length > 9) b.trail.shift();
      live.add(s.id);
    }
    for (const id of [...visualBalls.keys()]) {
      const b = visualBalls.get(id);
      if (!live.has(id)) {
        bursts.push({ x: b.x, y: b.y, t: 0, type: 'impact', team: b.team });
        visualBalls.delete(id);
      }
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      bursts[i].t += dt;
      if (bursts[i].t > 0.45) bursts.splice(i, 1);
    }
    if (clickMark) {
      clickMark.t += dt;
      if (clickMark.t > 0.55) clickMark = null;
    }
  }

  function rectForChar(col, row) {
    return { x: col * CELL, y: row * CELL, w: CELL, h: CELL };
  }
  // 原始精灵表有 7 行：上、右上、右、右下、下、左下、左。
  // 左上使用“右上行水平镜像”，补齐完整 8 方向。
  function directionFrame(dx, dy) {
    if (dy < -0.42) {
      if (dx > 0.32) return { row: 1, flipX: false };
      if (dx < -0.32) return { row: 1, flipX: true };
      return { row: 0, flipX: false };
    }
    if (dy > 0.42) {
      if (dx > 0.32) return { row: 3, flipX: false };
      if (dx < -0.32) return { row: 5, flipX: false };
      return { row: 4, flipX: false };
    }
    if (dx < 0) return { row: 6, flipX: false };
    return { row: 2, flipX: false };
  }
  function drawSprite(img, srect, x, y, dw, dh, opts = {}) {
    ctx.save();
    ctx.translate(x, y);
    if (opts.rotate) ctx.rotate(opts.rotate);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.flipX) ctx.scale(-1, 1);
    ctx.drawImage(img, srect.x, srect.y, srect.w, srect.h, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  function drawCharacter(p, v) {
    const now = Date.now();
    const img = p.team === 'blue' ? images.blue : images.red;
    const sx = v.x - camera.x, sy = v.y - camera.y;
    const dir = directionFrame(v.facingX || 0, v.facingY || 1);
    const row = dir.row;
    let col = 0;
    if (!p.alive) col = 7;
    else if (p.frozen) col = -1;
    // col4 是方向正确、尺寸稳定的投掷预备/出手姿势；col5 自带向右的烘焙雪球拖尾且人物高度较小，因此不再用于人物本体。
    else if ((v.lastThrowAt || 0) + 190 > now) col = 4;
    // 角色表只有 3 个跑步帧：1/2/3。之前误把 col4 投掷帧混入跑步循环，会造成动作突变。
    else if (v.renderMoving) col = 1 + (Math.floor(now / 90) % 3);
    else col = 0;

    if (p.frozen && assetReady) {
      drawSnowman(p.team, sx, sy);
    } else if (assetReady) {
      const r = rectForChar(col, row);
      drawSprite(img, r, sx, sy - 10 + Math.sin(v.bob) * (v.renderMoving ? 1.1 : 0.35), 70, 88, { alpha: p.protectedUntil > now ? 0.78 : 1, flipX: dir.flipX });
    } else {
      ctx.fillStyle = p.team === 'blue' ? '#3b8fd8' : '#d84d54';
      ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.fill();
    }
    if (p.thawUntil > now && !p.frozen) {
      ctx.strokeStyle = 'rgba(120,220,255,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 23, 0, Math.PI * 2); ctx.stroke();
    }
    if (p.protectedUntil > now && p.alive) {
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 25, 0, Math.PI * 2); ctx.stroke();
    }
    drawNameAndHp(p, sx, sy);
  }
  function drawSnowman(team, sx, sy) {
    if (!assetReady) return;
    // 蓝/红各自使用固定尺寸素材；不再按朝向换大小，避免雪人忽大忽小。
    const img = team === 'red' ? images.snowRed : images.snowBlue;
    drawSprite(img, { x: 0, y: 0, w: 128, h: 128 }, sx, sy - 9, 68, 68, {});
  }
  function drawNameAndHp(p, sx, sy) {
    const top = sy - 48;
    ctx.font = '12px Microsoft YaHei';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1f1f1f';
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 3;
    const name = p.name + (p.bot ? ' [机]' : '');
    ctx.strokeText(name, sx, top - 9);
    ctx.fillStyle = p.team === 'blue' ? '#206eaa' : '#a33c3c';
    ctx.fillText(name, sx, top - 9);
    ctx.fillStyle = 'rgba(29,34,40,.55)'; ctx.fillRect(sx - 24, top, 48, 6);
    ctx.fillStyle = p.team === 'blue' ? '#64c4ff' : '#ff7575'; ctx.fillRect(sx - 24, top, 48 * Math.max(0, p.hp) / 100, 6);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.strokeRect(sx - 24, top, 48, 6);
  }
  function drawProjectile(b) {
    const sx = b.x - camera.x, sy = b.y - camera.y;
    const isRed = b.team === 'red';
    const edge = isRed ? '#d94d55' : '#4aa9df';
    const trailRgb = isRed ? '231,88,92' : '84,184,234';
    for (let i = 0; i < b.trail.length; i++) {
      const t = b.trail[i], alpha = (i + 1) / b.trail.length * 0.38;
      ctx.fillStyle = `rgba(${trailRgb},${alpha})`;
      ctx.beginPath(); ctx.arc(t.x - camera.x, t.y - camera.y, 3.3 + i * 0.28, 0, Math.PI * 2); ctx.fill();
    }
    // 高速方向线，让雪球即使在雪地背景上也清楚可见。
    const ux = Math.cos(b.angle), uy = Math.sin(b.angle);
    ctx.strokeStyle = `rgba(${trailRgb},.48)`; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx - ux * 28, sy - uy * 28); ctx.lineTo(sx - ux * 7, sy - uy * 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(sx - ux * 24, sy - uy * 24); ctx.lineTo(sx - ux * 8, sy - uy * 8); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(sx, sy, 8.8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath(); ctx.arc(sx - 2.5, sy - 2.5, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  function drawImpact(burst) {
    const p = burst.t / 0.45;
    const sx = burst.x - camera.x, sy = burst.y - camera.y;
    const r = 14 + p * 26;
    ctx.fillStyle = `rgba(255,255,255,${1 - p})`;
    ctx.beginPath(); ctx.arc(sx, sy, r * 0.55, 0, Math.PI * 2); ctx.fill();
    const impactRgb = burst.team === 'red' ? '235,120,124' : (burst.team === 'blue' ? '167,229,255' : '214,230,238');
    ctx.strokeStyle = `rgba(${impactRgb},${1 - p})`; ctx.lineWidth = 3 * (1 - p);
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
  }

  function drawWorld() {
    // base snow
    ctx.fillStyle = '#eff8fc'; ctx.fillRect(0, 0, vw, vh);
    const ox = -camera.x * 0.15 % 70, oy = -camera.y * 0.15 % 70;
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    for (let y = oy; y < vh + 70; y += 70) for (let x = ox; x < vw + 70; x += 70) { ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill(); }

    for (const d of map.decorations || []) drawDecoration(d);
    for (const o of map.obstacles || []) drawObstacle(o);

    if (clickMark && assetReady) {
      const p = 1 - clickMark.t / 0.55;
      const sx = clickMark.x - camera.x, sy = clickMark.y - camera.y;
      ctx.save(); ctx.globalAlpha = Math.max(0, p);
      drawSprite(images.fx, { x: 53, y: 933, w: 149, h: 101 }, sx, sy, 34 + (1 - p) * 14, 24 + (1 - p) * 10, {});
      ctx.restore();
    }
  }
  function drawDecoration(d) {
    const x = d.x - camera.x, y = d.y - camera.y;
    if (x < -220 || y < -220 || x > vw + 220 || y > vh + 220) return;
    if (d.type === 'icePatch') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.rot || 0);
      ctx.fillStyle = 'rgba(175,228,255,.45)'; ellipse(0, 0, d.rx, d.ry); ctx.fill();
      ctx.fillStyle = 'rgba(222,246,255,.45)'; ellipse(-8, -4, d.rx * .72, d.ry * .55); ctx.fill();
      ctx.restore();
    } else if (d.type === 'rock') {
      ctx.fillStyle = '#8f9aa5'; ctx.beginPath(); ctx.arc(x, y, 10 * d.s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dfe9ef'; ctx.beginPath(); ctx.arc(x - 2, y - 3, 6 * d.s, 0, Math.PI * 2); ctx.fill();
    } else if (d.type === 'tree') {
      ctx.fillStyle = 'rgba(55,86,75,.12)'; ellipse(x, y + 18, 26 * d.s, 10 * d.s); ctx.fill();
      ctx.fillStyle = '#3d735f'; triangle(x, y - 10 * d.s, 30 * d.s, 40 * d.s);
      ctx.fillStyle = '#4a8b72'; triangle(x, y - 24 * d.s, 23 * d.s, 32 * d.s);
      ctx.fillStyle = '#f2f8fb'; ellipse(x, y - 6 * d.s, 20 * d.s, 7 * d.s); ctx.fill();
      ellipse(x, y - 21 * d.s, 15 * d.s, 6 * d.s); ctx.fill();
      ctx.fillStyle = '#7b5a3d'; ctx.fillRect(x - 4 * d.s, y + 6 * d.s, 8 * d.s, 18 * d.s);
    } else if (d.type === 'cabin') {
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ellipse(x, y + 34 * d.s, 44 * d.s, 12 * d.s); ctx.fill();
      ctx.fillStyle = '#8f6641'; ctx.fillRect(x - 24 * d.s, y - 6 * d.s, 48 * d.s, 34 * d.s);
      ctx.fillStyle = '#6d4b2e'; ctx.beginPath(); ctx.moveTo(x - 30 * d.s, y - 6 * d.s); ctx.lineTo(x, y - 30 * d.s); ctx.lineTo(x + 30 * d.s, y - 6 * d.s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fbfcff'; ctx.fillRect(x - 20 * d.s, y - 10 * d.s, 40 * d.s, 8 * d.s);
      ctx.fillStyle = '#5a4128'; ctx.fillRect(x - 7 * d.s, y + 6 * d.s, 14 * d.s, 22 * d.s);
    } else if (d.type === 'fort') {
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ellipse(x, y + 42 * d.s, 80 * d.s, 16 * d.s); ctx.fill();
      ctx.fillStyle = '#9ba8b6'; ctx.fillRect(x - 40 * d.s, y - 20 * d.s, 80 * d.s, 55 * d.s);
      ctx.fillStyle = '#8a96a3'; ctx.fillRect(x - 58 * d.s, y - 5 * d.s, 18 * d.s, 40 * d.s); ctx.fillRect(x + 40 * d.s, y - 5 * d.s, 18 * d.s, 40 * d.s);
      ctx.fillStyle = '#dde7ee'; ctx.fillRect(x - 62 * d.s, y - 12 * d.s, 102 * d.s, 8 * d.s);
      ctx.fillStyle = '#6a7988'; ctx.fillRect(x - 10 * d.s, y + 6 * d.s, 20 * d.s, 29 * d.s);
    }
  }
  function drawObstacle(o) {
    if (o.type === 'fence') {
      const x1 = o.x1 - camera.x, y1 = o.y1 - camera.y, x2 = o.x2 - camera.x, y2 = o.y2 - camera.y;
      ctx.strokeStyle = '#764826'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = '#b58453'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.floor(len / 30));
      const dx = (x2 - x1) / len, dy = (y2 - y1) / len, px = -dy, py = dx;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
        ctx.strokeStyle = '#6c4322'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - px * 8, y - py * 8); ctx.lineTo(x + px * 8, y + py * 8); ctx.stroke();
      }
    } else if (o.type === 'lake') {
      const x = o.x - camera.x, y = o.y - camera.y;
      ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0);
      ctx.fillStyle = '#99e3ff'; ellipse(0, 0, o.rx, o.ry); ctx.fill();
      ctx.fillStyle = '#c8f3ff'; ellipse(-8, -6, o.rx * .72, o.ry * .55); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7; ellipse(0, 0, o.rx + 8, o.ry + 8); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ellipse(-6, -4, o.rx * .55, o.ry * .36); ctx.stroke();
      ctx.restore();
    }
  }
  function triangle(x, y, w, h) {
    ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x - w / 2, y + h / 2); ctx.lineTo(x + w / 2, y + h / 2); ctx.closePath(); ctx.fill();
  }
  function ellipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }

  function updateCamera(dt) {
    const me = state.players?.[myId];
    const vMe = me ? visualPlayers.get(myId) : null;
    if (!vMe) return;
    const maxX = Math.max(0, map.world.w - vw), maxY = Math.max(0, map.world.h - vh);
    const targetX = clamp(vMe.x - vw / 2, 0, maxX);
    const targetY = clamp(vMe.y - vh / 2, 0, maxY);
    const gap = Math.hypot(targetX - camera.x, targetY - camera.y);
    if (!camera.initialized || gap > 520) {
      camera.x = targetX; camera.y = targetY; camera.initialized = true;
      return;
    }
    // 摄像机使用独立阻尼，不再与人物服务器纠偏一帧一帧硬绑定。
    const k = 1 - Math.exp(-dt * 9.5);
    camera.x += (targetX - camera.x) * k;
    camera.y += (targetY - camera.y) * k;
  }

  function render() {
    ctx.clearRect(0, 0, vw, vh);
    drawWorld();

    const renderPlayers = Object.values(state.players || []).map(p => ({ p, v: visualPlayers.get(p.id) })).filter(it => it.v);
    renderPlayers.sort((a, b) => a.v.y - b.v.y);
    for (const b of visualBalls.values()) drawProjectile(b);
    for (const it of renderPlayers) drawCharacter(it.p, it.v);
    for (const b of bursts) drawImpact(b);
  }

  function tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    updateVisuals(dt);
    updateCamera(dt);
    render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
