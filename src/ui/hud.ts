import { displayName } from '../data/items';
import { VH, VW } from '../engine/screen';
import {
  CONSTELLATION_NAMES,
  constellationOf,
  formatClock,
  formatDate,
  isNight,
  moonPhase,
  solarEclipseActive,
  weatherOf,
} from '../sim/calendar';
import { MAX_ENERGY, MAX_HP, MAX_MANA, type GameState } from '../sim/state';
import type { World } from '../world/world';
import { bar, itemSlot, keyHint, panel, text, UI, type Ctx } from './draw';

export interface Toast {
  msg: string;
  color: string;
  life: number;
}

const PCOL = ['#ff8ab8', '#5a9ae0', '#7fd0a0', '#ffb03a'];

export function drawMoon(c: Ctx, x: number, y: number, phase: number, r = 5): void {
  c.fillStyle = '#1a1430';
  c.beginPath();
  c.arc(x, y, r + 1, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = '#fff4c0';
  c.fillRect(x - r, y - r, r * 2, r * 2);
  // 밝은 비율 f: 삭 0 → 보름 1. 차오를 땐 그림자가 왼쪽으로 물러나고, 기울 땐 오른쪽에서 들어온다.
  const f = (1 - Math.cos((phase / 8) * Math.PI * 2)) / 2;
  if (phase !== 4) {
    c.fillStyle = '#3a2f5e';
    c.beginPath();
    c.arc(phase < 4 ? x - 2 * r * f : x + 2 * r * f, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

export function drawHud(c: Ctx, s: GameState, w: World, toasts: Toast[], slotFlash: { t: number; slot: number }): void {
  // 시계·날짜
  const night = isNight(s.minutes);
  panel(c, VW - 132, 3, 129, 46);
  const rain = weatherOf(s.seed, s.day) === 'rain';
  text(c, formatDate(s.day), VW - 126, 7, { size: 10, color: UI.dim });
  text(c, rain ? '비' : '맑음', VW - 8, 7, { size: 10, align: 'right', color: rain ? UI.sky : UI.gold });
  text(c, formatClock(s.minutes), VW - 126, 19, { color: solarEclipseActive(s.day, s.minutes) ? '#ffb03a' : night ? UI.sky : UI.text });
  drawMoon(c, VW - 15, 26, moonPhase(s.day));
  text(c, `★${CONSTELLATION_NAMES[constellationOf(s.day)]}`, VW - 126, 34, { size: 10, color: '#ffe27a' });
  text(c, `${s.gold.toLocaleString('ko-KR')}G`, VW - 8, 34, { size: 10, align: 'right', color: UI.gold });

  // 플레이어 상태
  w.players.forEach((p, i) => {
    const x = 3 + i * 84;
    const y = 3;
    const rows: [string, number, string][] = [];
    if (w.mine) rows.push(['체력', p.hp / MAX_HP, '#ff6a7a']);
    rows.push(['기력', p.energy / MAX_ENERGY, '#9be08a'], ['마력', p.mana / MAX_MANA, '#9fb4ff']);
    const h = 8 + rows.length * 11;
    panel(c, x, y, 81, h, { border: PCOL[i] });
    text(c, `${i + 1}P`, x + 5, y + 4, { size: 10, color: PCOL[i] });
    rows.forEach(([label, v, col], ri) => {
      const ry = y + 4 + ri * 11;
      text(c, label, x + 21, ry, { size: 10, color: UI.dim });
      bar(c, x + 45, ry + 3, 31, 4, v, col);
    });
    if (p.downed) text(c, '쓰러짐', x + 40, y + h - 12, { size: 10, color: UI.red, align: 'center' });
    const buffs: string[] = [];
    if (p.buffs.aegis > 0) buffs.push('방패');
    if (p.buffs.gale > 0) buffs.push(`질풍${Math.ceil(p.buffs.gale)}`);
    if (p.buffs.eclipse > 0) buffs.push(`일식${Math.ceil(p.buffs.eclipse)}`);
    if (buffs.length) text(c, buffs.join(' '), x + 3, y + h + 1, { size: 10, color: UI.mint });
  });

  // 광산 정보
  if (w.mine) {
    text(c, `광산 ${w.mine.floor}층`, VW / 2, 5, { size: 14, align: 'center', color: UI.gold });
    if (w.waveLabel) text(c, w.waveLabel, VW / 2, 21, { size: 10, align: 'center', color: w.floorCleared ? UI.mint : UI.dim });
    const boss = w.monsters.find((m) => m.def.boss);
    if (boss) {
      text(c, w.bossName, VW / 2, VH - 60, { size: 10, align: 'center', color: '#ffb03a' });
      bar(c, VW / 2 - 90, VH - 48, 180, 5, boss.hp / boss.maxHp, boss.phase === 2 ? '#c08aff' : '#ff6a7a');
    }
  }

  // 핫바
  const p0 = w.players[0];
  const hx = Math.round(VW / 2 - 100);
  const hy = VH - 24;
  panel(c, hx - 3, hy - 3, 206, 24);
  for (let i = 0; i < 10; i++) {
    itemSlot(c, hx + i * 20, hy, s.inventory[i] ?? null, p0?.slot === i);
    w.players.forEach((p, pi) => {
      if (pi > 0 && p.slot === i) {
        c.fillStyle = PCOL[pi]!;
        c.fillRect(hx + i * 20 + 2 + pi * 3, hy - 3, 3, 2);
      }
    });
  }
  if (p0) {
    const st = s.inventory[p0.slot];
    if (st && slotFlash.t > 0) {
      text(c, displayName(st.id, st.q), VW / 2, hy - 15, { size: 10, align: 'center', alpha: Math.min(1, slotFlash.t) });
    }
  }
  // 상호작용 안내
  if (w.prompt && p0 && !w.transitioning) {
    const key = p0.dev === 'kbm' ? 'E' : p0.dev === 'kb2' ? 'Enter' : 'A';
    const sc = w.toScreen(p0.x, p0.y - 34);
    const label = `[${key}] ${w.prompt}`;
    c.font = '10px Galmuri9';
    const tw = c.measureText(label).width;
    panel(c, Math.round(sc.x - tw / 2 - 5), Math.round(sc.y - 3), Math.round(tw + 10), 15, { alpha: 0.85 });
    text(c, label, sc.x, sc.y, { size: 10, align: 'center' });
  }
  // 이름표(주민)
  for (const n of w.npcs) {
    if (!n.visible) continue;
    const near = w.players.some((p) => Math.hypot(p.x - n.x, p.y - n.y) < 60);
    if (!near) continue;
    const sc = w.toScreen(n.x, n.y - 30);
    text(c, n.def.name, sc.x, sc.y, { size: 10, align: 'center', color: UI.gold });
  }
  // 떠오르는 글자
  for (const f of w.floaters) {
    const sc = w.toScreen(f.x, f.y);
    text(c, f.text, sc.x, sc.y, { size: f.big ? 12 : 10, align: 'center', color: f.color, alpha: Math.min(1, f.life * 2) });
  }
  // 알림
  toasts.slice(-5).forEach((t, i, arr) => {
    const y = VH - 46 - (arr.length - 1 - i) * 14;
    c.font = '10px Galmuri9';
    const tw = c.measureText(t.msg).width;
    c.globalAlpha = Math.min(1, t.life);
    c.fillStyle = 'rgba(20,14,36,0.75)';
    c.fillRect(4, y - 2, tw + 10, 13);
    c.globalAlpha = 1;
    text(c, t.msg, 9, y, { size: 10, color: t.color, alpha: Math.min(1, t.life) });
  });
  // 조작 안내(첫날 아침)
  if (s.day === 0 && s.minutes < 9 * 60 && p0?.dev === 'kbm' && !w.mine) {
    keyHint(c, VW / 2, 5, 'WASD 이동 · J/클릭 사용 · E 상호작용', 'center');
    keyHint(c, VW / 2, 16, '1~0 선택 · Tab 가방 · Esc 메뉴', 'center');
  }
}
