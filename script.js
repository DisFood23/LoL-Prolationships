(() => {
  'use strict';

  /* ---------- Dummy data (all fictional) ---------- */
  const W = 2600, H = 1700;
  const ROLES = ['Entry', 'Flex', 'Anchor'];
  const OFFSETS = [[-190, 170], [0, 215], [190, 170]];

  const TEAMS = [
    { id: 'ember',    name: 'Ember Syndicate', tag: 'EMB', hue: 16,  x: 520,  y: 420,  roster: ['Ashfall', 'Quill', 'Marrow'] },
    { id: 'tide',     name: 'Tidebreak',       tag: 'TDB', hue: 200, x: 1300, y: 420,  roster: ['Brine', 'Lantern', 'Skiff'] },
    { id: 'hollow',   name: 'Hollow Crown',    tag: 'HLC', hue: 275, x: 2080, y: 420,  roster: ['Dusk', 'Vesper', 'Thorn'] },
    { id: 'verdant',  name: 'Verdant Order',   tag: 'VRD', hue: 150, x: 520,  y: 1220, roster: ['Fern', 'Cairn', 'Moth'] },
    { id: 'static',   name: 'Static Bloom',    tag: 'STB', hue: 330, x: 1300, y: 1220, roster: ['Haze', 'Orchid', 'Volt'] },
    { id: 'ironwake', name: 'Ironwake',        tag: 'IRW', hue: 45,  x: 2080, y: 1220, roster: ['Anvil', 'Rook', 'Cinder'] },
  ];

  // a vs b, score a-b, newest first
  const MATCHES = [
    { id: 'm1',  date: 'Nov 22', a: 'ember',    b: 'tide',     sa: 2, sb: 1, map: 'Sunken Yard' },
    { id: 'm2',  date: 'Nov 21', a: 'hollow',   b: 'verdant',  sa: 0, sb: 2, map: 'Glass Foundry' },
    { id: 'm3',  date: 'Nov 21', a: 'static',   b: 'ironwake', sa: 2, sb: 0, map: 'Low Orbit' },
    { id: 'm4',  date: 'Nov 19', a: 'ember',    b: 'hollow',   sa: 1, sb: 2, map: 'Ashen Pier' },
    { id: 'm5',  date: 'Nov 18', a: 'tide',     b: 'static',   sa: 2, sb: 1, map: 'Sunken Yard' },
    { id: 'm6',  date: 'Nov 17', a: 'verdant',  b: 'ironwake', sa: 2, sb: 1, map: 'Glass Foundry' },
    { id: 'm7',  date: 'Nov 15', a: 'ember',    b: 'verdant',  sa: 2, sb: 0, map: 'Low Orbit' },
    { id: 'm8',  date: 'Nov 14', a: 'tide',     b: 'hollow',   sa: 0, sb: 2, map: 'Ashen Pier' },
    { id: 'm9',  date: 'Nov 12', a: 'static',   b: 'ember',    sa: 1, sb: 2, map: 'Sunken Yard' },
    { id: 'm10', date: 'Nov 10', a: 'ironwake', b: 'tide',     sa: 2, sb: 1, map: 'Glass Foundry' },
    { id: 'm11', date: 'Nov 9',  a: 'hollow',   b: 'static',   sa: 2, sb: 1, map: 'Low Orbit' },
    { id: 'm12', date: 'Nov 7',  a: 'verdant',  b: 'tide',     sa: 1, sb: 2, map: 'Ashen Pier' },
  ];

  /* ---------- Derived lookups ---------- */
  const teamById = Object.fromEntries(TEAMS.map(t => [t.id, t]));
  const players = [];
  TEAMS.forEach(t => t.roster.forEach((handle, i) => {
    players.push({
      id: `${t.id}-${i}`, handle, role: ROLES[i], team: t.id,
      x: t.x + OFFSETS[i][0], y: t.y + OFFSETS[i][1],
    });
  }));
  const playerById = Object.fromEntries(players.map(p => [p.id, p]));
  const playerAt = (teamId, role) => players.find(p => p.team === teamId && p.role === role);

  // A team's series, seen from that team's side.
  function matchesOf(teamId) {
    return MATCHES.filter(m => m.a === teamId || m.b === teamId).map(m => {
      const home = m.a === teamId;
      const own = home ? m.sa : m.sb;
      const other = home ? m.sb : m.sa;
      return { m, opp: home ? m.b : m.a, own, other, won: own > other };
    });
  }

  // Deterministic fake kills/deaths so the numbers stay the same on every load.
  function rng(seed) {
    let h = 2166136261;
    for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    h = h || 1;
    return () => {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      return (h >>> 0) / 4294967296;
    };
  }
  function kd(matchId, playerId, won) {
    const r = rng(matchId + playerId);
    return {
      k: Math.round(8 + r() * 14 + (won ? 2 : 0)),
      d: Math.round(6 + r() * 12 + (won ? 0 : 2)),
    };
  }

  /* ---------- Build the scene ---------- */
  const viewport = document.getElementById('viewport');
  const canvas = document.getElementById('canvas');
  const svg = document.getElementById('edges');
  const nodesHost = document.getElementById('nodes');
  const panel = document.getElementById('panel');
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const svgEl = (tag, attrs, parent) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  // Quadratic curve between two points, bowed sideways by k * length.
  function curve(p, q, k) {
    const dx = q.x - p.x, dy = q.y - p.y;
    const cx = (p.x + q.x) / 2 - dy * k;
    const cy = (p.y + q.y) / 2 + dx * k;
    return {
      d: `M${p.x} ${p.y} Q${cx} ${cy} ${q.x} ${q.y}`,
      mid: { x: 0.25 * p.x + 0.5 * cx + 0.25 * q.x, y: 0.25 * p.y + 0.5 * cy + 0.25 * q.y },
    };
  }

  const gBase = svgEl('g', {}, svg);
  const gDyn = svgEl('g', {}, svg);

  players.forEach(p => {
    const t = teamById[p.team];
    svgEl('line', { x1: t.x, y1: t.y, x2: p.x, y2: p.y, class: 'e-roster' }, gBase);
  });

  const matchEdges = {};
  MATCHES.forEach(m => {
    const { d, mid } = curve(teamById[m.a], teamById[m.b], 0.1);
    const path = svgEl('path', { d, class: 'e-match' }, gBase);
    const label = svgEl('text', { x: mid.x, y: mid.y, class: 'e-label' }, gBase);
    label.textContent = `${m.sa}–${m.sb}`;
    matchEdges[m.id] = { path, label };
  });

  const nodeEls = {};
  TEAMS.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'node team';
    b.dataset.key = `t:${t.id}`;
    b.style.cssText = `left:${t.x}px;top:${t.y}px;--h:${t.hue}`;
    b.innerHTML = `<span class="tag">${t.tag}</span><span class="nm">${t.name}</span>`;
    b.setAttribute('aria-label', `Team ${t.name}`);
    nodesHost.appendChild(b);
    nodeEls[`t:${t.id}`] = b;
  });
  players.forEach(p => {
    const t = teamById[p.team];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'node player';
    b.dataset.key = `p:${p.id}`;
    b.style.cssText = `left:${p.x}px;top:${p.y}px;--h:${t.hue}`;
    b.innerHTML = `${p.handle.slice(0, 2)}<span class="lbl">${p.handle}<small>${p.role}</small></span>`;
    b.setAttribute('aria-label', `Player ${p.handle}, ${p.role}, ${t.name}`);
    nodesHost.appendChild(b);
    nodeEls[`p:${p.id}`] = b;
  });

  /* ---------- Selection ---------- */
  let current = null;

  function clearSelection() {
    delete canvas.dataset.focus;
    gDyn.replaceChildren();
    Object.values(nodeEls).forEach(n => n.classList.remove('hl', 'sel'));
    Object.values(matchEdges).forEach(e => {
      e.path.classList.remove('hl');
      e.label.classList.remove('hl');
    });
  }

  function select(key) {
    clearSelection();
    current = key;
    if (!key) { panel.hidden = true; return; }

    const [kind, id] = key.split(':');
    const hl = new Set([key]);
    const teamId = kind === 'p' ? playerById[id].team : id;
    const rows = matchesOf(teamId);
    hl.add(`t:${teamId}`);

    rows.forEach(r => {
      hl.add(`t:${r.opp}`);
      matchEdges[r.m.id].path.classList.add('hl');
      matchEdges[r.m.id].label.classList.add('hl');
    });

    if (kind === 'p') {
      const p = playerById[id];
      rows.forEach(r => {
        const foe = playerAt(r.opp, p.role);
        hl.add(`p:${foe.id}`);
        const { d, mid } = curve(p, foe, 0.08);
        const res = r.won ? 'win' : 'loss';
        svgEl('path', { d, class: `e-duel ${res}` }, gDyn);
        const t = svgEl('text', { x: mid.x, y: mid.y, class: `e-label ${res}` }, gDyn);
        t.textContent = `${r.own}–${r.other}`;
      });
    }

    canvas.dataset.focus = 'on';
    hl.forEach(k => nodeEls[k] && nodeEls[k].classList.add('hl'));
    nodeEls[key].classList.add('sel');

    renderPanel(kind, id, rows);
    panel.hidden = false;
    const n = kind === 'p' ? playerById[id] : teamById[id];
    reveal(n.x, n.y, true);
  }

  /* ---------- Detail panel ---------- */
  function renderPanel(kind, id, rows) {
    const wins = rows.filter(r => r.won).length;
    const record = `<p class="record"><b>${wins}W ${rows.length - wins}L</b> in the last ${rows.length} series</p>`;
    let head, list;

    if (kind === 'p') {
      const p = playerById[id];
      const t = teamById[p.team];
      head = `<p class="eyebrow">${t.name} · ${p.role}</p><h2>${p.handle}</h2>${record}`;
      list = rows.map(r => {
        const foe = playerAt(r.opp, p.role);
        const mine = kd(r.m.id, p.id, r.won);
        const theirs = kd(r.m.id, foe.id, !r.won);
        return `<li>
          <span class="res ${r.won ? 'win' : 'loss'}">${r.won ? 'W' : 'L'}</span>
          <div class="m-main"><b>vs ${foe.handle}</b> (${teamById[r.opp].tag})
            <small>${r.m.date} · ${r.m.map} · K/D ${mine.k}/${mine.d} vs ${theirs.k}/${theirs.d}</small></div>
          <span class="score">${r.own}–${r.other}</span></li>`;
      }).join('');
    } else {
      const t = teamById[id];
      const chips = players.filter(p => p.team === id)
        .map(p => `<button class="chip" type="button" data-pick="p:${p.id}">${p.handle}</button>`).join('');
      head = `<p class="eyebrow">Team · ${t.tag}</p><h2>${t.name}</h2>${record}<div class="roster">${chips}</div>`;
      list = rows.map(r => `<li>
          <span class="res ${r.won ? 'win' : 'loss'}">${r.won ? 'W' : 'L'}</span>
          <div class="m-main"><b>vs ${teamById[r.opp].name}</b>
            <small>${r.m.date} · ${r.m.map}</small></div>
          <span class="score">${r.own}–${r.other}</span></li>`).join('');
    }

    panel.innerHTML = `<button class="close" type="button" aria-label="Close details">×</button>${head}<ol class="matches">${list}</ol>`;
    panel.scrollTop = 0;
  }

  /* ---------- Scrolling helpers ---------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isNarrow = () => window.matchMedia('(max-width: 720px)').matches;

  function reveal(x, y, smooth) {
    const visW = viewport.clientWidth - (!panel.hidden && !isNarrow() ? 384 : 0);
    const visH = viewport.clientHeight * (!panel.hidden && isNarrow() ? 0.5 : 1);
    viewport.scrollTo({
      left: x - visW / 2,
      top: y - visH / 2,
      behavior: smooth && !reduceMotion.matches ? 'smooth' : 'auto',
    });
  }

  /* ---------- Interaction ---------- */
  nodesHost.addEventListener('click', e => {
    const n = e.target.closest('.node');
    if (n) select(n.dataset.key);
  });

  panel.addEventListener('click', e => {
    if (e.target.closest('.close')) return select(null);
    const pick = e.target.closest('[data-pick]');
    if (pick) select(pick.dataset.pick);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && current) select(null);
  });

  document.getElementById('recenter').addEventListener('click', () => {
    reveal(W / 2, H / 2, true);
  });

  // Mouse drag-to-pan. Touch and trackpads already scroll natively.
  let drag = null, suppressClick = false;
  viewport.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.node')) return;
    drag = { x: e.clientX, y: e.clientY, l: viewport.scrollLeft, t: viewport.scrollTop, moved: false };
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    viewport.scrollLeft = drag.l - dx;
    viewport.scrollTop = drag.t - dy;
  });
  const endDrag = () => {
    if (!drag) return;
    suppressClick = drag.moved;
    drag = null;
    viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('click', e => {
    if (e.target.closest('.node')) return;
    if (suppressClick) { suppressClick = false; return; }
    if (current) select(null);
  });

  /* ---------- Start state ---------- */
  if (isNarrow()) {
    reveal(W / 2, H / 2, false);
  } else {
    select('p:ember-0');
    reveal(playerById['ember-0'].x, playerById['ember-0'].y, false);
  }
})();
