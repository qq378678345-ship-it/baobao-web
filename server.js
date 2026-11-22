'use strict';
/**
 * 宝宝 · 朋友间四张牌 —— 网页版服务端
 * 零依赖，只用 Node 内置模块。房间状态保存在内存里，重启即清空。
 * 启动：node server.js  默认端口 8848
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8848);
const ROOT = path.join(__dirname, 'public');
const MAX_PLAYERS = 13;
const IDLE_MS = 20 * 60 * 1000; // 房间闲置 20 分钟回收

const rooms = new Map();
const sessions = new Map(); // token -> {code, playerId}

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ---------- 小工具 ----------
const rnd = (n) => crypto.randomInt(n);
const uid = () => crypto.randomBytes(9).toString('base64url');
const token = () => crypto.randomBytes(16).toString('base64url');

function roomCode() {
  const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i += 1) s += cs[rnd(cs.length)];
  return s;
}

function newDeck(jokers) {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  if (jokers) {
    d.push({ r: '王', s: '★', joker: 1 });
    d.push({ r: '王', s: '★', joker: 2 });
  }
  return d;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = rnd(i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// ---------- 房间 ----------
function makeRoom(code) {
  const room = {
    code,
    ownerId: null,
    dealerId: null,
    jokers: false,
    seq: 0,
    touched: Date.now(),
    players: [],
  };
  rooms.set(code, room);
  return room;
}

function addPlayer(room, name, avatar) {
  const p = {
    id: uid(),
    name: String(name || '玩家').slice(0, 12),
    avatar: String(avatar || '🀄').slice(0, 4),
    online: true,
    lastSeen: Date.now(),
    paused: false,
    hand: null,
    dealtSeq: 0,
  };
  room.players.push(p);
  if (!room.ownerId) room.ownerId = p.id;
  return p;
}

function find(room, pid) {
  return room.players.find((p) => p.id === pid) || null;
}

function deal(room) {
  if (!room.players.length) throw new Error('房间里还没有人');
  const deck = shuffle(newDeck(room.jokers));
  room.players.forEach((p, i) => {
    p.hand = deck.slice(i * 4, i * 4 + 4);
    p.dealtSeq = room.seq + 1;
  });
  room.seq += 1;
}

function publicView(room, me) {
  const dealer = find(room, room.dealerId);
  const now = Date.now();
  return {
    code: room.code,
    ownerId: room.ownerId,
    dealerId: room.dealerId,
    dealerName: dealer ? dealer.name : '',
    jokers: room.jokers,
    seq: room.seq,
    maxPlayers: MAX_PLAYERS,
    count: room.players.length,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isOwner: p.id === room.ownerId,
      isDealer: p.id === room.dealerId,
      isMe: p.id === me.id,
      online: now - p.lastSeen < 15000,
      paused: p.paused,
      hasCards: Array.isArray(p.hand),
    })),
    you: {
      id: me.id,
      name: me.name,
      hand: me.hand,
      dealtSeq: me.dealtSeq,
      isOwner: me.id === room.ownerId,
      isDealer: me.id === room.dealerId,
    },
  };
}

// ---------- 业务处理 ----------
function ctx(tokenStr) {
  const s = sessions.get(tokenStr);
  if (!s) throw new Error('登录状态失效，请重新进入房间');
  const room = rooms.get(s.code);
  if (!room) throw new Error('房间已关闭');
  const me = find(room, s.playerId);
  if (!me) throw new Error('你已不在该房间');
  me.lastSeen = Date.now();
  room.touched = Date.now();
  return { room, me };
}

const api = {
  create({ name, avatar }) {
    let code = roomCode();
    while (rooms.has(code)) code = roomCode();
    const room = makeRoom(code);
    const me = addPlayer(room, name, avatar);
    const tk = token();
    sessions.set(tk, { code, playerId: me.id });
    return { token: tk, room: publicView(room, me) };
  },

  join({ code, name, avatar }) {
    const key = String(code || '').trim().toUpperCase();
    const room = rooms.get(key);
    if (!room) throw new Error('房间号不存在');
    if (room.players.length >= MAX_PLAYERS) throw new Error('房间已满');
    const me = addPlayer(room, name, avatar);
    const tk = token();
    sessions.set(tk, { code: key, playerId: me.id });
    return { token: tk, room: publicView(room, me) };
  },

  pull({ token: tk }) {
    const { room, me } = ctx(tk);
    return { room: publicView(room, me) };
  },

  deal({ token: tk }) {
    const { room, me } = ctx(tk);
    if (me.id !== room.ownerId && me.id !== room.dealerId) throw new Error('只有房主或庄家能发牌');
    deal(room);
    return { room: publicView(room, me) };
  },

  act({ token: tk, action }) {
    const { room, me } = ctx(tk);
    if (action === 'pause') me.paused = true;
    else if (action === 'resume') me.paused = false;
    else if (action === 'heartbeat') { /* lastSeen 已更新 */ }
    return { room: publicView(room, me) };
  },

  admin({ token: tk, action, value }) {
    const { room, me } = ctx(tk);
    if (me.id !== room.ownerId) throw new Error('只有房主可以操作');

    if (action === 'set_dealer') {
      room.dealerId = value && find(room, value) ? value : room.players[rnd(room.players.length)].id;
    } else if (action === 'transfer') {
      const t = find(room, value);
      if (!t) throw new Error('目标玩家不在房间');
      room.ownerId = t.id;
    } else if (action === 'kick') {
      const t = find(room, value);
      if (t && t.id !== room.ownerId) {
        for (const [k, v] of sessions) if (v.playerId === t.id) sessions.delete(k);
        room.players = room.players.filter((p) => p.id !== t.id);
        if (room.dealerId === t.id) room.dealerId = null;
      }
    } else if (action === 'toggle_jokers') {
      room.jokers = !room.jokers;
    } else if (action === 'clear') {
      room.players.forEach((p) => { p.hand = null; p.paused = false; });
      room.dealerId = null;
    }
    return { room: publicView(room, me) };
  },

  leave({ token: tk }) {
    const { room, me } = ctx(tk);
    room.players = room.players.filter((p) => p.id !== me.id);
    for (const [k, v] of sessions) if (v.playerId === me.id) sessions.delete(k);
    if (room.ownerId === me.id) room.ownerId = room.players[0] ? room.players[0].id : null;
    if (room.dealerId === me.id) room.dealerId = null;
    if (!room.players.length) rooms.delete(room.code);
    return { ok: true };
  },
};

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Cache-Control': 'no-store' }, headers || {}));
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) { reject(new Error('请求体过大')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('请求格式错误')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) return send(res, 403, '403');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, '页面不存在');
    send(res, 200, buf, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/healthz' || url === '/ping') return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' });
  if (url.startsWith('/api/')) {
    const name = url.slice(5);
    const fn = api[name];
    if (!fn) return send(res, 404, JSON.stringify({ ok: false, error: '接口不存在' }), { 'Content-Type': MIME['.json'] });
    if (req.method !== 'POST') return send(res, 405, JSON.stringify({ ok: false, error: '只接受 POST' }), { 'Content-Type': MIME['.json'] });
    try {
      const body = await readBody(req);
      const data = fn(body);
      send(res, 200, JSON.stringify({ ok: true, data }), { 'Content-Type': MIME['.json'] });
    } catch (e) {
      send(res, 200, JSON.stringify({ ok: false, error: e.message || '操作失败' }), { 'Content-Type': MIME['.json'] });
    }
    return;
  }
  if (req.method !== 'GET') return send(res, 405, '405');
  serveStatic(req, res);
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.touched > IDLE_MS) rooms.delete(code);
}, 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  Object.keys(nets).forEach((k) => nets[k].forEach((n) => {
    if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  }));
  console.log('');
  console.log('  宝宝 · 朋友间四张牌（网页版）已启动');
  console.log('  本机访问:   http://localhost:' + PORT);
  ips.forEach((ip) => console.log('  手机访问:   http://' + ip + ':' + PORT + '   （需同一 WiFi）'));
  console.log('  停止服务:   Ctrl + C');
  console.log('');
});
