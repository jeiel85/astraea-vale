import { animalSprite } from '../art/creatures';
import { itemIcon } from '../art/icons';
import { portraitSprite, type Expression } from '../art/portraits';
import { noise } from '../art/pixel';
import { RUNE_COLORS } from '../art/world';
import { SPECIES, VARIANT_NAMES } from '../data/animals';
import { cropBySeed, cropGrowsIn, CROPS } from '../data/crops';
import { GOALS, VILLAGE_RANK_NAMES } from '../data/goals';
import { displayName, itemDef, sellValue } from '../data/items';
import type { CharLook } from '../data/npcs';
import { RECIPES } from '../data/recipes';
import { audio } from '../engine/audio';
import type { Rng } from '../engine/rng';
import type { DeviceId, Input } from '../engine/input';
import { VH, VW } from '../engine/screen';
import { canCraft, craft } from '../sim/alchemy';
import {
  CONSTELLATION_EFFECTS,
  CONSTELLATION_NAMES,
  constellationOf,
  dayOfSeason,
  forecast,
  formatDate,
  isFestivalDay,
  isFullMoon,
  isLunarEclipse,
  isSolarEclipse,
  MOON_SHORT,
  SEASON_NAMES,
  seasonOf,
  type Constellation,
} from '../sim/calendar';
import type { DaySummary } from '../sim/day';
import { weaveRune } from '../sim/farm';
import { goalsDone, villageRank } from '../sim/goals';
import { countItem, swapSlots } from '../sim/inventory';
import { breed, canBreed, isAdult } from '../sim/livestock';
import { MAX_MANA, type GameState, type ItemStack } from '../sim/state';
import type { Player } from '../world/entities';
import { drawMoon } from './hud';
import { bar, itemSlot, keyHint, measure, panel, text, UI, wrap, type Ctx } from './draw';
import { isConfirm, ListNav, type ListItem, type Modal } from './modal';

/** 메뉴가 게임에 요구하는 기능(순환 참조를 피하려고 인터페이스로 둔다) */
export interface MenuHost {
  state: GameState;
  input: Input;
  toast(msg: string, color?: string): void;
  goal(id: Parameters<import('../world/world').WorldHost['goal']>[0]): void;
  rng: Rng;
}

// ── 대화 ───────────────────────────────────────────
export interface Speaker {
  id: string;
  name: string;
  look: CharLook;
}
export interface DLine {
  text: string;
  expr?: Expression;
}
export interface DChoice {
  label: string;
  disabled?: boolean;
  act: () => void;
}

export class DialogueModal implements Modal {
  done = false;
  pausesWorld = true;
  private i = 0;
  private shown = 0;
  private nav: ListNav | null = null;
  private lines: DLine[];
  constructor(
    public owner: DeviceId,
    lines: (string | DLine)[],
    private speaker: Speaker | null = null,
    private choices: DChoice[] = [],
  ) {
    this.lines = lines.map((l) => (typeof l === 'string' ? { text: l } : l));
  }
  private get cur(): DLine {
    return this.lines[this.i]!;
  }
  update(dt: number, input: Input): void {
    const full = this.cur.text.length;
    if (this.nav) {
      const r = this.nav.update(input, this.owner, { x: VW - 150, y: this.choiceY, w: 140, rowH: 16 });
      if (r === 'confirm') {
        audio.sfx('confirm');
        this.done = true;
        this.choices[this.nav.index]!.act();
      } else if (r === 'cancel') {
        audio.sfx('cancel');
        this.done = true;
      }
      return;
    }
    const before = Math.floor(this.shown);
    this.shown = Math.min(full, this.shown + dt * 45);
    if (Math.floor(this.shown) !== before && Math.floor(this.shown) % 3 === 0) audio.sfx('blip', { volume: 0.15, pitch: 1.4 });
    if (isConfirm(input, this.owner) || input.pressed(this.owner, 'interact')) {
      if (this.shown < full) this.shown = full;
      else if (this.i < this.lines.length - 1) {
        this.i++;
        this.shown = 0;
      } else if (this.choices.length) {
        this.nav = new ListNav(this.choices.map((c) => ({ label: c.label, disabled: c.disabled })), 6);
      } else this.done = true;
    } else if (input.pressed(this.owner, 'cancel') && !this.choices.length) {
      this.done = true;
    }
  }
  private choiceY = 0;
  draw(c: Ctx): void {
    const bx = 8;
    const by = VH - 72;
    const bw = VW - 16;
    const bh = 66;
    panel(c, bx, by, bw, bh);
    let tx = bx + 10;
    if (this.speaker) {
      const ps = portraitSprite(this.speaker.id, this.speaker.look, this.cur.expr ?? 'normal');
      c.fillStyle = '#4a3a7a';
      c.fillRect(bx + 6, by + 7, 52, 52);
      c.drawImage(ps, bx + 7, by + 8);
      panel(c, bx + 4, by - 12, measure(c, this.speaker.name) + 16, 15, { fill: UI.panel2 });
      text(c, this.speaker.name, bx + 12, by - 10, { color: UI.gold });
      tx = bx + 66;
    }
    const maxW = bx + bw - tx - 10;
    const lines = wrap(c, this.cur.text.slice(0, Math.floor(this.shown)), maxW);
    lines.slice(0, 4).forEach((l, i) => text(c, l, tx, by + 8 + i * 14));
    if (!this.nav && this.shown >= this.cur.text.length && Math.floor(performance.now() / 300) % 2 === 0) text(c, '▼', bx + bw - 14, by + bh - 14, { size: 10, color: UI.gold });
    if (this.nav) {
      const h = this.choices.length * 16 + 10;
      this.choiceY = by - h - 6 + 6;
      panel(c, VW - 156, by - h - 6, 148, h);
      this.nav.draw(c, VW - 150, this.choiceY, 140);
    }
  }
}

// ── 가방(관리·선택) ─────────────────────────────────
export interface PickOpts {
  title: string;
  filter?: (st: ItemStack) => boolean;
  onPick?: (slot: number) => void;
  keepOpen?: boolean;
  footer?: () => string;
}

export class InventoryModal implements Modal {
  done = false;
  pausesWorld = true;
  private cur = 0;
  private held: number | null = null;
  constructor(public owner: DeviceId, private host: MenuHost, private opts: PickOpts, private player?: Player) {}
  private get inv(): (ItemStack | null)[] {
    return this.host.state.inventory;
  }
  update(_dt: number, input: Input): void {
    const o = this.owner;
    if (input.nav(o, 'left')) this.move(-1, 0);
    if (input.nav(o, 'right')) this.move(1, 0);
    if (input.nav(o, 'up')) this.move(0, -1);
    if (input.nav(o, 'down')) this.move(0, 1);
    if (o === 'kbm' && input.mouseActive()) {
      const gx = Math.floor((input.mouse.x - this.gx) / 20);
      const gy = Math.floor((input.mouse.y - this.gy) / 20);
      if (gx >= 0 && gx < 10 && gy >= 0 && gy < 3) {
        if (input.time - input.mouse.lastMove < 0.05) this.cur = gy * 10 + gx;
        if (input.mouse.leftPressed) {
          this.cur = gy * 10 + gx;
          this.confirm();
          return;
        }
      }
    }
    if (input.pressed(o, 'cancel') || input.pressed(o, 'inventory')) {
      if (this.held !== null) this.held = null;
      else this.done = true;
      audio.sfx('cancel');
      return;
    }
    if (o === 'kbm' ? ['KeyE', 'Enter', 'Space', 'KeyJ'].some((k) => input.keyPressed(k)) : input.pressed(o, 'confirm')) this.confirm();
    // 관리 모드에서 Q(아이템 키)로 먹기·마시기
    if (!this.opts.onPick && this.player && input.pressed(o, 'item')) this.useHere();
  }
  private useHere(): void {
    const st = this.inv[this.cur];
    if (!st) return;
    const d = itemDef(st.id);
    if (d.potion || d.energy) {
      this.useCb?.(this.cur);
    }
  }
  useCb: ((slot: number) => void) | null = null;
  private move(dx: number, dy: number): void {
    const x = (this.cur % 10 + dx + 10) % 10;
    const y = (Math.floor(this.cur / 10) + dy + 3) % 3;
    this.cur = y * 10 + x;
    audio.sfx('blip', { volume: 0.4 });
  }
  private confirm(): void {
    const st = this.inv[this.cur];
    if (this.opts.onPick) {
      if (!st || (this.opts.filter && !this.opts.filter(st))) {
        audio.sfx('error');
        return;
      }
      this.opts.onPick(this.cur);
      if (!this.opts.keepOpen) this.done = true;
      return;
    }
    if (this.held === null) {
      if (st) {
        this.held = this.cur;
        audio.sfx('blip');
      }
    } else {
      swapSlots(this.inv, this.held, this.cur);
      this.held = null;
      audio.sfx('confirm');
    }
  }
  private gx = 0;
  private gy = 0;
  draw(c: Ctx): void {
    const w = 226;
    const h = 150;
    const x = Math.round((VW - w) / 2);
    const y = 24;
    panel(c, x, y, w, h);
    text(c, this.opts.title, x + 10, y + 6, { color: UI.gold });
    text(c, `${this.host.state.gold.toLocaleString('ko-KR')}G`, x + w - 10, y + 6, { align: 'right', color: UI.gold });
    this.gx = x + 13;
    this.gy = y + 24;
    for (let i = 0; i < 30; i++) {
      const st = this.inv[i] ?? null;
      const sx = this.gx + (i % 10) * 20;
      const sy = this.gy + Math.floor(i / 10) * 20 + (i >= 10 ? 4 : 0);
      const dim = !!(this.opts.filter && st && !this.opts.filter(st));
      itemSlot(c, sx, sy, st, i === this.cur, { dim });
      if (this.held === i) {
        c.strokeStyle = UI.mint;
        c.strokeRect(sx + 0.5, sy + 0.5, 17, 17);
      }
    }
    const st = this.inv[this.cur];
    const dy = y + 94;
    if (st) {
      const d = itemDef(st.id);
      text(c, displayName(st.id, st.q), x + 10, dy, { color: st.q === 2 ? '#ffb03a' : st.q === 1 ? UI.gold : UI.text });
      if (d.price > 0) text(c, `출하가 ${sellValue(st.id, st.q)}G`, x + w - 10, dy, { align: 'right', size: 10, color: UI.dim });
      let desc = d.desc;
      const crop = cropBySeed(st.id);
      if (crop) {
        const seasons = crop.seasons === 'any' ? '사계절' : crop.seasons.map((s) => SEASON_NAMES[s]).join('·');
        desc = `${seasons} · ${crop.growDays}일${crop.regrowDays ? ` · 재수확 ${crop.regrowDays}일` : ''}${crop.requiredConstellation ? ` · ${CONSTELLATION_NAMES[crop.requiredConstellation]} 룬 필요` : ''}\n${crop.desc}`;
      }
      wrap(c, desc, w - 20, 10).slice(0, 3).forEach((l, i) => text(c, l, x + 10, dy + 15 + i * 11, { size: 10, color: UI.dim }));
    }
    const foot = this.opts.footer?.() ?? (this.opts.onPick ? '확인: 선택 · 취소: 닫기' : this.held !== null ? '옮길 칸을 고르세요' : '확인: 옮기기 · Q: 먹기/마시기 · 취소: 닫기');
    keyHint(c, x + w / 2, y + h - 13, foot, 'center');
  }
}

// ── 상점 ───────────────────────────────────────────
interface ShopEntry {
  kind: 'item' | 'animal';
  id: string;
  price: number;
}

export class ShopModal implements Modal {
  done = false;
  pausesWorld = true;
  private nav: ListNav;
  private entries: ShopEntry[];
  constructor(public owner: DeviceId, private host: MenuHost, private buy: (e: ShopEntry) => string | null) {
    const s = host.state;
    const season = seasonOf(s.day);
    const e: ShopEntry[] = [];
    for (const c of CROPS) {
      if (c.id === 'umbral_lotus' && villageRank(s) < 3) continue;
      if (c.seasons !== 'any' && !cropGrowsIn(c, season)) continue;
      e.push({ kind: 'item', id: `seed_${c.id}`, price: c.seedPrice });
    }
    e.push({ kind: 'item', id: 'tonic', price: 150 });
    e.push({ kind: 'animal', id: 'cow', price: SPECIES.cow.price });
    e.push({ kind: 'animal', id: 'duck', price: SPECIES.duck.price });
    this.entries = e;
    this.nav = new ListNav([], 9);
    this.refresh();
  }
  private refresh(): void {
    const s = this.host.state;
    this.nav.items = this.entries.map<ListItem>((e) => ({
      label: e.kind === 'animal' ? `${SPECIES[e.id as 'cow'].name} (새끼)` : itemDef(e.id).name,
      right: `${e.price}G`,
      disabled: s.gold < e.price,
    }));
  }
  update(_dt: number, input: Input): void {
    const r = this.nav.update(input, this.owner, { x: this.lx, y: this.ly, w: 170, rowH: 14 });
    if (r === 'cancel') {
      this.done = true;
      audio.sfx('cancel');
    } else if (r === 'confirm') {
      const err = this.buy(this.entries[this.nav.index]!);
      if (err) {
        audio.sfx('error');
        this.host.toast(err, UI.red);
      } else audio.sfx('coin');
      this.refresh();
    }
  }
  private lx = 0;
  private ly = 0;
  draw(c: Ctx): void {
    const x = 24;
    const y = 16;
    const w = VW - 48;
    const h = 170;
    panel(c, x, y, w, h);
    text(c, `솔의 잡화점 · ${SEASON_NAMES[seasonOf(this.host.state.day)]} 입고`, x + 10, y + 6, { color: UI.gold });
    text(c, `${this.host.state.gold.toLocaleString('ko-KR')}G`, x + w - 10, y + 6, { align: 'right', color: UI.gold });
    this.lx = x + 6;
    this.ly = y + 24;
    this.nav.draw(c, this.lx, this.ly, 170, 14);
    const e = this.entries[this.nav.index]!;
    const rx = x + 186;
    if (e.kind === 'animal') {
      const sp = SPECIES[e.id as 'cow'];
      c.drawImage(animalSprite(sp.id, 'standard', false, Math.floor(performance.now() / 400) % 2), rx, y + 26);
      wrap(c, `${sp.name} 새끼. ${sp.adultAge}일 뒤 어른이 되면 매일 ${itemDef(sp.product.standard).name}을(를) 준다. 교배로 파스텔 핑크·별무늬 네이비·골든 글로우 변종이 태어날 수 있다.`, w - 196, 10).forEach((l, i) =>
        text(c, l, rx, y + 54 + i * 12, { size: 10, color: UI.dim }),
      );
      text(c, `목장 ${this.host.state.animals.length}/12`, rx, y + h - 22, { size: 10, color: UI.dim });
    } else {
      const d = itemDef(e.id);
      c.drawImage(itemIcon(e.id), rx, y + 26);
      text(c, d.name, rx + 22, y + 30);
      const crop = cropBySeed(e.id);
      const lines: string[] = [];
      if (crop) {
        lines.push(`${crop.seasons === 'any' ? '사계절' : crop.seasons.map((s) => SEASON_NAMES[s]).join('·')} · ${crop.growDays}일 · 수확가 ${crop.sellPrice}G${crop.regrowDays ? ` · ${crop.regrowDays}일마다 재수확` : ''}`);
        if (crop.requiredConstellation) lines.push(`※ ${CONSTELLATION_NAMES[crop.requiredConstellation]} 룬을 새긴 밭에만 심을 수 있다.`);
      }
      lines.push(d.desc);
      lines.push(`가진 개수 ${countItem(this.host.state.inventory, e.id)}`);
      let ly = y + 50;
      for (const l of lines) for (const wl of wrap(c, l, w - 196, 10)) {
        text(c, wl, rx, ly, { size: 10, color: UI.dim });
        ly += 12;
      }
    }
    keyHint(c, x + w / 2, y + h - 12, '확인: 1개 구입 · 취소: 닫기', 'center');
  }
}

// ── 연금술 ─────────────────────────────────────────
export class CraftModal implements Modal {
  done = false;
  pausesWorld = true;
  private nav: ListNav;
  constructor(public owner: DeviceId, private host: MenuHost) {
    this.nav = new ListNav([], 8);
    this.refresh();
  }
  private refresh(): void {
    const s = this.host.state;
    this.nav.items = RECIPES.map((r) => ({ label: `${itemDef(r.output).name}${r.outputCount > 1 ? ` ×${r.outputCount}` : ''}`, color: canCraft(s, r) ? UI.text : '#7a6a9a' }));
  }
  update(_dt: number, input: Input): void {
    const r = this.nav.update(input, this.owner, { x: 30, y: 40, w: 150, rowH: 16 });
    if (r === 'cancel') {
      this.done = true;
      audio.sfx('cancel');
    } else if (r === 'confirm') {
      const rec = RECIPES[this.nav.index]!;
      const res = craft(this.host.state, rec);
      if (res.ok) {
        audio.sfx('potion');
        audio.sfx('magic');
        this.host.toast(`${itemDef(rec.output).name}을(를) 만들었다!`, UI.mint);
        if (rec.output === 'fertilizer') this.host.toast('정수 비료는 밭이나 목장 안에서 쓸 수 있다.', '#c06aff');
      } else {
        audio.sfx('error');
        this.host.toast(res.msg, UI.red);
      }
      this.refresh();
    }
  }
  draw(c: Ctx): void {
    const x = 24;
    const y = 16;
    const w = VW - 48;
    const h = 170;
    panel(c, x, y, w, h);
    text(c, '연금술 가마솥', x + 10, y + 6, { color: UI.gold });
    keyHint(c, x + w - 10, y + 8, '수확물 + 광산 전리품 → 물약·비료', 'right');
    this.nav.draw(c, 30, 40, 150);
    const rec = RECIPES[this.nav.index]!;
    const rx = x + 170;
    c.drawImage(itemIcon(rec.output), rx, y + 26);
    text(c, itemDef(rec.output).name, rx + 22, y + 30, { color: UI.gold });
    wrap(c, itemDef(rec.output).desc, w - 180, 10).forEach((l, i) => text(c, l, rx, y + 50 + i * 12, { size: 10, color: UI.dim }));
    text(c, '재료', rx, y + 86, { size: 10, color: UI.dim });
    rec.inputs.forEach((inp, i) => {
      const have = countItem(this.host.state.inventory, inp.id);
      const iy = y + 98 + i * 20;
      c.drawImage(itemIcon(inp.id), rx, iy);
      text(c, `${itemDef(inp.id).name}`, rx + 22, iy + 4);
      text(c, `${have}/${inp.n}`, x + w - 12, iy + 4, { align: 'right', color: have >= inp.n ? UI.mint : UI.red });
    });
    text(c, rec.hint, rx, y + h - 26, { size: 10, color: '#c8a8ff' });
    keyHint(c, x + w / 2, y + h - 12, '확인: 만들기 · 취소: 닫기', 'center');
  }
}

// ── 강화(대장간·지팡이) ─────────────────────────────
export interface UpgradeOption {
  name: string;
  desc: string;
  cost: { id: string; n: number }[];
  gold: number;
  available: boolean;
  doneLabel?: string;
  apply: () => void;
}

export class UpgradeModal implements Modal {
  done = false;
  pausesWorld = true;
  private nav: ListNav;
  constructor(public owner: DeviceId, private host: MenuHost, private title: string, private options: () => UpgradeOption[]) {
    this.nav = new ListNav([], 5);
    this.refresh();
  }
  private refresh(): void {
    this.nav.items = this.options().map((o) => ({ label: o.name, disabled: !o.available, right: o.doneLabel ?? `${o.gold}G` }));
  }
  private afford(o: UpgradeOption): boolean {
    const s = this.host.state;
    return s.gold >= o.gold && o.cost.every((c) => countItem(s.inventory, c.id) >= c.n);
  }
  update(_dt: number, input: Input): void {
    const r = this.nav.update(input, this.owner, { x: 40, y: 50, w: 150, rowH: 16 });
    if (r === 'cancel') {
      this.done = true;
      audio.sfx('cancel');
    } else if (r === 'confirm') {
      const o = this.options()[this.nav.index]!;
      if (!this.afford(o)) {
        audio.sfx('error');
        this.host.toast('재료나 골드가 부족하다.', UI.red);
        return;
      }
      o.apply();
      audio.sfx('levelUp');
      this.refresh();
    }
  }
  draw(c: Ctx): void {
    const x = 34;
    const y = 30;
    const w = VW - 68;
    const h = 140;
    panel(c, x, y, w, h);
    text(c, this.title, x + 10, y + 6, { color: UI.gold });
    this.nav.draw(c, 40, 50, 150);
    const o = this.options()[this.nav.index];
    if (!o) return;
    const rx = x + 170;
    wrap(c, o.desc, w - 180, 10).forEach((l, i) => text(c, l, rx, y + 22 + i * 12, { size: 10, color: UI.dim }));
    if (o.available) {
      o.cost.forEach((cst, i) => {
        const have = countItem(this.host.state.inventory, cst.id);
        const iy = y + 62 + i * 20;
        c.drawImage(itemIcon(cst.id), rx, iy);
        text(c, itemDef(cst.id).name, rx + 22, iy + 4);
        text(c, `${have}/${cst.n}`, x + w - 12, iy + 4, { align: 'right', color: have >= cst.n ? UI.mint : UI.red });
      });
      text(c, `${o.gold}G`, x + w - 12, y + h - 28, { align: 'right', color: this.host.state.gold >= o.gold ? UI.gold : UI.red });
    }
    keyHint(c, x + w / 2, y + h - 12, '확인: 강화 · 취소: 닫기', 'center');
  }
}

// ── 관측소 ─────────────────────────────────────────
export const CONSTELLATION_STARS: Record<Constellation, readonly [number, number][]> = {
  orion: [[0.28, 0.12], [0.72, 0.16], [0.57, 0.5], [0.5, 0.46], [0.43, 0.42], [0.25, 0.88], [0.74, 0.84]],
  cassiopeia: [[0.08, 0.3], [0.3, 0.78], [0.5, 0.38], [0.7, 0.8], [0.92, 0.26]],
  phoenix: [[0.5, 0.08], [0.5, 0.38], [0.12, 0.22], [0.35, 0.62], [0.5, 0.9], [0.65, 0.62], [0.88, 0.22]],
  eclipse: [[0.5, 0.08], [0.84, 0.3], [0.84, 0.7], [0.5, 0.92], [0.16, 0.7], [0.16, 0.3], [0.5, 0.5]],
};

export function drawConstellation(c: Ctx, k: Constellation, x: number, y: number, w: number, h: number, progress = -1, t = 0): void {
  const pts = CONSTELLATION_STARS[k].map(([px, py]) => [x + px * w, y + py * h] as const);
  c.strokeStyle = RUNE_COLORS[k];
  c.globalAlpha = 0.35;
  c.lineWidth = 1;
  c.setLineDash([2, 2]);
  c.beginPath();
  pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
  c.stroke();
  c.setLineDash([]);
  c.globalAlpha = 1;
  if (progress > 0) {
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.beginPath();
    pts.slice(0, progress).forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.stroke();
  }
  pts.forEach(([px, py], i) => {
    const lit = progress < 0 || i < progress;
    const next = i === progress;
    const r = next ? 3 + Math.sin(t * 8) : lit ? 2.5 : 2;
    c.fillStyle = next ? '#ffffff' : lit ? '#ffe27a' : '#8a7ab0';
    c.fillRect(Math.round(px - r), Math.round(py - 0.5), Math.round(r * 2), 1);
    c.fillRect(Math.round(px - 0.5), Math.round(py - r), 1, Math.round(r * 2));
    c.fillRect(Math.round(px - 1), Math.round(py - 1), 2, 2);
  });
}

export class ObservatoryModal implements Modal {
  done = false;
  pausesWorld = true;
  constructor(public owner: DeviceId, private host: MenuHost) {}
  update(_dt: number, input: Input): void {
    if (isConfirm(input, this.owner) || input.pressed(this.owner, 'cancel')) {
      this.done = true;
      audio.sfx('cancel');
    }
  }
  draw(c: Ctx): void {
    const s = this.host.state;
    const x = 12;
    const y = 10;
    const w = VW - 24;
    const h = VH - 20;
    panel(c, x, y, w, h, { fill: '#141030' });
    for (let i = 0; i < 40; i++) {
      c.fillStyle = i % 5 === 0 ? '#ffe27a' : '#8a7ab0';
      c.fillRect(x + 4 + ((i * 97) % (w - 8)), y + 4 + ((i * 61) % (h - 8)), 1, 1);
    }
    text(c, '별지기의 관측소 — 밤하늘 예보', x + 10, y + 6, { color: UI.gold });
    const k = constellationOf(s.day);
    text(c, `오늘 밤: ${CONSTELLATION_NAMES[k]}자리`, x + 10, y + 24, { color: RUNE_COLORS[k] });
    drawConstellation(c, k, x + 14, y + 42, 110, 64);
    wrap(c, CONSTELLATION_EFFECTS[k], 140, 10).forEach((l, i) => text(c, l, x + 140, y + 44 + i * 12, { size: 10 }));
    wrap(c, '맑은 밤 19시 이후, 별빛 지팡이를 들고 밭을 향해 쓰면 룬을 엮을 수 있다(마력 20). 룬은 그 밭의 작물을 수확할 때까지 남는다.', 200, 10).forEach((l, i) =>
      text(c, l, x + 140, y + 74 + i * 11, { size: 10, color: UI.dim }),
    );
    const fc = forecast(s.seed, s.day, 8);
    const cw = Math.floor((w - 20) / 8);
    fc.forEach((f, i) => {
      const cx = x + 10 + i * cw;
      const cy = y + 118;
      c.fillStyle = i === 0 ? 'rgba(200,168,255,0.2)' : 'rgba(255,255,255,0.04)';
      c.fillRect(cx, cy, cw - 3, 72);
      text(c, i === 0 ? '오늘' : `${SEASON_NAMES[seasonOf(f.day)]}${dayOfSeason(f.day)}`, cx + (cw - 3) / 2, cy + 3, { size: 10, align: 'center', color: UI.dim });
      drawMoon(c, cx + (cw - 3) / 2, cy + 22, f.moon, 6);
      text(c, MOON_SHORT[f.moon], cx + (cw - 3) / 2, cy + 31, { size: 10, align: 'center', color: '#fff4c0' });
      text(c, f.weather === 'rain' ? '비' : '맑음', cx + (cw - 3) / 2, cy + 43, { size: 10, align: 'center', color: f.weather === 'rain' ? UI.sky : UI.text });
      text(c, CONSTELLATION_NAMES[f.constellation].slice(0, 4), cx + (cw - 3) / 2, cy + 54, { size: 10, align: 'center', color: RUNE_COLORS[f.constellation] });
      const tag = f.solarEclipse ? '일식' : f.lunarEclipse ? '월식' : f.festival ? '축제' : '';
      if (tag) text(c, tag, cx + (cw - 3) / 2, cy + 64, { size: 10, align: 'center', color: f.festival ? UI.pink : '#ffb03a' });
    });
    keyHint(c, x + w - 8, y + 6, '확인/취소: 닫기', 'right');
  }
}

// ── 별자리 엮기 미니게임 ────────────────────────────
export class WeaveModal implements Modal {
  done = false;
  pausesWorld = true;
  private k: Constellation;
  private progress = 0;
  private time: number;
  private cx = VW / 2;
  private cy = VH / 2 + 20;
  private t = 0;
  private result: 'ok' | 'fail' | null = null;
  private endT = 0;
  private readonly area = { x: 92, y: 40, w: 200, h: 120 };
  constructor(
    public owner: DeviceId,
    private host: MenuHost,
    private player: Player,
    private tx: number,
    private ty: number,
    private radius: number,
    bonusTime: number,
    private onDone: (ok: boolean) => void,
  ) {
    this.k = constellationOf(host.state.day);
    this.time = 10 + bonusTime;
    const first = CONSTELLATION_STARS[this.k][0]!;
    this.cx = this.area.x + first[0] * this.area.w + 30;
    this.cy = this.area.y + first[1] * this.area.h + 30;
  }
  update(dt: number, input: Input): void {
    this.t += dt;
    if (this.result) {
      this.endT += dt;
      if (this.endT > 1.4 || (this.endT > 0.3 && isConfirm(input, this.owner))) {
        this.done = true;
        this.onDone(this.result === 'ok');
      }
      return;
    }
    if (input.pressed(this.owner, 'cancel')) {
      this.done = true;
      audio.sfx('cancel');
      return;
    }
    this.time -= dt;
    if (this.owner === 'kbm' && input.mouseActive()) {
      this.cx = input.mouse.x;
      this.cy = input.mouse.y;
    } else {
      const mv = input.move(this.owner);
      this.cx = Math.max(this.area.x - 10, Math.min(this.area.x + this.area.w + 10, this.cx + mv.x * 150 * dt));
      this.cy = Math.max(this.area.y - 10, Math.min(this.area.y + this.area.h + 10, this.cy + mv.y * 150 * dt));
    }
    const stars = CONSTELLATION_STARS[this.k];
    const [nx, ny] = stars[this.progress]!;
    const sx = this.area.x + nx * this.area.w;
    const sy = this.area.y + ny * this.area.h;
    if (Math.hypot(this.cx - sx, this.cy - sy) < 7) {
      this.progress++;
      audio.sfx('weaveStar', { pitch: 1 + this.progress * 0.12 });
      if (this.progress >= stars.length) {
        this.result = 'ok';
        const n = weaveRune(this.host.state, this.tx, this.ty, this.radius, this.k);
        this.player.mana = Math.max(0, this.player.mana - 20);
        audio.sfx('weaveSuccess');
        this.host.toast(`${CONSTELLATION_NAMES[this.k]} 룬을 밭 ${n}칸에 새겼다!`, RUNE_COLORS[this.k]);
        this.host.goal('weave');
      }
    }
    if (this.time <= 0 && !this.result) {
      this.result = 'fail';
      this.player.mana = Math.max(0, this.player.mana - 10);
      audio.sfx('weaveFail');
    }
  }
  draw(c: Ctx): void {
    c.fillStyle = 'rgba(8,6,24,0.92)';
    c.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 90; i++) {
      const tw = (Math.sin(this.t * 3 + i) + 1) / 2;
      c.fillStyle = tw > 0.7 ? '#ffffff' : '#6a5a9a';
      c.fillRect(Math.floor(noise(i, 3) * VW), Math.floor(noise(7, i) * VH), 1, 1);
    }
    text(c, `${CONSTELLATION_NAMES[this.k]}자리를 순서대로 이어라`, VW / 2, 10, { align: 'center', color: RUNE_COLORS[this.k] });
    bar(c, VW / 2 - 80, 26, 160, 3, this.time / 13, this.time < 3 ? UI.red : UI.gold);
    drawConstellation(c, this.k, this.area.x, this.area.y, this.area.w, this.area.h, this.progress, this.t);
    // 커서(별빛 지팡이 끝)
    c.fillStyle = '#ffe27a';
    c.fillRect(Math.round(this.cx) - 3, Math.round(this.cy), 7, 1);
    c.fillRect(Math.round(this.cx), Math.round(this.cy) - 3, 1, 7);
    c.fillStyle = '#ffffff';
    c.fillRect(Math.round(this.cx), Math.round(this.cy), 1, 1);
    if (this.result === 'ok') text(c, '룬이 밭에 내려앉았다!', VW / 2, VH - 36, { size: 14, align: 'center', color: UI.gold });
    else if (this.result === 'fail') text(c, '별빛이 흩어졌다… (마력 -10)', VW / 2, VH - 36, { size: 14, align: 'center', color: UI.red });
    else keyHint(c, VW / 2, VH - 16, this.owner === 'kbm' ? '마우스(또는 WASD)로 빛나는 별에 닿게 하세요 · Esc 취소' : '스틱/방향키로 빛나는 별에 닿게 하세요 · 취소 버튼', 'center');
    text(c, `마력 ${Math.round(this.player.mana)}/${MAX_MANA}`, 8, 8, { size: 10, color: '#9fb4ff' });
  }
}

// ── 헛간(교배) ─────────────────────────────────────
export class BarnModal implements Modal {
  done = false;
  pausesWorld = true;
  private nav: ListNav;
  private first: number | null = null;
  constructor(public owner: DeviceId, private host: MenuHost, private onBreed: (msg: string, mutated: boolean, variant: string) => void) {
    this.nav = new ListNav([], 9);
    this.refresh();
  }
  private refresh(): void {
    const s = this.host.state;
    this.nav.items = s.animals.map((a) => {
      const sp = SPECIES[a.species];
      const status = !isAdult(a) ? `새끼 ${sp.adultAge - a.ageDays}일` : a.cooldown > 0 ? `대기 ${a.cooldown}일` : '교배 가능';
      return { label: `${a.name} · ${sp.name}`, right: status, color: this.first === a.id ? UI.mint : undefined };
    });
  }
  update(_dt: number, input: Input): void {
    const r = this.nav.update(input, this.owner, { x: 30, y: 44, w: 170, rowH: 14 });
    if (r === 'cancel') {
      if (this.first !== null) {
        this.first = null;
        this.refresh();
      } else this.done = true;
      audio.sfx('cancel');
    } else if (r === 'confirm') {
      const s = this.host.state;
      const a = s.animals[this.nav.index];
      if (!a) return;
      if (this.first === null) {
        this.first = a.id;
        audio.sfx('blip');
      } else {
        const other = s.animals.find((x) => x.id === this.first)!;
        const why = canBreed(other, a);
        if (why) {
          audio.sfx('error');
          this.host.toast(why, UI.red);
        } else {
          const res = breed(s, other.id, a.id, this.host.rng);
          if (res.ok) {
            audio.sfx('fanfare');
            this.onBreed(`${res.child.name}(${SPECIES[res.child.species].name})가 태어났다! 변종: ${VARIANT_NAMES[res.child.variant]}`, res.mutated, res.child.variant);
          } else this.host.toast(res.msg, UI.red);
        }
        this.first = null;
      }
      this.refresh();
    }
  }
  draw(c: Ctx): void {
    const s = this.host.state;
    const x = 20;
    const y = 14;
    const w = VW - 40;
    const h = 178;
    panel(c, x, y, w, h);
    text(c, `헛간 · 가축 ${s.animals.length}/12`, x + 10, y + 6, { color: UI.gold });
    if (s.essenceBlessDays > 0) text(c, `정수 축복 ${s.essenceBlessDays}일 남음 · 돌연변이↑`, x + w - 10, y + 6, { align: 'right', size: 10, color: '#c06aff' });
    text(c, this.first === null ? '교배할 첫 번째 가축을 고르세요' : '두 번째 가축을 고르세요', x + 10, y + 20, { size: 10, color: UI.dim });
    this.nav.draw(c, 30, 44, 170, 14);
    const a = s.animals[this.nav.index];
    if (a) {
      const rx = x + 200;
      c.drawImage(animalSprite(a.species, a.variant, !isAdult(a), Math.floor(performance.now() / 400) % 2), rx, y + 30);
      text(c, a.name, rx + 30, y + 32, { color: UI.gold });
      text(c, VARIANT_NAMES[a.variant], rx + 30, y + 46, { size: 10, color: a.variant === 'standard' ? UI.dim : UI.pink });
      text(c, '애정', rx, y + 64, { size: 10, color: UI.dim });
      bar(c, rx + 26, y + 67, 100, 4, a.affection / 100, UI.pink);
      text(c, `나이 ${a.ageDays}일 · ${isAdult(a) ? '어른' : '새끼'}`, rx, y + 78, { size: 10, color: UI.dim });
      text(c, `생산: ${itemDef(SPECIES[a.species].product[a.variant]).name}`, rx, y + 90, { size: 10, color: UI.dim });
      wrap(c, '매일 쓰다듬으면 애정이 오르고(70 이상이면 ★별빛 생산물), 애정 40 이상인 어른끼리 교배할 수 있다. 정수 비료를 목장에 뿌리면 대기가 80% 줄고 돌연변이가 잦아진다.', w - 210, 10).forEach((l, i) =>
        text(c, l, rx, y + 106 + i * 11, { size: 10, color: '#a898c8' }),
      );
    }
    keyHint(c, x + w / 2, y + h - 12, '확인: 선택 · 취소: 뒤로', 'center');
  }
}

// ── 하루 결산 ───────────────────────────────────────
export class DaySummaryModal implements Modal {
  done = false;
  pausesWorld = true;
  private t = 0;
  constructor(public owner: DeviceId, private sum: DaySummary, private reason: string | null, private saveMsg: string) {}
  update(dt: number, input: Input): void {
    this.t += dt;
    if (this.t > 0.4 && (isConfirm(input, this.owner) || input.pressed(this.owner, 'cancel'))) {
      this.done = true;
      audio.sfx('confirm');
    }
  }
  draw(c: Ctx): void {
    c.fillStyle = '#0b0a1a';
    c.fillRect(0, 0, VW, VH);
    const x = 60;
    const y = 14;
    const w = VW - 120;
    panel(c, x, y, w, VH - 28);
    let ly = y + 8;
    if (this.reason) {
      text(c, this.reason, VW / 2, ly, { align: 'center', color: UI.red, size: 10 });
      ly += 14;
    }
    text(c, '하루 결산', VW / 2, ly, { align: 'center', color: UI.gold });
    ly += 18;
    const ship = this.sum.shipped.slice(0, 6);
    if (ship.length === 0) {
      text(c, '출하한 물건이 없다.', VW / 2, ly, { align: 'center', size: 10, color: UI.dim });
      ly += 14;
    }
    for (const l of ship) {
      c.drawImage(itemIcon(l.id), x + 12, ly - 4);
      text(c, `${displayName(l.id, l.q)} ×${l.n}`, x + 32, ly, { size: 10 });
      text(c, `${l.value.toLocaleString('ko-KR')}G`, x + w - 12, ly, { size: 10, align: 'right', color: UI.gold });
      ly += 15;
    }
    if (this.sum.shipped.length > 6) {
      text(c, `외 ${this.sum.shipped.length - 6}종`, x + 32, ly, { size: 10, color: UI.dim });
      ly += 13;
    }
    c.fillStyle = UI.borderDim;
    c.fillRect(x + 10, ly + 2, w - 20, 1);
    ly += 8;
    text(c, '수입', x + 12, ly);
    text(c, `${this.sum.income.toLocaleString('ko-KR')}G`, x + w - 12, ly, { align: 'right', color: UI.gold });
    ly += 14;
    if (this.sum.penalty > 0) {
      text(c, '치료비', x + 12, ly, { color: UI.red });
      text(c, `-${this.sum.penalty}G`, x + w - 12, ly, { align: 'right', color: UI.red });
      ly += 14;
    }
    const notes: string[] = [];
    if (this.sum.grown) notes.push(`작물 ${this.sum.grown}포기가 자랐다`);
    if (this.sum.bloomed) notes.push(`달빛 장미 ${this.sum.bloomed}송이 개화`);
    if (this.sum.withered) notes.push(`계절이 바뀌어 ${this.sum.withered}포기가 시들었다`);
    if (this.sum.rainToday) notes.push('오늘은 비가 내려 밭에 물이 들어갔다');
    notes.forEach((n, i) => text(c, n, x + 12, ly + i * 12, { size: 10, color: UI.mint }));
    const nd = this.sum.endedDay + 1;
    const k = constellationOf(nd);
    const tags = [isSolarEclipse(nd) ? '일식(11~15시)' : '', isLunarEclipse(nd) ? '개기월식' : '', isFullMoon(nd) ? '보름달' : '', isFestivalDay(nd) ? '별빛 수확제' : ''].filter(Boolean).join(' · ');
    text(c, `→ ${formatDate(nd)} · ${this.sum.rainToday ? '비' : '맑음'} · 오늘 밤 ${CONSTELLATION_NAMES[k]}`, VW / 2, VH - 54, { align: 'center', size: 10, color: RUNE_COLORS[k] });
    if (tags) text(c, tags, VW / 2, VH - 42, { align: 'center', size: 10, color: '#ffb03a' });
    text(c, this.saveMsg, VW / 2, VH - 28, { align: 'center', size: 10, color: UI.dim });
  }
}

// ── 일시정지 메뉴와 하위 화면 ────────────────────────
export class ListMenuModal implements Modal {
  done = false;
  pausesWorld = true;
  private nav: ListNav;
  constructor(public owner: DeviceId, private title: string, private items: { label: string; act: () => void; disabled?: boolean }[], private sub = '') {
    this.nav = new ListNav(items.map((i) => ({ label: i.label, disabled: i.disabled })), 10);
  }
  update(_dt: number, input: Input): void {
    const r = this.nav.update(input, this.owner, { x: this.x + 8, y: this.y + 26, w: 160, rowH: 16 });
    if (r === 'cancel' || input.pressed(this.owner, 'pause')) {
      this.done = true;
      audio.sfx('cancel');
    } else if (r === 'confirm') {
      audio.sfx('confirm');
      this.items[this.nav.index]!.act();
    }
  }
  private x = 0;
  private y = 0;
  draw(c: Ctx): void {
    const w = 180;
    const h = 36 + this.items.length * 16 + (this.sub ? 12 : 0);
    this.x = Math.round((VW - w) / 2);
    this.y = Math.round((VH - h) / 2);
    panel(c, this.x, this.y, w, h);
    text(c, this.title, this.x + w / 2, this.y + 7, { align: 'center', color: UI.gold });
    this.nav.draw(c, this.x + 8, this.y + 26, w - 16);
    if (this.sub) text(c, this.sub, this.x + w / 2, this.y + h - 14, { size: 10, align: 'center', color: UI.dim });
  }
}

export class InfoModal implements Modal {
  done = false;
  pausesWorld = true;
  private scroll = 0;
  constructor(public owner: DeviceId, private title: string, private body: () => string[]) {}
  update(_dt: number, input: Input): void {
    if (input.nav(this.owner, 'down')) this.scroll++;
    if (input.nav(this.owner, 'up')) this.scroll = Math.max(0, this.scroll - 1);
    if (this.owner === 'kbm' && input.mouse.wheel) this.scroll = Math.max(0, this.scroll + input.mouse.wheel);
    if (isConfirm(input, this.owner) || input.pressed(this.owner, 'cancel')) {
      this.done = true;
      audio.sfx('cancel');
    }
  }
  draw(c: Ctx): void {
    const x = 20;
    const y = 10;
    const w = VW - 40;
    const h = VH - 20;
    panel(c, x, y, w, h);
    text(c, this.title, x + 10, y + 6, { color: UI.gold });
    const lines: { s: string; head: boolean }[] = [];
    for (const raw of this.body()) {
      const head = raw.startsWith('# ');
      for (const l of wrap(c, head ? raw.slice(2) : raw, w - 24, 10)) lines.push({ s: l, head });
    }
    const max = Math.floor((h - 40) / 12);
    this.scroll = Math.min(this.scroll, Math.max(0, lines.length - max));
    lines.slice(this.scroll, this.scroll + max).forEach((l, i) => text(c, l.s, x + 12, y + 24 + i * 12, { size: 10, color: l.head ? UI.pink : UI.text }));
    keyHint(c, x + w - 10, y + 7, lines.length > max ? '↑↓ 스크롤 · 확인 닫기' : '확인: 닫기', 'right');
  }
}

export function goalsBody(s: GameState): string[] {
  const rank = villageRank(s);
  const out = [`# 마을 등급 ${rank} · ${VILLAGE_RANK_NAMES[rank]} (목표 ${goalsDone(s)}/${GOALS.length})`, '목표 둘을 이룰 때마다 광장이 꾸며진다: 꽃상자 → 등불 → 깃발 → 별가루 분수 → 별빛 아치. 등급 3부터 잡화점에 그림자 연꽃 씨앗이 들어온다.', ''];
  for (const g of GOALS) out.push(`${s.goals[g.id] ? '★' : '☆'} ${g.name} — ${g.hint}`);
  out.push('', '# 기록');
  out.push(`출하 ${s.stats.shipped}개 · 수입 ${s.stats.earned.toLocaleString('ko-KR')}G · 수확 ${s.stats.harvested} · 룬 ${s.stats.woven}회`);
  out.push(`처치 ${s.stats.kills} · 교배 ${s.stats.bred} · 제작 ${s.stats.crafted} · 광산 최고 ${s.mine.deepest}층`);
  return out;
}

export const CONTROLS_BODY = [
  '# 키보드·마우스 (1P)',
  'WASD 이동 · J 또는 왼쪽 클릭: 선택한 도구 사용 / 광산에선 공격',
  'E: 상호작용(대화·수확·쓰다듬기) · Space/K: 대시 · L 또는 오른쪽 클릭: 별빛 베기(광산)',
  'Q: 물약·음식 사용 · 1~0 / 휠 / Z·C: 핫바 선택 · Tab/I: 가방 · Esc: 메뉴',
  '마우스를 움직이면 도구 대상 칸과 공격 방향을 마우스로 정한다.',
  '# 키보드 오른쪽 (2P)',
  '방향키 이동 · . 사용/공격 · / 대시 · ; 별빛 베기 · Enter 상호작용 · \' 물약 · [ ] 핫바 · \\ 가방',
  '# 게임패드',
  '왼스틱 이동 · 오른스틱 조준 · X 사용/공격 · A 상호작용 · B 대시 · Y 별빛 베기 · RT 물약 · LB/RB 핫바 · Back 가방 · Start 메뉴',
  '# 협동 플레이',
  '플레이 중 게임패드의 Start/A 또는 키보드 Enter(1P가 키보드일 때는 방향키 2P)를 누르면 최대 4명까지 참가한다. 가방과 골드는 함께 쓴다.',
  '# 전투 요령',
  '공격을 연타하면 3단 콤보(마지막은 넓고 강한 회전베기). 대시 직후 공격하면 돌진 베기. 적의 탄은 칼로 베어 없앨 수 있고, 근접 적중과 탄 베기는 마력을 채운다.',
  '적이 깜박이거나 바닥에 붉은 표시가 생기면 공격 직전이다. 대시 중에는 무적.',
  '# 농사 요령',
  '괭이 → 씨앗 → 물(물뿌리개, 또는 지팡이로 넓게). 다 자라면 E로 수확해 출하함에 넣는다.',
  '맑은 밤엔 지팡이로 오늘 밤 별자리 룬을 엮는다. 관측소에서 8일 예보를 볼 수 있다.',
];
