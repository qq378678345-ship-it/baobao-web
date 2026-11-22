'use strict';
/* 宝宝 · 朋友间四张牌 —— 网页版前端 */
(function () {
  const $ = (id) => document.getElementById(id);
  const NICKS = ['阿明', '阿强', '阿华', '小鱼', '小鱼儿', '老李', '老王', '大眼', '阿杰', '阿辉', '阿梅', '阿珍', '小陈', '阿伟', '老张', '阿龙', '阿彬', '阿海', '小玉', '阿文', '阿良', '阿峰'];
  const AVATARS = ['🀄', '🃏', '🎴', '🐟', '🐠', '🐡', '🍀', '🎲', '♠️', '♥️', '♣️', '♦️', '🎯', '🧿'];

  const state = {
    token: localStorage.getItem('bby_token') || '',
    room: null,
    order: [0, 1, 2, 3],
    flip: {},
    dealtSeq: -1,
    timer: null,
    busy: false,
  };

  // ---------- 基础 ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function api(name, payload) {
    const body = Object.assign({ token: state.token }, payload || {});
    const res = await fetch('/api/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({ ok: false, error: '网络异常' }));
    if (!j.ok) throw new Error(j.error || '操作失败');
    return j.data;
  }

  // ---------- 首页 ----------
  function randomNick() {
    return NICKS[Math.floor(Math.random() * NICKS.length)] + String(Math.floor(Math.random() * 89) + 10);
  }

  function initHome() {
    const savedNick = localStorage.getItem('bby_name');
    $('nick').value = savedNick || randomNick();
    const qs = new URLSearchParams(location.search);
    const c = (qs.get('room') || '').toUpperCase();
    if (c) $('codeInput').value = c.slice(0, 5);
  }

  function currentName() {
    const v = $('nick').value.trim();
    if (!v) { toast('先填个名字'); return null; }
    localStorage.setItem('bby_name', v);
    return v;
  }

  async function doCreate() {
    const name = currentName();
    if (!name) return;
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    try {
      const d = await api('create', { name, avatar });
      enterRoom(d);
    } catch (e) { toast(e.message); }
  }

  async function doJoin() {
    const name = currentName();
    if (!name) return;
    const code = $('codeInput').value.trim().toUpperCase();
    if (code.length !== 5) { toast('房号是 5 位'); return; }
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    try {
      const d = await api('join', { code, name, avatar });
      enterRoom(d);
    } catch (e) { toast(e.message); }
  }

  function enterRoom(data) {
    state.token = data.token;
    state.room = data.room;
    localStorage.setItem('bby_token', state.token);
    localStorage.setItem('bby_code', data.room.code);
    $('home').classList.add('hidden');
    $('room').classList.remove('hidden');
    history.replaceState(null, '', '?room=' + data.room.code);
    render();
    startPoll();
  }

  function backHome() {
    stopPoll();
    state.token = '';
    state.room = null;
    localStorage.removeItem('bby_token');
    localStorage.removeItem('bby_code');
    $('room').classList.add('hidden');
    $('home').classList.remove('hidden');
    history.replaceState(null, '', location.pathname);
  }

  // ---------- 轮询 ----------
  function startPoll() {
    stopPoll();
    state.timer = setInterval(async () => {
      if (state.busy) return;
      try {
        const d = await api('pull');
        state.room = d.room;
        render();
      } catch (e) {
        stopPoll();
        toast(e.message);
        setTimeout(backHome, 1200);
      }
    }, 1500);
  }
  function stopPoll() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  // ---------- 渲染 ----------
  function render() {
    const r = state.room;
    if (!r) return;
    $('roomCode').textContent = r.code;
    $('pcount').textContent = r.count;

    const hand = r.you && r.you.hand ? r.you.hand : null;
    $('lobby').classList.toggle('hidden', !!hand);
    $('table').classList.toggle('hidden', !hand);

    renderLobby(r);
    if (hand) renderTable(r);
  }

  function playerRow(p, ownerActions) {
    const tags = [];
    if (p.isOwner) tags.push('<span class="crown">房主</span>');
    if (p.isDealer) tags.push('<span class="crown">庄</span>');
    if (p.isMe) tags.push('<span class="mine">我</span>');
    const status = p.paused ? '暂停中' : (p.online ? '在座' : '离线');
    const acts = [];
    if (ownerActions && !p.isMe) {
      acts.push('<button class="btn-mini" data-act="setdealer" data-id="' + p.id + '">设庄</button>');
      acts.push('<button class="btn-mini" data-act="transfer" data-id="' + p.id + '">给房主</button>');
      acts.push('<button class="btn-mini danger" data-act="kick" data-id="' + p.id + '">移除</button>');
    }
    return '<li class="pitem">' +
      '<div class="avatar">' + esc(p.avatar) + '</div>' +
      '<div class="p-info"><div class="p-name">' + esc(p.name) + tags.join('') + '</div>' +
      '<div class="p-meta">' + status + '</div></div>' +
      (acts.length ? '<div class="topbtns">' + acts.join('') + '</div>' : '') +
      '</li>';
  }

  function renderLobby(r) {
    const canDeal = r.you.isOwner || r.you.isDealer;
    $('lobbyPlayers').innerHTML = r.players.map((p) => playerRow(p, false)).join('');
    $('btnDeal').disabled = !canDeal;
    $('dealHint').textContent = canDeal
      ? '点一下发牌，每人 4 张'
      : '房主或庄家可以发牌，先把房号发给朋友';
  }

  function cardHTML(card, idx) {
    const covered = !!state.flip[idx];
    const red = card.s === '♥' || card.s === '♦';
    const rank = card.joker ? '王' : card.r;
    const suit = card.joker ? '★' : card.s;
    let inner;
    if (covered) {
      inner = '<div class="face-back">宝 宝</div>';
    } else {
      inner = '<div class="r">' + esc(rank) + '</div><div class="s">' + esc(suit) + '</div><div class="bl">' + esc(rank) + '</div>';
    }
    return '<div class="card' + (red ? ' red' : '') + (covered ? ' hidden-face' : '') + '" data-idx="' + idx + '">' +
      inner + '<button class="swap" data-swap="' + idx + '">⇅</button></div>';
  }

  function slotHTML(list) {
    if (!list.length) return '<div class="empty-slot">·</div>';
    return list.map((i) => cardHTML(state.room.you.hand[i], i)).join('');
  }

  function renderTable(r) {
    if (r.you.dealtSeq !== state.dealtSeq) {
      state.dealtSeq = r.you.dealtSeq;
      state.order = [0, 1, 2, 3];
      state.flip = {};
    }
    $('seqNum').textContent = r.seq;
    $('dealerName').textContent = r.dealerName || '—';
    renderSlots();
    const canDeal = r.you.isOwner || r.you.isDealer;
    $('btnDeal2').disabled = !canDeal;
    $('btnDeal2').style.opacity = canDeal ? '1' : '.4';
  }

  function renderSlots() {
    const r = state.room;
    if (!r || !r.you.hand) return;
    const head = state.order.slice(0, 2);
    const tail = state.order.slice(2, 4);
    $('headSlots').innerHTML = slotHTML(head);
    $('tailSlots').innerHTML = slotHTML(tail);
  }

  function toggleFlip(idx) {
    state.flip[idx] = !state.flip[idx];
    renderSlots();
  }

  function swapCard(idx) {
    const pos = state.order.indexOf(idx);
    if (pos < 0) return;
    const target = pos < 2 ? pos + 2 : pos - 2;
    const t = state.order[pos];
    state.order[pos] = state.order[target];
    state.order[target] = t;
    renderSlots();
  }

  // ---------- 弹层 ----------
  function openSheet(html, center) {
    $('sheet').innerHTML = html;
    $('sheet').className = 'sheet' + (center ? ' center-sheet' : '');
    $('mask').classList.remove('hidden');
  }
  function closeSheet() { $('mask').classList.add('hidden'); }

  const RULES_HTML =
    '<div class="u-t">宝宝水鱼 · 玩法</div>' +
    '<p class="rule-warn">上桌前先问一句：这局麻麻能不能杀水鱼？有没有王？按什么规矩来？</p>' +
    '<div class="rule-h">一、基础</div>' +
    '<p class="rule-p">一副牌去掉大小王共 52 张（本房可切 54 张，带一对王）。1 个庄家，其余为闲家。开局先把本地约定讲清楚。</p>' +
    '<div class="rule-h">二、点数换算</div>' +
    '<p class="rule-p">A = 1；2~9 按本身；10、J、Q、K 都算 10。两张一组相加只取个位：7+8=15 → 5 点；9+10=19 → 9 点；K+Q=20 → 0 点。</p>' +
    '<p class="rule-p">对子（本地叫「保」）：两张点数相同，直接算保，保比任何普通点数（含 9 点）都大。</p>' +
    '<p class="rule-p">4 张自由搭配成 2 组，每组 2 张。数值大的那组叫「尾」，小的那组叫「头」。比牌固定：头对头、尾对尾，分开比。</p>' +
    '<div class="rule-h">三、牌型大小</div>' +
    '<p class="rule-p">① 至尊（四条）　② 麻麻（00）　③ 水鱼（两对）　④ 单保　⑤ 普通点数：两组都没对子，9 最大、0 最小。</p>' +
    '<div class="rule-h">四、比牌细则</div>' +
    '<p class="rule-p">水鱼对水鱼：先比大的那对（尾），一样再比小的那对，再一样部分桌比花色（♠ &gt; ♥ &gt; ♣ &gt; ♦）。</p>' +
    '<p class="rule-p">保对保：对 A 最大，对 2 最小。</p>' +
    '<p class="rule-p">麻麻对麻麻：和局（走水）。</p>' +
    '<div class="rule-h">五、本工具说明</div>' +
    '<p class="rule-ok">只负责建房间、发牌、摆牌与亮牌，不做自动比牌、不计任何数值。比牌与结果由桌上朋友当面完成。</p>';

  function showRules() { openSheet(RULES_HTML + '<button class="btn btn-gold" data-close="1" style="margin-top:14px">知道了</button>'); }

  function showList() {
    const r = state.room;
    const isOwner = r.you.isOwner;
    const html = '<div class="u-t">名单 · ' + r.count + '/' + r.maxPlayers + '</div>' +
      '<ul class="plist">' + r.players.map((p) => playerRow(p, isOwner)).join('') + '</ul>' +
      (isOwner ? '<p class="set-note">房主可以设庄、转房主、移出玩家。</p>' : '<p class="set-note">只有房主可以管理玩家。</p>') +
      '<button class="btn btn-ghost" data-close="1" style="margin-top:14px">关闭</button>';
    openSheet(html);
  }

  function showSetting() {
    const r = state.room;
    if (!r.you.isOwner) {
      openSheet('<div class="u-t">房间设置</div><p class="set-note">只有房主可以修改设置。</p>' +
        '<button class="btn btn-ghost" data-close="1" style="margin-top:14px">关闭</button>');
      return;
    }
    const html = '<div class="u-t">房间设置</div>' +
      '<div class="set-row"><div>牌库<br><span class="p-meta">' + (r.jokers ? '54 张（带一对王）' : '52 张（去掉大小王）') + '</span></div>' +
      '<button class="btn-mini" data-cfg="toggle_jokers">切换</button></div>' +
      '<div class="set-row"><div>庄家<br><span class="p-meta">' + (r.dealerName ? esc(r.dealerName) : '未指定') + '</span></div>' +
      '<button class="btn-mini" data-cfg="set_dealer_random">随机设庄</button></div>' +
      '<div class="set-row"><div>清桌<br><span class="p-meta">收回所有手牌，重新开始</span></div>' +
      '<button class="btn-mini danger" data-cfg="clear">清桌</button></div>' +
      '<p class="set-note">牌库与庄家在下一次发牌时生效。</p>' +
      '<button class="btn btn-ghost" data-close="1" style="margin-top:14px">关闭</button>';
    openSheet(html);
  }

  function showPeek() {
    const r = state.room;
    if (!r || !r.you.hand) return;
    const cards = r.you.hand.map((c, i) => cardHTML(Object.assign({}, c), i).replace('hidden-face', '').replace('<div class="face-back">宝 宝</div>', '')).join('');
    const html = '<div class="peek-box"><div class="u-t">看牌</div>' +
      '<p class="note">头 2 张 · 尾 2 张</p>' +
      '<div class="peek-row">' + cards + '</div>' +
      '<button class="btn btn-ghost" data-close="1">收起</button></div>';
    openSheet(html, true);
  }

  // ---------- 操作 ----------
  async function dealCards() {
    if (state.busy) return;
    state.busy = true;
    try {
      const d = await api('deal');
      state.room = d.room;
      render();
    } catch (e) { toast(e.message); }
    state.busy = false;
  }

  async function togglePause() {
    const r = state.room;
    const me = r && r.players.find((p) => p.isMe);
    const action = me && me.paused ? 'resume' : 'pause';
    try {
      const d = await api('act', { action });
      state.room = d.room;
      render();
      toast(action === 'pause' ? '已暂停' : '已回来');
    } catch (e) { toast(e.message); }
  }

  async function leaveRoom() {
    if (!confirm('确定离开房间？你的座位和手牌会被清掉。')) return;
    try { await api('leave'); } catch (e) { /* 忽略 */ }
    backHome();
  }

  async function adminAction(action, value) {
    try {
      const d = await api('admin', { action, value });
      state.room = d.room;
      render();
      closeSheet();
      if (action === 'clear') toast('已清桌');
    } catch (e) { toast(e.message); }
  }

  // ---------- 事件 ----------
  function bind() {
    $('btnRand').addEventListener('click', () => { $('nick').value = randomNick(); });
    $('btnCreate').addEventListener('click', doCreate);
    $('btnJoin').addEventListener('click', doJoin);
    $('codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
    $('btnRulesHome').addEventListener('click', showRules);

    $('btnCopy').addEventListener('click', async () => {
      const code = state.room ? state.room.code : '';
      const text = '宝宝 · 朋友间四张牌\n房号：' + code + '\n打开：' + location.origin + '/?room=' + code;
      try {
        await navigator.clipboard.writeText(text);
        toast('房号和链接已复制');
      } catch (e) {
        prompt('复制这段发给朋友：', text);
      }
    });

    $('btnList').addEventListener('click', showList);
    $('btnRules').addEventListener('click', showRules);
    $('btnSetting').addEventListener('click', showSetting);
    $('btnDeal').addEventListener('click', dealCards);
    $('btnDeal2').addEventListener('click', dealCards);
    $('btnPause').addEventListener('click', togglePause);
    $('btnLeave').addEventListener('click', leaveRoom);
    $('btnPeek').addEventListener('click', showPeek);
    $('btnShield').addEventListener('click', () => { $('shieldLayer').classList.remove('hidden'); });
    $('shieldLayer').addEventListener('click', () => { $('shieldLayer').classList.add('hidden'); });

    $('mask').addEventListener('click', (e) => {
      if (e.target === $('mask')) closeSheet();
    });

    $('sheet').addEventListener('click', (e) => {
      const close = e.target.closest('[data-close]');
      if (close) { closeSheet(); return; }
      const cfg = e.target.closest('[data-cfg]');
      if (cfg) {
        const a = cfg.getAttribute('data-cfg');
        if (a === 'set_dealer_random') adminAction('set_dealer', null);
        else adminAction(a, null);
        return;
      }
      const act = e.target.closest('[data-act]');
      if (act) adminAction(act.getAttribute('data-act'), act.getAttribute('data-id'));
    });

    ['headSlots', 'tailSlots'].forEach((id) => {
      $(id).addEventListener('click', (e) => {
        const sw = e.target.closest('[data-swap]');
        if (sw) { e.stopPropagation(); swapCard(Number(sw.getAttribute('data-swap'))); return; }
        const card = e.target.closest('[data-idx]');
        if (card) toggleFlip(Number(card.getAttribute('data-idx')));
      });
    });
  }

  // ---------- 启动 ----------
  async function boot() {
    initHome();
    bind();
    if (state.token) {
      try {
        const d = await api('pull');
        state.room = d.room;
        $('home').classList.add('hidden');
        $('room').classList.remove('hidden');
        history.replaceState(null, '', '?room=' + d.room.code);
        render();
        startPoll();
      } catch (e) {
        localStorage.removeItem('bby_token');
        state.token = '';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
