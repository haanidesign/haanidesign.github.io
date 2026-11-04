/* ページを SVG に する。
   見開きで 見る ときは 右に 偶数ページ、左に 奇数ページ（1ページ目は 左に ひとり）。 */
import { PW, PH, M, frameOf, layoutPanels, layoutSpread, bbox } from './layout.js?v=5';
import { figuresSVG, N } from './figure.js?v=5';

const INK = '#1E1C14', RED = '#E4586A', BLUE = '#9EC8E0';
const FONT = `'M PLUS Rounded 1c','Hiragino Maru Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo',sans-serif`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dPath = p => p.map((q, i) => (i ? 'L' : 'M') + N(q[0]) + ' ' + N(q[1])).join(' ') + ' Z';

/* ---------- 見る 単位（シート） ----------
   [{ items:[{pg, side, x}], w }]  pg は pages の 番号 */
export function sheetsOf(proj) {
  const pages = proj.pages, out = [];
  if (proj.view === 'single') {
    pages.forEach((p, i) => {
      if (p.spread) out.push({ items: [{ pg: i, side: 'W', x: 0 }], w: PW * 2 });
      else out.push({ items: [{ pg: i, side: sideOf(p, proj), x: 0 }], w: PW });
    });
    return out;
  }
  let i = 0;
  while (i < pages.length) {
    const p = pages[i];
    if (p.spread) { out.push({ items: [{ pg: i, side: 'W', x: 0 }], w: PW * 2 }); i++; continue; }
    const side = sideOf(p, proj);
    const nx = pages[i + 1];
    if (side === 'R' && nx && !nx.spread && sideOf(nx, proj) === 'L') {
      out.push({ items: [{ pg: i, side: 'R', x: PW }, { pg: i + 1, side: 'L', x: 0 }], w: PW * 2 });
      i += 2;
    } else {
      out.push({ items: [{ pg: i, side, x: side === 'R' ? PW : 0 }], w: PW * 2, half: true });
      i++;
    }
  }
  return out;
}
/* 右ページか 左ページか。1ページ目を 左（ふつう）に すると 偶数が 右 */
export const sideOf = (p, proj) => ((p.no % 2 === 0) === (proj.firstLeft !== false)) ? 'R' : 'L';

/* ページの コマの 形 */
export function geomOf(pg, side, x0, tilt) {
  if (pg.spread) return layoutSpread(pg.panels, pg.seed, tilt);
  return layoutPanels(pg.panels, frameOf(side, x0), pg.seed, tilt);
}

/* ---------- たて書きの 字 ---------- */
function vtext(cx, top, str, size, cols, perCol, ink, weight = 700) {
  const chars = [...str];
  let g = '';
  const colW = size * 1.15;
  const x0 = cx + (cols - 1) * colW / 2;
  for (let c = 0; c < cols; c++) {
    const seg = chars.slice(c * perCol, (c + 1) * perCol).join('');
    if (!seg) continue;
    g += `<text x="${N(x0 - c * colW)}" y="${N(top)}" font-size="${N(size)}" font-weight="${weight}" fill="${ink}" style="writing-mode:vertical-rl;text-orientation:mixed" writing-mode="tb-rl" font-family="${FONT}">${esc(seg)}</text>`;
  }
  return g;
}
function htext(x, y, lines, size, ink, anchor = 'middle', weight = 700) {
  return lines.map((t, i) => `<text x="${N(x)}" y="${N(y + size * (i + .85) * 1.18)}" font-size="${N(size)}" font-weight="${weight}" fill="${ink}" text-anchor="${anchor}" font-family="${FONT}">${esc(t)}</text>`).join('');
}
const wrap = (str, n) => { const c = [...str], out = []; for (let i = 0; i < c.length; i += n) out.push(c.slice(i, i + n).join('')); return out; };

/* ---------- フキダシ ---------- */
const VERT = new Set(['talk', 'think', 'shout', 'whisper', 'mono']);
function measure(l, size, bb) {
  const len = [...l.text].length;
  if (VERT.has(l.kind)) {
    const sz = l.kind === 'whisper' ? size * .82 : size;
    const perCol = Math.max(3, Math.min(16, Math.floor(bb.h * .52 / sz)));
    const cols = Math.ceil(len / perCol), rows = Math.min(perCol, len);
    const tw = cols * sz * 1.15, th = rows * sz;
    const k = l.kind === 'mono' ? [10, 10] : l.kind === 'shout' ? [26, 22] : [14, 14];
    return { sz, perCol, cols, tw, th, w: tw * (l.kind === 'mono' ? 1 : 1.3) + k[0], h: th * (l.kind === 'mono' ? 1 : 1.18) + k[1] };
  }
  // よこ書き（看板など）
  const sz = l.kind === 'title' ? size * 1.5 : size * .9;
  const per = Math.max(3, Math.floor(bb.w * .7 / sz));
  const lines = wrap(l.text, per);
  return { sz, lines, w: Math.min(len, per) * sz + 12, h: lines.length * sz * 1.18 + 9 };
}
function bubbleShape(l, x, y, m, ink, tail) {
  const rx = m.w / 2, ry = m.h / 2;
  let g = '';
  if (l.kind === 'mono') {
    g += `<rect x="${N(x - rx)}" y="${N(y - ry)}" width="${N(m.w)}" height="${N(m.h)}" fill="#FFFEF7" stroke="${ink}" stroke-width="1.4"/>`;
  } else if (l.kind === 'think') {
    g += `<g fill="#FFFEF7" stroke="${ink}" stroke-width="1.3">`;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      g += `<circle cx="${N(x + Math.cos(a) * rx * .78)}" cy="${N(y + Math.sin(a) * ry * .78)}" r="${N(Math.min(rx, ry) * .40)}"/>`;
    }
    g += `<ellipse cx="${N(x)}" cy="${N(y)}" rx="${N(rx * .86)}" ry="${N(ry * .86)}" stroke="none"/></g>`;
    if (tail) g += `<circle cx="${N(x + (tail.x - x) * .25)}" cy="${N(y + ry + 4)}" r="2.6" fill="#FFFEF7" stroke="${ink}" stroke-width="1.1"/><circle cx="${N(x + (tail.x - x) * .35)}" cy="${N(y + ry + 9)}" r="1.6" fill="#FFFEF7" stroke="${ink}" stroke-width="1"/>`;
  } else if (l.kind === 'shout') {
    const pts = [];
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * Math.PI * 2, k = i % 2 ? .78 : 1.04;
      pts.push(`${N(x + Math.cos(a) * rx * k)} ${N(y + Math.sin(a) * ry * k)}`);
    }
    g += `<polygon points="${pts.join(' ')}" fill="#FFFEF7" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
  } else {
    const dash = l.kind === 'whisper' ? ' stroke-dasharray="3 2.4"' : '';
    if (tail) {
      // しっぽは 話す 人の ほうへ。長さは きめうち
      const bx = x + Math.max(-rx * .45, Math.min(rx * .45, (tail.x - x) * .4)), by = y + ry * .8;
      let dx = tail.x - bx, dy = Math.max(8, tail.top - by);
      const d = Math.hypot(dx, dy) || 1, L = Math.max(9, Math.min(16, ry * .6));
      const ex = bx + dx / d * L, ey = by + dy / d * L;
      const nx = -dy / d * 3.6, ny = dx / d * 3.6;
      g += `<path d="M${N(bx + nx)} ${N(by + ny)} L${N(ex)} ${N(ey)} L${N(bx - nx)} ${N(by - ny)} Z" fill="#FFFEF7" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round"/>`;
    }
    g += `<ellipse cx="${N(x)}" cy="${N(y)}" rx="${N(rx)}" ry="${N(ry)}" fill="#FFFEF7" stroke="${ink}" stroke-width="1.4"${dash}/>`;
    if (tail) g += `<ellipse cx="${N(x)}" cy="${N(y)}" rx="${N(rx - 1.2)}" ry="${N(ry - 1.2)}" fill="#FFFEF7"/>`;
  }
  return g;
}
function bubblesSVG(p, bb, spots, base) {
  const items = p.lines.filter(l => l.text && l.kind !== 'se' && l.kind !== 'none' && l.kind !== 'title');
  if (!items.length) return '';
  let size = base;
  let placed = null;
  for (let tries = 0; tries < 8 && !placed; tries++, size *= .88) {
    const pos = [];
    let x = bb.x + bb.w - 5, y = bb.y + 5, rowH = 0, ok = true;
    for (const l of items) {
      const m = measure(l, size, bb);
      if (m.w > bb.w - 8) { ok = false; break; }
      if (x - m.w < bb.x + 4) { y += rowH + 4; x = bb.x + bb.w - 5; rowH = 0; }
      if (y + m.h > bb.y + bb.h - 3) { ok = false; break; }
      pos.push({ l, m, cx: x - m.w / 2, cy: y + m.h / 2 });
      x -= m.w + 4; rowH = Math.max(rowH, m.h);
    }
    if (ok) placed = pos;
  }
  if (!placed) {                 // 入りきらない ときは 小さく つめこむ
    placed = items.map((l, i) => { const m = measure(l, size, bb); return { l, m, cx: bb.x + bb.w - 5 - m.w / 2 - i * 6, cy: bb.y + 5 + m.h / 2 + i * 6 }; });
  }
  let g = '';
  for (const it of placed) {
    const { l, m, cx, cy } = it;
    if (VERT.has(l.kind)) {
      const sp = spots.find(s => s.id === l.whoId);
      const tail = (l.kind === 'talk' || l.kind === 'shout' || l.kind === 'whisper' || l.kind === 'think') ? (sp || null) : null;
      g += bubbleShape(l, cx, cy, m, INK, tail && sp ? tail : (l.kind === 'talk' ? { x: cx - m.w * .2, top: cy + m.h } : null));
      g += vtext(cx, cy - m.th / 2, l.text, m.sz, m.cols, m.perCol, INK, l.kind === 'shout' ? 800 : 700);
    } else {
      g += `<rect x="${N(cx - m.w / 2)}" y="${N(cy - m.h / 2)}" width="${N(m.w)}" height="${N(m.h)}" rx="2" fill="#FFFEF7" stroke="${INK}" stroke-width="1"/>`;
      g += `<rect x="${N(cx - m.w / 2 + 2)}" y="${N(cy - m.h / 2 + 2)}" width="${N(m.w - 4)}" height="${N(m.h - 4)}" rx="1" fill="none" stroke="${INK}" stroke-width=".6"/>`;
      g += htext(cx, cy - m.h / 2 + 3.5, m.lines, m.sz, INK);
    }
  }
  return g;
}
function titleSVG(p, bb) {
  const t = p.lines.filter(l => l.kind === 'title' && l.text);
  if (!t.length) return '';
  let g = '', y = bb.y + bb.h - 8;
  for (const l of t.slice().reverse()) {
    const len = [...l.text].length;
    const sz = Math.max(10, Math.min(30, bb.w * .8 / len));
    g += `<text x="${N(bb.cx)}" y="${N(y)}" font-size="${N(sz)}" font-weight="800" text-anchor="middle" fill="${INK}" stroke="#FFFEF7" stroke-width="${N(sz * .22)}" paint-order="stroke" stroke-linejoin="round" font-family="${FONT}">${esc(l.text)}</text>`;
    y -= sz * 1.3;
  }
  return g;
}
function seSVG(p, bb) {
  const se = p.lines.filter(l => l.kind === 'se' && l.text);
  if (!se.length) return '';
  let g = '';
  se.slice(0, 4).forEach((l, i) => {
    const len = Math.max(1, [...l.text].length);
    let sz = Math.max(9, Math.min(34, Math.min(bb.h / 4.2, bb.w * .78 / len)));
    const x = bb.x + bb.w * (i % 2 ? .52 : .07), y = bb.y + bb.h * (.86 - i * .17);
    g += `<text x="${N(x)}" y="${N(y)}" font-size="${N(sz)}" font-weight="800" fill="${INK}" stroke="#FFFEF7" stroke-width="${N(sz * .28)}" paint-order="stroke" stroke-linejoin="round" transform="rotate(-8 ${N(x)} ${N(y)})" font-family="${FONT}">${esc(l.text)}</text>`;
  });
  return g;
}
function memoSVG(p, bb) {
  const t = (p.memo || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const sz = 5.6, per = Math.max(4, Math.floor((bb.w - 8) / sz)), max = bb.h > 90 ? 3 : 2;
  let lines = wrap(t, per);
  if (lines.length > max) { lines = lines.slice(0, max); lines[max - 1] = lines[max - 1].slice(0, -1) + '…'; }
  const h = lines.length * sz * 1.18 + 4;
  const y = bb.y + bb.h - h - 2;
  return `<rect x="${N(bb.x + 2)}" y="${N(y)}" width="${N(bb.w - 4)}" height="${N(h)}" fill="rgba(255,254,247,.82)"/>` +
    htext(bb.x + 4, y + 1.5, lines, sz, '#8A8470', 'start', 400);
}
function objSVG(p, bb) {
  const w = Math.min(bb.w, bb.h) * .52, cx = bb.cx, cy = bb.cy - bb.h * .04;
  return `<rect x="${N(cx - w / 2)}" y="${N(cy - w / 2)}" width="${N(w)}" height="${N(w)}" rx="${N(w * .2)}" fill="#F3F1E2" stroke="${INK}" stroke-width="1.3" stroke-dasharray="4 3"/>` +
    `<text x="${N(cx)}" y="${N(cy + 3)}" font-size="${N(Math.max(6, Math.min(12, w / Math.max(2, [...p.obj].length))))}" text-anchor="middle" fill="${INK}" font-weight="700" font-family="${FONT}">${esc(p.obj || 'モノ')}</text>`;
}

/* ---------- 1シート ---------- */
export function sheetSVG(proj, sheet, opt = {}) {
  const { pref = 'v', sel = null, plain = false } = opt;
  const W = sheet.w, H = PH;
  const castBy = id => proj.cast.find(c => c.id === id);
  let defs = '<style>.fig *{vector-effect:non-scaling-stroke}</style>', body = '';
  body += `<rect width="${W}" height="${H}" fill="#FFFEF7"/>`;
  if (sheet.half) {
    const blank = sheet.items[0].side === 'R' ? 0 : PW;
    body += `<rect x="${blank}" width="${PW}" height="${H}" fill="#EAE7D2"/>`;
  }
  const v = proj.show || {};
  sheet.items.forEach(it => {
    const pg = proj.pages[it.pg];
    if (!pg) return;
    const geo = geomOf(pg, it.side, it.x, proj.tilt);
    // 基本枠
    if (!plain) {
      if (pg.spread) body += `<rect x="${M.outer}" y="${M.top}" width="${PW * 2 - M.outer * 2}" height="${PH - M.top - M.bottom}" fill="none" stroke="${BLUE}" stroke-width=".8" stroke-dasharray="4 4"/>`;
      else {
        const left = it.side === 'R' ? M.inner : M.outer, right = it.side === 'R' ? M.outer : M.inner;
        body += `<rect x="${it.x + left}" y="${M.top}" width="${PW - left - right}" height="${PH - M.top - M.bottom}" fill="none" stroke="${BLUE}" stroke-width=".8" stroke-dasharray="4 4"/>`;
      }
    }
    // ページ番号
    const nums = pg.spread ? [[pg.no, PW + PW - 22], [pg.no2 || pg.no + 1, 22]] : [[pg.no, it.side === 'R' ? it.x + PW - 22 : it.x + 22]];
    nums.forEach(([n, x]) => {
      body += `<text x="${x}" y="${H - 16}" font-size="9" text-anchor="middle" fill="#8A8470" font-family="${FONT}">${n}</text>`;
    });
    // コマ（すみの 小ゴマは あとで 上に）
    const order = pg.panels.map((p, i) => i).sort((a, b) => (geo[a] && geo[a].inset ? 1 : 0) - (geo[b] && geo[b].inset ? 1 : 0));
    for (const i of order) {
      const p = pg.panels[i], gm = geo[i];
      if (!gm) continue;
      const { poly, bb } = gm;
      const cid = `${pref}c${it.pg}_${i}`;
      defs += `<clipPath id="${cid}"><path d="${dPath(poly)}"/></clipPath>`;
      const isSel = sel && sel.pg === it.pg && sel.i === i;
      body += `<g class="pnl${isSel ? ' sel' : ''}" data-pg="${it.pg}" data-i="${i}">`;
      body += `<path d="${dPath(poly)}" fill="${isSel ? 'rgba(242,160,184,.28)' : '#FFFEF7'}"/>`;
      let inner = '';
      const figs = (p.figs || []).map(f => ({ ...f, c: castBy(f.id) })).filter(f => f.c);
      let spots = [];
      if (v.fig !== false) {
        if (p.shot === 'obj') inner += objSVG(p, bb);
        const r = figuresSVG(figs, bb, p.shot, proj.style || 'real', INK);
        inner += r.svg; spots = r.spots;
      }
      if (v.memo !== false) inner += memoSVG(p, bb);
      if (v.se !== false) inner += seSVG(p, bb);
      inner += titleSVG(p, bb);
      if (v.bub !== false) {
        p.lines.forEach(l => { const c = proj.cast.find(c => c.name === l.who); l.whoId = c ? c.id : null; });
        const base = Math.max(6.5, Math.min(10.5, Math.min(bb.w, bb.h) / 11));
        inner += bubblesSVG(p, bb, spots, base);
      }
      body += `<g clip-path="url(#${cid})">${inner}</g>`;
      body += `<path d="${dPath(poly)}" fill="none" stroke="${isSel ? RED : INK}" stroke-width="${isSel ? 2.6 : 1.6}" stroke-linejoin="round"/>`;
      if (v.no !== false && !plain) {
        const nx = bb.x + bb.w - 9, ny = bb.y + 9;
        body += `<circle cx="${N(nx)}" cy="${N(ny)}" r="6.5" fill="#E1DD60" stroke="${INK}" stroke-width="1.1"/>`;
        body += `<text x="${N(nx)}" y="${N(ny + 3)}" text-anchor="middle" font-size="8" font-weight="700" fill="${INK}" font-family="${FONT}">${i + 1}</text>`;
      }
      if (p.hook && !plain) {
        const hx = bb.x + 4, hy = bb.y + bb.h + 3;
        body += `<g transform="translate(${N(hx)} ${N(Math.min(hy, H - 30))})"><rect width="30" height="11" rx="5.5" fill="${RED}"/><text x="15" y="8.2" text-anchor="middle" font-size="7" font-weight="700" fill="#fff" font-family="${FONT}">引き ◀</text></g>`;
      }
      body += `</g>`;
    }
  });
  // まんなかの 折り目
  if (W > PW) body += `<path d="M${PW} 0 V${H}" stroke="${INK}" stroke-width=".8" stroke-dasharray="2 3" opacity=".45"/>`;
  body += `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${INK}" stroke-width="1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs}</defs>${body}</svg>`;
}

/* 書き出し用：1ページだけ（見開きは 半分ずつ） */
export function pageSVGs(proj) {
  const out = [];
  proj.pages.forEach((pg, i) => {
    if (pg.spread) {
      const sv = sheetSVG(proj, { items: [{ pg: i, side: 'W', x: 0 }], w: PW * 2 }, { pref: 'x' + i, plain: true });
      out.push({ no: pg.no, svg: sv.replace(`viewBox="0 0 ${PW * 2} ${PH}" width="${PW * 2}"`, `viewBox="${PW} 0 ${PW} ${PH}" width="${PW}"`) });
      out.push({ no: pg.no2 || pg.no + 1, svg: sv.replace(`viewBox="0 0 ${PW * 2} ${PH}" width="${PW * 2}"`, `viewBox="0 0 ${PW} ${PH}" width="${PW}"`) });
    } else {
      const side = sideOfPage(pg, proj);
      out.push({ no: pg.no, svg: sheetSVG(proj, { items: [{ pg: i, side, x: 0 }], w: PW }, { pref: 'x' + i, plain: true }) });
    }
  });
  return out;
}
const sideOfPage = (p, proj) => sideOf(p, proj);
export { PW, PH, bbox };
