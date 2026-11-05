import { appearanceToLook, charSprite, type Dir } from '../art/characters';
import { animalSprite, monsterSprite } from '../art/creatures';
import {
  bannerSprite,
  barnSprite,
  benchSprite,
  cauldronSprite,
  flowerBoxSprite,
  fountainSprite,
  houseSprite,
  lanternSprite,
  mineEntranceSprite,
  observatorySprite,
  shippingBinSprite,
  shopSprite,
  stageSprite,
  starArchSprite,
  telescopeSprite,
} from '../art/buildings';
import { itemIcon } from '../art/icons';
import { hexToRgb, makeCanvas } from '../art/pixel';
import {
  cliffTile,
  cobbleTile,
  cropSprite,
  farmlandTile,
  fenceSprite,
  flowerTile,
  grassTile,
  mineFloorTile,
  mineWallTile,
  pathTile,
  portalSprite,
  rockSprite,
  runeOverlay,
  RUNE_COLORS,
  sandTile,
  soilTile,
  stairsSprite,
  treeSprite,
  waterTile,
} from '../art/world';
import { SPECIES } from '../data/animals';
import { cropDef } from '../data/crops';
import { displayName, itemDef } from '../data/items';
import { NPCS, type NpcDef } from '../data/npcs';
import { audio, type MusicTrack } from '../engine/audio';
import type { DeviceId, Input } from '../engine/input';
import { Rng } from '../engine/rng';
import { TILE, VH, VW } from '../engine/screen';
import {
  DAY_END,
  FESTIVAL_END,
  FESTIVAL_START,
  isFestivalDay,
  isNight,
  NIGHT_START,
  seasonOf,
  solarEclipseActive,
  weatherOf,
  canWeave,
} from '../sim/calendar';
import {
  bloomUnderFullMoon,
  fertilizePlot,
  getPlot,
  growthStage,
  harvest,
  irrigate,
  isHarvestable,
  plant,
  till,
  water,
} from '../sim/farm';
import { villageRank } from '../sim/goals';
import { josa } from '../ui/josa';
import { addItem, countItem, removeItem } from '../sim/inventory';
import { blessPasture, isAdult, petAnimal } from '../sim/livestock';
import {
  MAX_ENERGY,
  MAX_HP,
  MAX_MANA,
  plotKey,
  SWORD_DAMAGE,
  type GameState,
} from '../sim/state';
import type { GoalId } from '../data/goals';
import {
  AnimalEnt,
  NpcEnt,
  Player,
  type Floater,
  type Particle,
  type Pickup,
  type Projectile,
  type SlashFx,
  type Telegraph,
} from './entities';
import {
  buildFarm,
  buildVillage,
  groundAt,
  PASTURE,
  type GameMap,
  type Interaction,
  type MapId,
  type MapObj,
} from './maps';
import {
  genMineFloor,
  MATRIARCH_FLOOR,
  Monster,
  updateMonster,
  WYRM_FLOOR,
  type MineCtx,
  type MineFloor,
  type MonsterType,
} from './mine';

/** 실제 1초에 흐르는 게임 분 */
export const MIN_PER_SEC = 2.2;
const PLAYER_SPEED = 78;

export interface WorldHost {
  state: GameState;
  input: Input;
  rng: Rng;
  settings: { shake: boolean };
  toast(msg: string, color?: string): void;
  goal(id: GoalId): void;
  endDay(fainted: boolean, reason?: string): void;
  talkTo(npc: NpcEnt, p: Player): void;
  interact(kind: Interaction, p: Player, obj: MapObj | null): void;
  openWeave(p: Player, tx: number, ty: number): void;
  openInventory(p: Player): void;
  openPause(p: Player): void;
  bossDefeated(type: MonsterType): void;
  floorCleared(floor: number): void;
}

interface Drawable {
  y: number;
  draw: (c: CanvasRenderingContext2D) => void;
}

export class World {
  map!: GameMap;
  players: Player[] = [];
  animals: AnimalEnt[] = [];
  npcs: NpcEnt[] = [];
  monsters: Monster[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  pickups: Pickup[] = [];
  telegraphs: Telegraph[] = [];
  slashes: SlashFx[] = [];
  camX = 0;
  camY = 0;
  shakeT = 0;
  shakeMag = 0;
  hitstop = 0;
  t = 0;
  fade = 0;
  private fadeDir = 0;
  private fadeMid: (() => void) | null = null;
  private queued: (() => void) | null = null;
  solid = new Uint8Array(0);
  mine: MineFloor | null = null;
  private waveIdx = 0;
  private waveDelay = 0;
  floorCleared = false;
  bossName = '';
  wyrmDark = false;
  private light: { c: HTMLCanvasElement; x: CanvasRenderingContext2D };
  private farmMap = buildFarm();
  private villageMap = buildVillage();
  private shownRank = -1;
  private lastEclipse = false;
  private lastBloomCheck = -1;
  hurtFlash = 0;
  prompt = '';

  constructor(private host: WorldHost) {
    this.light = makeCanvas(VW, VH);
  }

  get s(): GameState {
    return this.host.state;
  }

  // ── 플레이어 ─────────────────────────────────────
  addPlayer(dev: DeviceId): Player {
    const idx = this.players.length;
    const s = this.s;
    const guestLooks = [
      { hair: '#3a2a2a', outfit: '#5a9ae0', accent: '#ffffff', eyes: '#3a8ad8', hairStyle: 0 },
      { hair: '#ffe27a', outfit: '#7fd0a0', accent: '#ff8ab8', eyes: '#8a4fc7', hairStyle: 2 },
      { hair: '#2a3a6a', outfit: '#ffb03a', accent: '#3a3a8a', eyes: '#ff6a3a', hairStyle: 4 },
    ];
    const look =
      idx === 0
        ? appearanceToLook(s.appearance)
        : appearanceToLook({ ...s.appearance, ...guestLooks[(idx - 1) % 3]!, pattern: null, patternOnShirt: false });
    const lead = this.players[0];
    const p = new Player(idx, dev, look, idx === 0 && s.appearance.patternOnShirt ? s.appearance.pattern : null, lead ? lead.x + 12 : 0, lead ? lead.y : 0);
    p.slot = idx === 0 ? 0 : 3;
    this.players.push(p);
    return p;
  }

  removePlayer(idx: number): void {
    if (idx === 0) return;
    this.players.splice(idx, 1);
    this.players.forEach((p, i) => (p.index = i));
  }

  refreshPlayerLook(): void {
    const p = this.players[0];
    if (!p) return;
    p.look = appearanceToLook(this.s.appearance);
    p.pattern = this.s.appearance.patternOnShirt ? this.s.appearance.pattern : null;
  }

  restoreForNewDay(): void {
    for (const p of this.players) {
      p.hp = MAX_HP;
      p.energy = MAX_ENERGY;
      p.mana = MAX_MANA;
      p.downed = false;
      p.buffs = { aegis: 0, gale: 0, eclipse: 0 };
    }
  }

  // ── 맵 전환 ─────────────────────────────────────
  enter(id: MapId, spawn?: { tx: number; ty: number }, floor = 1): void {
    this.monsters = [];
    this.projectiles = [];
    this.pickups = [];
    this.telegraphs = [];
    this.slashes = [];
    this.particles = [];
    this.wyrmDark = false;
    this.bossName = '';
    this.mine = null;
    if (id === 'farm') this.map = this.farmMap;
    else if (id === 'village') this.map = this.villageMap;
    else {
      this.mine = genMineFloor(floor, this.s.seed + this.s.day * 131);
      this.map = this.mine.map;
      this.waveIdx = 0;
      this.waveDelay = 1.0;
      this.floorCleared = false;
      if (this.mine.boss) this.bossName = '';
    }
    const sp = spawn ?? this.map.spawn;
    this.players.forEach((p, i) => {
      p.x = sp.tx * TILE + TILE / 2 + (i % 2) * 14 - (i > 1 ? 14 : 0);
      p.y = sp.ty * TILE + TILE - 2 + Math.floor(i / 2) * 8;
      p.attackT = 0;
      p.dashT = 0;
      p.kbx = p.kby = 0;
    });
    this.rebuildSolid();
    this.spawnAnimals();
    this.placeNpcs(true);
    this.updateCamera(true);
    this.pickMusic();
  }

  /** 페이드아웃 → 전환 → 페이드인 */
  /**
   * 화면 전환. force=true(하루 마감 등 반드시 일어나야 하는 전환)는 다른 전환이 진행 중이면
   * 그것이 끝난 뒤 이어서 실행한다. 일반 전환(출구·계단)은 진행 중이면 무시한다.
   */
  transition(fn: () => void, force = false): void {
    if (this.fadeDir !== 0) {
      if (force) this.queued = fn;
      return;
    }
    this.fadeDir = 1;
    this.fadeMid = fn;
    audio.sfx('door');
  }

  get transitioning(): boolean {
    return this.fadeDir !== 0;
  }

  enterMineFloor(floor: number): void {
    this.transition(() => this.enter('mine', undefined, floor));
  }

  isShown(o: MapObj): boolean {
    if (!o.show) return true;
    const r = villageRank(this.s);
    switch (o.show) {
      case 'rank1': return r >= 1;
      case 'rank2': return r >= 2 || isFestivalDay(this.s.day);
      case 'rank3': return r >= 3 || isFestivalDay(this.s.day);
      case 'rank4': return r >= 4;
      case 'rank5': return r >= 5;
      case 'festival': return isFestivalDay(this.s.day);
      case 'banner': return this.s.bannerPlaced;
    }
  }

  rebuildSolid(): void {
    const m = this.map;
    this.solid = new Uint8Array(m.w * m.h);
    this.solid.set(m.blocked);
    for (const o of m.objects) {
      if (!o.solid || !this.isShown(o)) continue;
      for (let y = o.ty; y < o.ty + o.th; y++) for (let x = o.tx; x < o.tx + o.tw; x++) if (x >= 0 && y >= 0 && x < m.w && y < m.h) this.solid[y * m.w + x] = 1;
    }
    this.shownRank = villageRank(this.s);
  }

  solidAtPx(px: number, py: number): boolean {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return true;
    return this.solid[ty * this.map.w + tx] === 1;
  }

  private spawnAnimals(): void {
    if (this.map.id !== 'farm') {
      this.animals = [];
      return;
    }
    const keep = new Map(this.animals.map((a) => [a.data.id, a]));
    this.animals = this.s.animals.map((a, i) => {
      const old = keep.get(a.id);
      if (old) {
        old.data = a;
        return old;
      }
      const x = (PASTURE.x + 1 + (i * 3) % (PASTURE.w - 2)) * TILE;
      const y = (PASTURE.y + 1 + Math.floor((i * 3) / (PASTURE.w - 2)) * 2) * TILE;
      return new AnimalEnt(a, x, y);
    });
  }

  syncAnimals(): void {
    this.spawnAnimals();
  }

  // ── 마을 주민 ─────────────────────────────────────
  private npcTarget(def: NpcDef): { x: number; y: number } | null {
    const s = this.s;
    if (isFestivalDay(s.day) && s.minutes >= FESTIVAL_START && s.minutes < FESTIVAL_END) {
      const spots: Record<string, { x: number; y: number }> = { lyra: { x: 18, y: 12 }, bram: { x: 25, y: 13 }, sol: { x: 27, y: 11 }, nova: { x: 21, y: 11 } };
      return spots[def.id] ?? null;
    }
    let at: { x: number; y: number } | null = null;
    for (const st of def.schedule) if (s.minutes >= st.from) at = st.at;
    return at;
  }

  private placeNpcs(snap: boolean): void {
    if (this.map.id !== 'village') {
      this.npcs = [];
      return;
    }
    if (this.npcs.length === 0) this.npcs = NPCS.map((d) => new NpcEnt(d));
    for (const n of this.npcs) {
      const tgt = this.npcTarget(n.def);
      if (!tgt) {
        n.visible = false;
        continue;
      }
      const px = tgt.x * TILE + TILE / 2;
      const py = tgt.y * TILE + TILE - 2;
      if (snap || !n.visible) {
        n.x = px;
        n.y = py;
        n.visible = true;
      }
      n.tx = px;
      n.ty = py;
    }
  }

  // ── 갱신 ─────────────────────────────────────────
  update(dt: number, paused: boolean): void {
    // 페이드는 메뉴가 열려 있어도 진행
    if (this.fadeDir !== 0) {
      this.fade += this.fadeDir * dt * 4;
      if (this.fadeDir > 0 && this.fade >= 1) {
        this.fade = 1;
        this.fadeMid?.();
        this.fadeMid = null;
        this.fadeDir = -1;
      } else if (this.fadeDir < 0 && this.fade <= 0) {
        this.fade = 0;
        this.fadeDir = 0;
        const q = this.queued;
        this.queued = null;
        if (q) this.transition(q, true);
      }
    }
    if (paused) {
      this.prompt = '';
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.t += dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    this.advanceClock(dt);
    if (this.fadeDir !== 0) return;
    if (this.shownRank !== villageRank(this.s)) this.rebuildSolid();

    for (const p of this.players) this.updatePlayer(p, dt);
    this.updateRevive(dt);
    if (this.map.id === 'farm') this.updateAnimals(dt);
    if (this.map.id === 'village') this.updateNpcs(dt);
    if (this.mine) this.updateMine(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateFx(dt);
    this.updateCamera(false);
    this.checkExits();
    this.updatePrompt();
  }

  private advanceClock(dt: number): void {
    const s = this.s;
    const before = s.minutes;
    s.minutes += dt * MIN_PER_SEC;
    if (Math.floor(before / 60) !== Math.floor(s.minutes / 60)) {
      if (this.map.id === 'village') this.placeNpcs(false);
      this.pickMusic();
    }
    if (before < NIGHT_START && s.minutes >= NIGHT_START) {
      const n = bloomUnderFullMoon(s, s.day, s.minutes);
      if (n > 0) this.host.toast(`보름달 아래 달빛 장미 ${n}송이가 피었다!`, '#9fd8ff');
      if (canWeave(s.seed, s.day, s.minutes) && this.map.id !== 'mine') this.host.toast('별이 떴다. 별빛 지팡이로 별자리 룬을 엮을 수 있다.', '#ffe27a');
    }
    if (this.lastBloomCheck !== s.day && isNight(s.minutes)) {
      this.lastBloomCheck = s.day;
      bloomUnderFullMoon(s, s.day, s.minutes);
    }
    const ecl = solarEclipseActive(s.day, s.minutes);
    if (ecl !== this.lastEclipse) {
      this.lastEclipse = ecl;
      if (ecl) this.host.toast('일식이다! 태양 밀을 거두면 ☀일식 등급이 된다.', '#ffb03a');
      this.pickMusic();
    }
    if (isFestivalDay(s.day) && before < FESTIVAL_START && s.minutes >= FESTIVAL_START) {
      this.host.toast('마을 광장에서 별빛 수확제가 시작됐다!', '#ff8ab8');
      if (this.map.id === 'village') this.rebuildSolid();
    }
    if (before < 24 * 60 && s.minutes >= 24 * 60) this.host.toast('자정이 지났다. 새벽 2시 전에 잠자리에 들자.', '#ff6a7a');
    if (s.minutes >= DAY_END) {
      s.minutes = DAY_END;
      this.host.endDay(true, '새벽 2시. 너무 피곤해 그 자리에서 쓰러졌다…');
    }
  }

  pickMusic(): void {
    const s = this.s;
    let tr: MusicTrack;
    if (this.map.id === 'mine') tr = this.mine?.boss ? 'boss' : 'mine';
    else if (solarEclipseActive(s.day, s.minutes)) tr = 'eclipse';
    else if (this.map.id === 'village' && isFestivalDay(s.day) && s.minutes >= FESTIVAL_START && s.minutes < FESTIVAL_END) tr = 'festival';
    else if (isNight(s.minutes)) tr = 'farmNight';
    else tr = this.map.id === 'village' ? 'village' : 'farmDay';
    audio.music(tr);
  }

  // ── 플레이어 ─────────────────────────────────────
  private aimOf(p: Player): { x: number; y: number } {
    const inp = this.host.input;
    if (p.dev === 'kbm' && inp.mouseActive()) {
      const wx = inp.mouse.x + this.camX;
      const wy = inp.mouse.y + this.camY;
      const d = Math.hypot(wx - p.x, wy - (p.y - 8)) || 1;
      return { x: (wx - p.x) / d, y: (wy - (p.y - 8)) / d };
    }
    const st = inp.stickAim(p.dev);
    if (st) {
      const d = Math.hypot(st.x, st.y);
      return { x: st.x / d, y: st.y / d };
    }
    const mv = inp.move(p.dev);
    if (Math.hypot(mv.x, mv.y) > 0.3) {
      const d = Math.hypot(mv.x, mv.y);
      return { x: mv.x / d, y: mv.y / d };
    }
    return { x: p.lastAimX, y: p.lastAimY };
  }

  private updatePlayer(p: Player, dt: number): void {
    const inp = this.host.input;
    const dev = p.dev;
    p.animT += dt;
    for (const k of ['aegis', 'gale', 'eclipse'] as const) if (p.buffs[k] > 0) p.buffs[k] -= dt;
    if (p.iframes > 0) p.iframes -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.magicCd > 0) p.magicCd -= dt;
    if (p.dashStrikeWindow > 0) p.dashStrikeWindow -= dt;
    if (p.toolT > 0) p.toolT -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.comboWindow > 0) {
      p.comboWindow -= dt;
      if (p.comboWindow <= 0) p.comboStep = 0;
    }
    if (p.downed) return;

    // 메뉴·선택
    if (inp.pressed(dev, 'pause')) return this.host.openPause(p);
    if (inp.pressed(dev, 'inventory')) return this.host.openInventory(p);
    if (inp.pressed(dev, 'next')) this.changeSlot(p, 1);
    if (inp.pressed(dev, 'prev')) this.changeSlot(p, -1);
    if (dev === 'kbm') {
      const hk = inp.hotbarKey();
      if (hk !== null) p.slot = hk;
    }

    // 이동
    let speed = PLAYER_SPEED * (p.buffs.gale > 0 ? 1.25 : 1);
    if (p.energy <= 0) speed *= 0.65;
    const g = groundAt(this.map, Math.floor(p.x / TILE), Math.floor((p.y - 2) / TILE));
    const wasSwim = p.swimming;
    p.swimming = g === 'water';
    if (p.swimming) speed *= 0.62;
    if (p.swimming !== wasSwim) this.splash(p.x, p.y);
    if (p.attacking) speed *= 0.3;
    if (p.toolT > 0) speed = 0;
    const mv = inp.move(dev);
    let vx = mv.x * speed;
    let vy = mv.y * speed;
    p.moving = Math.hypot(mv.x, mv.y) > 0.1 && p.toolT <= 0;
    if (p.moving && !p.attacking) {
      if (Math.abs(mv.x) > Math.abs(mv.y)) p.facing = mv.x < 0 ? 'left' : 'right';
      else p.facing = mv.y < 0 ? 'up' : 'down';
      const d = Math.hypot(mv.x, mv.y);
      p.lastAimX = mv.x / d;
      p.lastAimY = mv.y / d;
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      const ds = 270 * (p.buffs.gale > 0 ? 1.15 : 1);
      vx = p.dashX * ds;
      vy = p.dashY * ds;
      if (Math.random() < 0.6) this.particles.push({ x: p.x, y: p.y - 6, vx: 0, vy: 0, life: 0.25, max: 0.25, color: p.look.hair, size: 2 });
    }
    if (Math.abs(p.kbx) + Math.abs(p.kby) > 1) {
      vx += p.kbx;
      vy += p.kby;
      p.kbx *= Math.pow(0.001, dt);
      p.kby *= Math.pow(0.001, dt);
    }
    this.movePlayer(p, vx * dt, vy * dt);

    // 행동
    if (inp.pressed(dev, 'dash') && p.dashCd <= 0 && !p.swimming && p.toolT <= 0) {
      const a = Math.hypot(mv.x, mv.y) > 0.2 ? { x: mv.x, y: mv.y } : { x: p.lastAimX, y: p.lastAimY };
      const d = Math.hypot(a.x, a.y) || 1;
      p.dashX = a.x / d;
      p.dashY = a.y / d;
      p.dashT = 0.15;
      p.dashCd = p.buffs.gale > 0 ? 0.28 : 0.45;
      p.dashStrikeWindow = 0.3;
      p.attackT = 0;
      audio.sfx('dash');
    }
    if (this.mine) {
      if (inp.pressed(dev, 'use')) this.startAttack(p);
      if (inp.pressed(dev, 'magic')) this.castSlice(p);
      if (inp.pressed(dev, 'item')) this.useConsumable(p, p.slot);
    } else {
      if (inp.pressed(dev, 'use')) this.useSelected(p);
      if (inp.pressed(dev, 'item')) this.useConsumable(p, p.slot);
    }
    if (inp.pressed(dev, 'interact')) this.interact(p);
    if (p.attacking) this.updateAttack(p, dt);
  }

  private changeSlot(p: Player, d: number): void {
    p.slot = (p.slot + d + 10) % 10;
    audio.sfx('blip', { volume: 0.5 });
  }

  private movePlayer(p: Player, dx: number, dy: number): void {
    const hw = 4;
    const tryMove = (nx: number, ny: number) =>
      !this.solidAtPx(nx - hw, ny - 5) && !this.solidAtPx(nx + hw, ny - 5) && !this.solidAtPx(nx - hw, ny) && !this.solidAtPx(nx + hw, ny);
    if (dx !== 0 && tryMove(p.x + dx, p.y)) p.x += dx;
    if (dy !== 0 && tryMove(p.x, p.y + dy)) p.y += dy;
    // 협동: 카메라 밖으로 나가지 않게
    if (this.players.length > 1) {
      p.x = Math.max(this.camX + 8, Math.min(this.camX + VW - 8, p.x));
      p.y = Math.max(this.camY + 20, Math.min(this.camY + VH - 4, p.y));
    }
  }

  playerTile(p: Player): { tx: number; ty: number } {
    return { tx: Math.floor(p.x / TILE), ty: Math.floor((p.y - 4) / TILE) };
  }

  /** 도구를 쓸 칸: 마우스가 가까우면 마우스 칸, 아니면 바라보는 앞 칸 */
  targetTile(p: Player): { tx: number; ty: number } {
    const { tx, ty } = this.playerTile(p);
    const inp = this.host.input;
    if (p.dev === 'kbm' && inp.mouseActive()) {
      const mx = Math.floor((inp.mouse.x + this.camX) / TILE);
      const my = Math.floor((inp.mouse.y + this.camY) / TILE);
      if (Math.max(Math.abs(mx - tx), Math.abs(my - ty)) <= 1) return { tx: mx, ty: my };
    }
    const f = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing];
    return { tx: tx + f[0]!, ty: ty + f[1]! };
  }

  private spendEnergy(p: Player, n: number): void {
    p.energy = Math.max(0, p.energy - n);
    if (p.energy === 0) this.host.toast('기력이 바닥났다. 무언가 먹거나 잠을 자자.', '#ff6a7a');
  }

  /** 농장·마을에서 선택한 아이템 사용 */
  private useSelected(p: Player): void {
    const s = this.s;
    const st = s.inventory[p.slot];
    if (!st || p.toolT > 0) return;
    const def = itemDef(st.id);
    const { tx, ty } = this.targetTile(p);
    const onFarm = this.map.id === 'farm';
    const faceTo = () => {
      const pt = this.playerTile(p);
      const dx = tx - pt.tx;
      const dy = ty - pt.ty;
      if (dx === 0 && dy === 0) return;
      if (Math.abs(dx) >= Math.abs(dy)) p.facing = dx < 0 ? 'left' : 'right';
      else p.facing = dy < 0 ? 'up' : 'down';
    };
    if (def.kind === 'tool') {
      faceTo();
      p.toolKind = st.id;
      p.toolT = 0.22;
      if (st.id === 'sword') {
        this.startAttack(p);
        return;
      }
      if (!onFarm) return this.host.toast('농장에서 쓰는 도구다.');
      if (st.id === 'hoe') {
        const g = groundAt(this.map, tx, ty);
        const plot = getPlot(s, tx, ty);
        if (g !== 'farmland') return void audio.sfx('error', { volume: 0.4 });
        if (plot && !plot.crop?.dead) return void this.host.toast('이미 갈아 둔 밭이다.');
        const r = till(s, tx, ty);
        if (r.ok) {
          this.spendEnergy(p, 2);
          audio.sfx('till');
          this.dirt(tx, ty);
          if (r.msg) this.host.toast(r.msg);
        }
      } else if (st.id === 'can') {
        if (water(s, tx, ty)) {
          this.spendEnergy(p, 1);
          audio.sfx('water');
          this.splash(tx * TILE + 8, ty * TILE + 10);
        } else audio.sfx('error', { volume: 0.4 });
      } else if (st.id === 'staff') {
        this.useStaff(p, tx, ty);
      }
      return;
    }
    if (def.kind === 'seed') {
      if (!onFarm) return;
      const r = plant(s, tx, ty, st.id);
      if (!r.ok) {
        audio.sfx('error');
        return this.host.toast(r.msg);
      }
      removeItem(s.inventory, st.id, 1);
      audio.sfx('plant');
      faceTo();
      p.toolT = 0.15;
      this.host.goal('till');
      return;
    }
    if (def.kind === 'fertilizer') {
      if (!onFarm) return;
      const inPasture = this.inPasturePx(p.x, p.y) || this.inPastureTile(tx, ty);
      if (getPlot(s, tx, ty)?.crop) {
        const r = fertilizePlot(s, tx, ty);
        if (!r.ok) return this.host.toast(r.msg);
        removeItem(s.inventory, 'fertilizer', 1);
        audio.sfx('magic');
        this.sparkle(tx * TILE + 8, ty * TILE + 8, '#c06aff', 12);
        this.host.goal('fertilizer');
      } else if (inPasture) {
        const n = blessPasture(s);
        removeItem(s.inventory, 'fertilizer', 1);
        audio.sfx('weaveSuccess');
        for (const a of this.animals) this.sparkle(a.x, a.y - 8, '#c06aff', 8);
        this.host.toast(`목장에 정수 비료를 뿌렸다. 교배 대기 단축 ${n}마리 · 3일간 돌연변이 확률 상승`, '#c06aff');
        this.host.goal('fertilizer');
      } else this.host.toast('자라는 작물이나 목장 안에서 쓸 수 있다.');
      return;
    }
    this.useConsumable(p, p.slot);
  }

  private useStaff(p: Player, tx: number, ty: number): void {
    const s = this.s;
    if (isNight(s.minutes)) {
      if (!canWeave(s.seed, s.day, s.minutes)) return this.host.toast('구름에 가려 별자리가 보이지 않는다.');
      if (p.mana < 20) return this.host.toast('마력이 부족하다(20 필요).', '#9fd8ff');
      return this.host.openWeave(p, tx, ty);
    }
    if (p.mana < 15) return this.host.toast('마력이 부족하다(15 필요).', '#9fd8ff');
    const radius = s.staffLevel > 0 ? 3 : 2;
    const n = irrigate(s, tx, ty, radius);
    if (n === 0) return this.host.toast('주변에 물이 필요한 밭이 없다.');
    p.mana -= 15;
    audio.sfx('magic');
    audio.sfx('water');
    for (let i = 0; i < 40; i++) {
      const x = (tx - radius + Math.random() * (radius * 2 + 1)) * TILE;
      const y = (ty - radius + Math.random() * (radius * 2 + 1)) * TILE;
      this.particles.push({ x, y: y - 30, vx: -10, vy: 140, life: 0.3 + Math.random() * 0.2, max: 0.5, color: '#9fd0ff', size: 1 });
    }
    this.host.toast(`마법 관개: 밭 ${n}칸에 비를 내렸다`, '#9fd0ff');
  }

  inPasturePx(x: number, y: number): boolean {
    return this.inPastureTile(Math.floor(x / TILE), Math.floor((y - 4) / TILE));
  }
  inPastureTile(tx: number, ty: number): boolean {
    return tx >= PASTURE.x && ty >= PASTURE.y && tx < PASTURE.x + PASTURE.w && ty < PASTURE.y + PASTURE.h;
  }

  /** 먹거나 물약을 마신다 */
  useConsumable(p: Player, slot: number): void {
    const s = this.s;
    const st = s.inventory[slot];
    if (!st) return;
    const def = itemDef(st.id);
    if (def.potion) {
      switch (def.potion) {
        case 'heal':
          if (p.hp >= MAX_HP) return this.host.toast('체력이 가득하다.');
          p.hp = Math.min(MAX_HP, p.hp + 45);
          this.floater(p.x, p.y - 26, '+45', '#7ff0a0');
          audio.sfx('heal');
          break;
        case 'aegis':
          p.buffs.aegis = 4;
          audio.sfx('potion');
          this.host.toast('별빛 방패! 4초간 무적', '#9fd8ff');
          break;
        case 'firestorm':
          this.firestorm(p);
          break;
        case 'gale':
          p.buffs.gale = 30;
          audio.sfx('potion');
          this.host.toast('질풍! 30초간 빠르고 강해진다', '#6af0b0');
          break;
        case 'astral':
          p.energy = MAX_ENERGY;
          p.mana = MAX_MANA;
          audio.sfx('heal');
          this.host.toast('기력과 마력이 가득 찼다', '#c0a0ff');
          break;
        case 'eclipse':
          p.buffs.eclipse = 60;
          audio.sfx('potion');
          this.host.toast('일식의 힘! 60초간 공격력 +50%', '#ffb03a');
          break;
      }
      removeItem(s.inventory, st.id, 1);
      return;
    }
    if (def.energy) {
      if (p.energy >= MAX_ENERGY) return this.host.toast('배가 부르다.');
      const gain = Math.round(def.energy * (st.q === 2 ? 2 : st.q === 1 ? 1.4 : 1));
      p.energy = Math.min(MAX_ENERGY, p.energy + gain);
      removeItem(s.inventory, st.id, 1, st.q);
      audio.sfx('heal', { volume: 0.6 });
      this.floater(p.x, p.y - 26, `기력 +${gain}`, '#ffe27a');
    }
  }

  private firestorm(p: Player): void {
    audio.sfx('explosion');
    this.shake(8);
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      this.particles.push({ x: p.x, y: p.y - 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, max: 0.6, color: Math.random() < 0.5 ? '#ff5a2a' : '#ffd04a', size: 3, glow: true });
    }
    for (const m of this.monsters) {
      if (!m.alive) continue;
      if (Math.hypot(m.x - p.x, m.y - p.y) < 100) {
        this.damageMonster(m, 60, p.x, p.y, 120, false, p);
        m.burn = 3;
        m.burnTick = 0.5;
      }
    }
  }

  // ── 상호작용 ─────────────────────────────────────
  private findInteract(p: Player): { kind: 'crop' | 'animal' | 'npc' | 'obj' | 'revive' | 'dead'; label: string; act: () => void } | null {
    const s = this.s;
    if (this.map.id === 'farm') {
      const { tx, ty } = this.targetTile(p);
      const near = [{ tx, ty }, this.playerTile(p)];
      for (const c of near) {
        const plot = getPlot(s, c.tx, c.ty);
        if (plot && isHarvestable(plot)) return { kind: 'crop', label: '수확', act: () => this.doHarvest(p, c.tx, c.ty) };
      }
      let best: AnimalEnt | null = null;
      let bd = 22;
      for (const a of this.animals) {
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      if (best) {
        const a = best;
        return { kind: 'animal', label: a.data.productReady ? '쓰다듬고 거두기' : '쓰다듬기', act: () => this.petAnimal(p, a) };
      }
    }
    if (this.map.id === 'village') {
      let best: NpcEnt | null = null;
      let bd = 24;
      for (const n of this.npcs) {
        if (!n.visible) continue;
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      if (best) {
        const n = best;
        return { kind: 'npc', label: `${josa(n.def.name, '과', '와')} 대화`, act: () => this.host.talkTo(n, p) };
      }
    }
    for (const o of this.players) {
      if (o !== p && o.downed && Math.hypot(o.x - p.x, o.y - p.y) < 22) return { kind: 'revive', label: `${o.index + 1}P 일으키기(누르고 있기)`, act: () => {} };
    }
    if (this.mine) {
      const sx = this.mine.stairs.x * TILE + 12;
      const sy = this.mine.stairs.y * TILE + 12;
      if (this.floorCleared && this.mine.floor < WYRM_FLOOR && Math.hypot(sx - p.x, sy - p.y) < 22)
        return { kind: 'obj', label: `${this.mine.floor + 1}층으로 내려가기`, act: () => this.descend() };
      const px = this.mine.portal.x * TILE + 12;
      const py = this.mine.portal.y * TILE + 12;
      if (Math.hypot(px - p.x, py - p.y) < 22) return { kind: 'obj', label: '귀환 문양: 농장으로', act: () => this.leaveMine() };
    }
    let bestO: MapObj | null = null;
    let bd = 14;
    for (const o of this.map.objects) {
      if (!o.interact || !this.isShown(o)) continue;
      const rx = Math.max(o.tx * TILE, Math.min(p.x, (o.tx + o.tw) * TILE));
      const ry = Math.max(o.ty * TILE, Math.min(p.y - 4, (o.ty + o.th) * TILE));
      const d = Math.hypot(rx - p.x, ry - (p.y - 4));
      if (d < bd) {
        bd = d;
        bestO = o;
      }
    }
    if (bestO) {
      const o = bestO;
      const labels: Record<Interaction, string> = {
        sleep: '집', ship: '출하함', craft: '연금술 가마솥', observatory: '관측소', mine: '광산 입구', barn: '헛간',
        lookbook: '옷장', telescope: '망원경', stairs: '계단', portal: '귀환 문양', fountain: '분수', banner: '깃발',
      };
      return { kind: 'obj', label: labels[o.interact!], act: () => this.host.interact(o.interact!, p, o) };
    }
    if (this.map.id === 'farm') {
      const { tx, ty } = this.targetTile(p);
      const plot = getPlot(s, tx, ty);
      if (plot?.crop?.dead) return { kind: 'dead', label: '시든 작물 치우기', act: () => { till(s, tx, ty); audio.sfx('till'); } };
    }
    return null;
  }

  private interact(p: Player): void {
    const it = this.findInteract(p);
    if (it && it.kind !== 'revive') it.act();
  }

  private updatePrompt(): void {
    const p = this.players[0];
    if (!p || p.downed) {
      this.prompt = '';
      return;
    }
    const it = this.findInteract(p);
    this.prompt = it ? it.label : '';
  }

  private updateRevive(dt: number): void {
    for (const p of this.players) {
      if (!p.downed) continue;
      const helper = this.players.find((o) => !o.downed && Math.hypot(o.x - p.x, o.y - p.y) < 22 && this.host.input.held(o.dev, 'interact'));
      if (helper) {
        p.revive += dt;
        if (p.revive >= 1.5) {
          p.downed = false;
          p.hp = Math.round(MAX_HP * 0.4);
          p.iframes = 1.5;
          p.revive = 0;
          audio.sfx('heal');
          this.host.toast(`${p.index + 1}P가 다시 일어났다!`, '#7ff0a0');
        }
      } else p.revive = Math.max(0, p.revive - dt);
    }
  }

  private doHarvest(p: Player, tx: number, ty: number): void {
    const s = this.s;
    const got = harvest(s, tx, ty, { day: s.day, minutes: s.minutes, rng: this.host.rng });
    if (!got) return;
    const left = addItem(s.inventory, got.id, got.n, got.q);
    if (left > 0) {
      this.dropItem(tx * TILE + 8, ty * TILE + 8, got.id, left);
      this.host.toast('가방이 가득 차서 일부를 바닥에 내려놓았다.');
    }
    audio.sfx('harvest');
    p.toolT = 0.12;
    this.sparkle(tx * TILE + 8, ty * TILE + 4, got.q === 2 ? '#ffb03a' : got.q === 1 ? '#ffe27a' : '#ffffff', got.q > 0 ? 14 : 6);
    this.floater(tx * TILE + 8, ty * TILE - 4, `${displayName(got.id, got.q)} +${got.n}`, got.q === 2 ? '#ffb03a' : got.q === 1 ? '#ffe27a' : '#ffffff');
  }

  private petAnimal(p: Player, a: AnimalEnt): void {
    const r = petAnimal(a.data);
    void p;
    if (r.petted) {
      a.heartT = 1.2;
      audio.sfx(a.data.species === 'cow' ? 'moo' : 'quack');
      audio.sfx('heart', { volume: 0.6 });
    }
    if (r.product) {
      const left = addItem(this.s.inventory, r.product.id, r.product.n, r.product.q);
      if (left > 0) {
        a.data.productReady = true;
        this.host.toast('가방이 가득 찼다.');
      } else {
        audio.sfx('pickup');
        this.floater(a.x, a.y - 24, `${displayName(r.product.id, r.product.q)} +1`, '#ffffff');
      }
    }
    if (!r.petted && !r.product) {
      const sp = SPECIES[a.data.species];
      this.host.toast(`${a.data.name}(${sp.name}) · 애정 ${a.data.affection} · ${isAdult(a.data) ? '어른' : `새끼(${sp.adultAge - a.data.ageDays}일 뒤 성장)`}`);
    }
  }

  // ── 가축 ─────────────────────────────────────────
  private updateAnimals(dt: number): void {
    const x0 = PASTURE.x * TILE + 6;
    const y0 = PASTURE.y * TILE + 10;
    const x1 = (PASTURE.x + PASTURE.w) * TILE - 6;
    const y1 = (PASTURE.y + PASTURE.h) * TILE - 2;
    for (const a of this.animals) {
      if (a.heartT > 0) a.heartT -= dt;
      a.wait -= dt;
      const d = Math.hypot(a.tx - a.x, a.ty - a.y);
      if (d < 2) {
        if (a.wait <= 0) {
          a.tx = x0 + Math.random() * (x1 - x0);
          a.ty = y0 + Math.random() * (y1 - y0);
          a.wait = 2 + Math.random() * 4;
        }
      } else if (a.wait < 1.5) {
        const sp = 14;
        a.x += ((a.tx - a.x) / d) * sp * dt;
        a.y += ((a.ty - a.y) / d) * sp * dt;
        a.flip = a.tx < a.x;
        a.animT += dt;
      }
    }
  }

  // ── 주민 ─────────────────────────────────────────
  private updateNpcs(dt: number): void {
    for (const n of this.npcs) {
      if (!n.visible) continue;
      const dx = n.tx - n.x;
      const dy = n.ty - n.y;
      const d = Math.hypot(dx, dy);
      n.moving = d > 1.5;
      if (n.moving) {
        const sp = 32;
        n.x += (dx / d) * Math.min(d, sp * dt);
        n.y += (dy / d) * Math.min(d, sp * dt);
        n.animT += dt;
        if (Math.abs(dx) > Math.abs(dy)) n.facing = dx < 0 ? 'left' : 'right';
        else n.facing = dy < 0 ? 'up' : 'down';
      } else {
        // 가까운 플레이어를 바라본다
        const p = this.players.find((q) => Math.hypot(q.x - n.x, q.y - n.y) < 40);
        if (p) {
          const ddx = p.x - n.x;
          const ddy = p.y - n.y;
          if (Math.abs(ddx) > Math.abs(ddy)) n.facing = ddx < 0 ? 'left' : 'right';
          else n.facing = ddy < 0 ? 'up' : 'down';
        } else n.facing = 'down';
      }
    }
  }

  // ── 광산 ─────────────────────────────────────────
  private mineCtx(): MineCtx {
    return {
      players: this.players,
      rng: this.host.rng,
      solidAt: (x, y) => this.solidAtPx(x, y),
      shoot: (p) => this.projectiles.push({ ...p, hit: new Set() }),
      telegraph: (t) => this.telegraphs.push(t),
      spawn: (type, x, y) => this.spawnMonster(type, x, y),
      minions: () => this.monsters.filter((m) => m.alive && !m.def.boss).length,
      shake: (n) => this.shake(n),
      sfx: (n) => audio.sfx(n),
      hurtPlayersInCircle: (x, y, r, dmg, fx, fy) => {
        for (const p of this.players) if (Math.hypot(p.x - x, p.y - 6 - y) < r) this.hurtPlayer(p, dmg, fx, fy);
      },
      setDarkness: (on) => {
        this.wyrmDark = on;
        if (on) audio.music('eclipse');
      },
    };
  }

  spawnMonster(type: MonsterType, x: number, y: number): void {
    if (!this.mine) return;
    let px = x;
    let py = y;
    for (let i = 0; i < 10 && this.solidAtPx(px, py); i++) {
      px = x + (Math.random() - 0.5) * 40;
      py = y + (Math.random() - 0.5) * 40;
    }
    const m = new Monster(type, px, py, this.mine.floor);
    this.monsters.push(m);
    this.sparkle(px, py, '#c8a8ff', 10);
  }

  private spawnWave(types: MonsterType[]): void {
    const rng = this.host.rng;
    for (const t of types) {
      for (let tries = 0; tries < 30; tries++) {
        const x = (2 + rng.next() * (this.map.w - 4)) * TILE;
        const y = (4 + rng.next() * (this.map.h - 6)) * TILE;
        if (this.solidAtPx(x, y)) continue;
        if (this.players.some((p) => Math.hypot(p.x - x, p.y - y) < 90)) continue;
        this.spawnMonster(t, x, y);
        break;
      }
    }
  }

  private updateMine(dt: number): void {
    const mine = this.mine!;
    const ctx = this.mineCtx();
    for (const m of this.monsters) {
      updateMonster(m, ctx, dt);
      if (!m.alive) continue;
      if (m.burn > 0 && m.burnTick <= 0) {
        m.burnTick = 0.5;
        this.damageMonster(m, 4, m.x, m.y, 0, false, null);
      }
      // 접촉 피해
      if (m.state !== 'spawn') {
        const parts = m.type === 'wyrm' ? [{ x: m.x, y: m.y, r: m.def.r }, ...m.segs.map((s) => ({ x: s.x, y: s.y, r: 8 }))] : [{ x: m.x, y: m.y, r: m.def.r }];
        for (const p of this.players) for (const part of parts) if (Math.hypot(p.x - part.x, p.y - 6 - part.y) < part.r + 5) this.hurtPlayer(p, m.dmg, part.x, part.y);
      }
    }
    this.monsters = this.monsters.filter((m) => m.alive);
    if (this.floorCleared) return;
    const alive = this.monsters.length;
    if (mine.boss) {
      if (this.waveIdx === 0) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) {
          this.waveIdx = 1;
          this.spawnMonster(mine.boss, 13 * TILE, 7 * TILE);
          this.bossName = MONSTER_TITLES[mine.boss] ?? '';
          audio.sfx('bossRoar');
          this.shake(6);
        }
      } else if (!this.monsters.some((m) => m.def.boss)) {
        for (const m of this.monsters) m.hp = 0;
        this.monsters = [];
        this.clearFloor();
      }
      return;
    }
    if (alive === 0) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        if (this.waveIdx < mine.waves.length) {
          this.spawnWave(mine.waves[this.waveIdx]!);
          this.waveIdx++;
          this.waveDelay = 0.9;
        } else this.clearFloor();
      }
    }
  }

  get waveLabel(): string {
    if (!this.mine) return '';
    if (this.floorCleared) return this.mine.floor < WYRM_FLOOR ? '정화 완료 · 계단이 열렸다' : '정화 완료';
    if (this.mine.boss) return '';
    return `웨이브 ${Math.max(1, this.waveIdx)}/${this.mine.waves.length}`;
  }

  private clearFloor(): void {
    const mine = this.mine!;
    this.floorCleared = true;
    this.projectiles = this.projectiles.filter((p) => p.side === 'player');
    this.wyrmDark = false;
    for (const p of this.players)
      if (p.downed) {
        p.downed = false;
        p.hp = Math.round(MAX_HP * 0.3);
      }
    audio.sfx('fanfare');
    this.host.floorCleared(mine.floor);
    if (mine.floor < WYRM_FLOOR) this.sparkle(mine.stairs.x * TILE + 12, mine.stairs.y * TILE + 12, '#ffe27a', 20);
  }

  private descend(): void {
    const next = this.mine!.floor + 1;
    audio.sfx('stairs');
    this.transition(() => this.enter('mine', undefined, next));
  }

  leaveMine(): void {
    this.transition(() => this.enter('farm', { tx: 41, ty: 32 }));
  }

  private startAttack(p: Player): void {
    if (p.dashT > 0 && p.dashT > 0.05) return;
    if (p.attacking && p.attackT > 0.07) return;
    const aim = this.aimOf(p);
    p.lastAimX = aim.x;
    p.lastAimY = aim.y;
    if (Math.abs(aim.x) > Math.abs(aim.y)) p.facing = aim.x < 0 ? 'left' : 'right';
    else p.facing = aim.y < 0 ? 'up' : 'down';
    p.swingAngle = Math.atan2(aim.y, aim.x);
    p.swingHit = new Set();
    let heavy = false;
    if (p.dashStrikeWindow > 0) {
      p.comboStep = 4;
      p.attackDur = 0.24;
      p.kbx = aim.x * 230;
      p.kby = aim.y * 230;
      p.dashStrikeWindow = 0;
      audio.sfx('swing3');
      heavy = true;
    } else {
      p.comboStep = p.comboWindow > 0 && p.comboStep < 3 ? p.comboStep + 1 : 1;
      p.attackDur = p.comboStep === 3 ? 0.34 : 0.22;
      audio.sfx(p.comboStep === 3 ? 'swing3' : p.comboStep === 2 ? 'swing2' : 'swing1');
      heavy = p.comboStep === 3;
    }
    p.attackT = p.attackDur;
    p.comboWindow = 0;
    const arc = p.comboStep === 3 ? 3.8 : p.comboStep === 4 ? 1.2 : 2.1;
    const r = p.comboStep === 4 ? 34 : p.comboStep === 3 ? 29 : 25;
    const col = p.buffs.eclipse > 0 ? '#ffb03a' : p.buffs.gale > 0 ? '#6af0b0' : '#ffffff';
    this.slashes.push({ x: p.x, y: p.y - 8, angle: p.swingAngle + (p.comboStep === 2 ? 0.2 : -0.2), arc, r, life: 0.16, max: 0.16, color: col, heavy });
  }

  private updateAttack(p: Player, dt: number): void {
    p.attackT -= dt;
    const elapsed = p.attackDur - p.attackT;
    if (elapsed > 0.02 && elapsed < 0.16) {
      const step = p.comboStep;
      const arc = step === 3 ? 3.8 : step === 4 ? 1.2 : 2.1;
      const r = step === 4 ? 36 : step === 3 ? 31 : 27;
      const mult = step === 3 ? 1.9 : step === 4 ? 1.6 : step === 2 ? 1.15 : 1;
      const kb = step === 3 ? 210 : step === 4 ? 160 : 85;
      const cx = p.x;
      const cy = p.y - 8;
      const inArc = (x: number, y: number, rr: number) => {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r + rr) return false;
        let da = Math.atan2(y - cy, x - cx) - p.swingAngle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        return Math.abs(da) <= arc / 2 || d < 8;
      };
      for (const m of this.monsters) {
        if (!m.alive || m.state === 'spawn' || p.swingHit.has(m)) continue;
        let hit = inArc(m.x, m.y, m.def.r);
        let bodyHit = false;
        if (!hit && m.type === 'wyrm') {
          bodyHit = m.segs.some((s) => inArc(s.x, s.y, 7));
          hit = bodyHit;
        }
        if (hit) {
          p.swingHit.add(m);
          const base = SWORD_DAMAGE[Math.min(3, this.s.swordLevel)]!;
          let dmg = base * mult * (p.buffs.gale > 0 ? 1.2 : 1) * (p.buffs.eclipse > 0 ? 1.5 : 1);
          if (bodyHit) dmg *= 0.5;
          if (m.state === 'stun') dmg *= 1.5;
          const crit = Math.random() < 0.1;
          if (crit) dmg *= 1.5;
          this.damageMonster(m, Math.round(dmg), p.x, p.y, kb, crit || step >= 3, p);
          p.mana = Math.min(MAX_MANA, p.mana + 2);
        }
      }
      // 탄 베기(튕겨내기)
      for (const pr of this.projectiles) {
        if (pr.side !== 'enemy' || pr.life <= 0) continue;
        if (inArc(pr.x, pr.y, pr.r + 2)) {
          pr.life = 0;
          p.mana = Math.min(MAX_MANA, p.mana + 3);
          audio.sfx('deflect');
          this.sparkle(pr.x, pr.y, '#ffffff', 5);
        }
      }
      // 광석
      if (this.mine) for (const o of this.map.objects) {
        if (o.kind !== 'ore' || p.swingHit.has(o)) continue;
        if (inArc(o.tx * TILE + 8, o.ty * TILE + 8, 6)) {
          p.swingHit.add(o);
          this.hitOre(o);
        }
      }
    }
    if (p.attackT <= 0) {
      p.attackT = 0;
      p.comboWindow = p.comboStep >= 3 ? 0 : 0.34;
      if (p.comboStep >= 3) p.comboStep = 0;
    }
  }

  private hitOre(o: MapObj): void {
    o.hp = (o.hp ?? 3) - 1;
    audio.sfx('ore');
    this.sparkle(o.tx * TILE + 8, o.ty * TILE + 8, '#d8c8e8', 4);
    if (o.hp <= 0) {
      this.map.objects = this.map.objects.filter((x) => x !== o);
      this.rebuildSolid();
      const id = o.data ?? 'copper';
      const n = id === 'relic' ? 1 : 1 + Math.floor(Math.random() * 2);
      this.dropItem(o.tx * TILE + 8, o.ty * TILE + 8, id, n);
      this.shake(2);
    }
  }

  private castSlice(p: Player): void {
    if (p.magicCd > 0) return;
    if (p.mana < 12) {
      this.floater(p.x, p.y - 28, '마력 부족', '#9fd8ff');
      return;
    }
    p.mana -= 12;
    p.magicCd = 0.35;
    const aim = this.aimOf(p);
    p.lastAimX = aim.x;
    p.lastAimY = aim.y;
    const base = SWORD_DAMAGE[Math.min(3, this.s.swordLevel)]!;
    const dmg = Math.round(base * 1.3 * (p.buffs.eclipse > 0 ? 1.5 : 1));
    this.projectiles.push({ x: p.x + aim.x * 8, y: p.y - 8 + aim.y * 8, vx: aim.x * 235, vy: aim.y * 235, r: 9, life: 0.55, dmg, side: 'player', kind: 'slice', hit: new Set(), owner: p, color: '#ffe27a' });
    audio.sfx('magic');
  }

  damageMonster(m: Monster, dmg: number, fx: number, fy: number, kb: number, crit: boolean, by: Player | null): void {
    if (!m.alive || m.state === 'spawn') return;
    m.hp -= dmg;
    m.flash = 0.1;
    const d = Math.hypot(m.x - fx, m.y - fy) || 1;
    const resist = m.def.knockResist;
    if (kb > 0 && resist < 1) {
      m.kbx = ((m.x - fx) / d) * kb * (1 - resist);
      m.kby = ((m.y - fy) / d) * kb * (1 - resist);
    }
    this.floater(m.x + (Math.random() - 0.5) * 8, m.y - m.def.r - 8, String(dmg), crit ? '#ffe27a' : '#ffffff', crit);
    audio.sfx(crit ? 'crit' : 'hit');
    this.hitstop = crit ? 0.07 : 0.035;
    if (crit) this.shake(2);
    for (let i = 0; i < 5; i++) {
      const a = Math.atan2(m.y - fy, m.x - fx) + (Math.random() - 0.5) * 1.4;
      this.particles.push({ x: m.x, y: m.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.25, max: 0.25, color: crit ? '#ffe27a' : '#ffffff', size: 2 });
    }
    if (m.hp <= 0) this.killMonster(m, by);
  }

  private killMonster(m: Monster, by: Player | null): void {
    void by;
    m.state = 'dead';
    m.hp = 0;
    this.s.stats.kills++;
    audio.sfx('enemyDie');
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ x: m.x, y: m.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 0.45, max: 0.45, color: '#c8a8ff', size: 2, glow: true });
    }
    const rng = this.host.rng;
    const ess = m.def.essence >= 1 ? Math.floor(m.def.essence) : rng.chance(m.def.essence) ? 1 : 0;
    if (ess > 0) this.dropItem(m.x, m.y, 'essence', ess);
    if (m.def.gold > 0) this.dropGold(m.x, m.y, m.def.gold + rng.int(0, m.def.gold));
    if (m.type === 'matriarch') {
      this.dropItem(m.x, m.y, 'seed_umbral_lotus', 1);
      this.dropItem(m.x, m.y, 'star_crystal', 3);
      this.dropItem(m.x, m.y, 'moonsilver', 4);
      this.host.bossDefeated('matriarch');
      this.shake(10);
    } else if (m.type === 'wyrm') {
      this.dropItem(m.x, m.y, 'eclipse_heart', 1);
      this.dropItem(m.x, m.y, 'relic', 2);
      this.dropItem(m.x, m.y, 'star_crystal', 5);
      this.host.bossDefeated('wyrm');
      this.shake(14);
    }
  }

  hurtPlayer(p: Player, dmg: number, fx: number, fy: number): void {
    if (p.invulnerable || !this.mine) return;
    p.hp -= dmg;
    p.iframes = 0.8;
    p.hurtT = 0.2;
    const d = Math.hypot(p.x - fx, p.y - fy) || 1;
    p.kbx = ((p.x - fx) / d) * 160;
    p.kby = ((p.y - fy) / d) * 160;
    p.attackT = 0;
    this.floater(p.x, p.y - 28, `-${dmg}`, '#ff6a7a');
    audio.sfx('hurt');
    this.shake(3);
    if (p.index === 0) this.hurtFlash = 0.25;
    if (p.hp <= 0) {
      p.hp = 0;
      p.downed = true;
      p.revive = 0;
      this.host.toast(`${p.index + 1}P가 쓰러졌다!`, '#ff6a7a');
      if (this.players.every((q) => q.downed)) {
        this.host.endDay(true, '모두 쓰러졌다… 정신을 차려 보니 집이었다.');
      }
    }
  }

  // ── 탄·드롭·효과 ─────────────────────────────────
  private updateProjectiles(dt: number): void {
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.kind !== 'fire' && this.solidAtPx(pr.x, pr.y)) {
        if (pr.side === 'player' && this.mine) {
          const o = this.map.objects.find((q) => q.kind === 'ore' && q.tx === Math.floor(pr.x / TILE) && q.ty === Math.floor(pr.y / TILE));
          if (o && !pr.hit.has(o)) {
            pr.hit.add(o);
            this.hitOre(o);
          }
        }
        pr.life = 0;
        this.sparkle(pr.x, pr.y, pr.color, 3);
        continue;
      }
      if (pr.side === 'player') {
        for (const m of this.monsters) {
          if (!m.alive || pr.hit.has(m)) continue;
          const parts = m.type === 'wyrm' ? [{ x: m.x, y: m.y, r: m.def.r, k: 1 }, ...m.segs.map((s) => ({ x: s.x, y: s.y, r: 7, k: 0.5 }))] : [{ x: m.x, y: m.y, r: m.def.r, k: 1 }];
          const part = parts.find((q) => Math.hypot(q.x - pr.x, q.y - pr.y) < q.r + pr.r);
          if (part) {
            pr.hit.add(m);
            this.damageMonster(m, Math.round(pr.dmg * part.k), pr.x - pr.vx * 0.05, pr.y - pr.vy * 0.05, 60, false, pr.owner ?? null);
          }
        }
      } else {
        for (const p of this.players) {
          if (Math.hypot(p.x - pr.x, p.y - 8 - pr.y) < pr.r + 5 && !p.invulnerable) {
            this.hurtPlayer(p, pr.dmg, pr.x - pr.vx * 0.1, pr.y - pr.vy * 0.1);
            if (pr.kind !== 'fire') pr.life = 0;
          }
        }
      }
      if (pr.kind === 'slice' && Math.random() < 0.7) this.particles.push({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.2, max: 0.2, color: '#ffe27a', size: 1, glow: true });
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
    for (const t of this.telegraphs) t.t -= dt;
    this.telegraphs = this.telegraphs.filter((t) => t.t > 0);
  }

  dropItem(x: number, y: number, id: string, n: number): void {
    const a = Math.random() * Math.PI * 2;
    this.pickups.push({ x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 30, z: 0, vz: 70, id, n, gold: 0, t: 0 });
  }
  dropGold(x: number, y: number, gold: number): void {
    const a = Math.random() * Math.PI * 2;
    this.pickups.push({ x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 30, z: 0, vz: 80, id: '', n: 0, gold, t: 0 });
  }

  private updatePickups(dt: number): void {
    for (const pk of this.pickups) {
      pk.t += dt;
      pk.vz -= 260 * dt;
      pk.z = Math.max(0, pk.z + pk.vz * dt);
      if (pk.z === 0) {
        pk.vz = Math.abs(pk.vz) > 30 ? -pk.vz * 0.4 : 0;
        pk.vx *= 0.85;
        pk.vy *= 0.85;
      }
      if (!this.solidAtPx(pk.x + pk.vx * dt, pk.y + pk.vy * dt)) {
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
      }
      if (pk.t < 0.4) continue;
      let best: Player | null = null;
      let bd = 44;
      for (const p of this.players) {
        const d = Math.hypot(p.x - pk.x, p.y - 6 - pk.y);
        if (d < bd && !p.downed) {
          bd = d;
          best = p;
        }
      }
      if (best) {
        const d = bd || 1;
        pk.x += ((best.x - pk.x) / d) * 150 * dt;
        pk.y += ((best.y - 6 - pk.y) / d) * 150 * dt;
        if (d < 8) this.collect(pk);
      }
    }
    this.pickups = this.pickups.filter((p) => p.n > 0 || p.gold > 0);
  }

  private collect(pk: Pickup): void {
    if (pk.gold > 0) {
      this.s.gold += pk.gold;
      this.floater(pk.x, pk.y - 10, `+${pk.gold}G`, '#ffe27a');
      audio.sfx('coin', { volume: 0.6 });
      pk.gold = 0;
      return;
    }
    const left = addItem(this.s.inventory, pk.id, pk.n);
    const got = pk.n - left;
    if (got > 0) {
      audio.sfx('pickup');
      this.floater(pk.x, pk.y - 10, `${itemDef(pk.id).name} +${got}`, '#ffffff');
    }
    pk.n = left;
    if (left > 0) {
      pk.t = -3;
      this.host.toast('가방이 가득 찼다!', '#ff6a7a');
    }
  }

  private updateFx(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      p.vx *= Math.pow(0.05, dt);
      p.vy *= p.gravity ? 1 : Math.pow(0.05, dt);
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    for (const f of this.floaters) {
      f.y -= 18 * dt;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const s of this.slashes) s.life -= dt;
    this.slashes = this.slashes.filter((s) => s.life > 0);
    // 비
    if (weatherOf(this.s.seed, this.s.day) === 'rain' && this.map.id !== 'mine' && Math.random() < 0.4) this.splashTiny();
  }

  floater(x: number, y: number, text: string, color: string, big = false): void {
    this.floaters.push({ x, y, text, color, life: 0.9, big });
  }
  sparkle(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 50;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 1 + Math.floor(Math.random() * 2), glow: true });
    }
  }
  private splash(x: number, y: number): void {
    for (let i = 0; i < 8; i++)
      this.particles.push({ x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 40, life: 0.4, max: 0.4, color: '#cfe8ff', size: 1, gravity: 260 });
    audio.sfx('splash', { volume: 0.5 });
  }
  private splashTiny(): void {
    const x = this.camX + Math.random() * VW;
    const y = this.camY + Math.random() * VH;
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.15, max: 0.15, color: '#cfe8ff', size: 1 });
  }
  private dirt(tx: number, ty: number): void {
    for (let i = 0; i < 6; i++)
      this.particles.push({ x: tx * TILE + 8, y: ty * TILE + 10, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40, life: 0.35, max: 0.35, color: '#8a5e3a', size: 2, gravity: 300 });
  }
  shake(n: number): void {
    if (!this.host.settings.shake) return;
    this.shakeMag = Math.max(this.shakeT > 0 ? this.shakeMag : 0, n);
    this.shakeT = 0.25;
  }

  private checkExits(): void {
    if (this.fadeDir !== 0) return;
    for (const ex of this.map.exits) {
      for (const p of this.players) {
        const tx = Math.floor(p.x / TILE);
        const ty = Math.floor((p.y - 4) / TILE);
        if (tx >= ex.tx && tx < ex.tx + ex.tw && ty >= ex.ty && ty < ex.ty + ex.th) {
          this.transition(() => this.enter(ex.to, ex.spawn));
          return;
        }
      }
    }
  }

  updateCamera(snap: boolean): void {
    if (this.players.length === 0) return;
    let cx = 0;
    let cy = 0;
    for (const p of this.players) {
      cx += p.x;
      cy += p.y;
    }
    cx /= this.players.length;
    cy /= this.players.length;
    const mw = this.map.w * TILE;
    const mh = this.map.h * TILE;
    let tx = cx - VW / 2;
    let ty = cy - 10 - VH / 2;
    tx = mw <= VW ? (mw - VW) / 2 : Math.max(0, Math.min(mw - VW, tx));
    ty = mh <= VH ? (mh - VH) / 2 : Math.max(0, Math.min(mh - VH, ty));
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      this.camX += (tx - this.camX) * 0.18;
      this.camY += (ty - this.camY) * 0.18;
    }
  }

  // ── 그리기 ───────────────────────────────────────
  draw(c: CanvasRenderingContext2D): void {
    const s = this.s;
    const season = seasonOf(s.day);
    let ox = Math.round(this.camX);
    let oy = Math.round(this.camY);
    if (this.shakeT > 0) {
      ox += Math.round((Math.random() - 0.5) * this.shakeMag);
      oy += Math.round((Math.random() - 0.5) * this.shakeMag);
    }
    c.save();
    c.fillStyle = this.map.id === 'mine' ? '#140e20' : '#2a3a2a';
    c.fillRect(0, 0, VW, VH);
    c.translate(-ox, -oy);
    const x0 = Math.max(0, Math.floor(ox / TILE));
    const y0 = Math.max(0, Math.floor(oy / TILE));
    const x1 = Math.min(this.map.w - 1, Math.floor((ox + VW) / TILE));
    const y1 = Math.min(this.map.h - 1, Math.floor((oy + VH) / TILE));
    const wf = Math.floor(this.t * 2) % 4;
    const depth = this.mine?.floor ?? 0;
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const g = this.map.ground[ty * this.map.w + tx]!;
        const px = tx * TILE;
        const py = ty * TILE;
        let img: HTMLCanvasElement;
        switch (g) {
          case 'grass': img = grassTile(season, tx, ty); break;
          case 'flower': img = flowerTile(season, tx, ty); break;
          case 'path': img = pathTile(tx, ty); break;
          case 'cobble': img = cobbleTile(tx, ty); break;
          case 'water': img = waterTile((wf + tx + ty) % 4); break;
          case 'sand': img = sandTile(); break;
          case 'farmland': img = farmlandTile(season, tx, ty); break;
          case 'cliff': img = cliffTile(tx, ty, false); break;
          case 'cliffTop': img = cliffTile(tx, ty, true); break;
          case 'mfloor': img = mineFloorTile(tx, ty, depth); break;
          case 'mwall': img = mineWallTile(tx, ty, depth, false); break;
          case 'mface': img = mineWallTile(tx, ty, depth, true); break;
        }
        c.drawImage(img, px, py);
      }
    const drawables: Drawable[] = [];
    // 밭
    if (this.map.id === 'farm') {
      for (const [k, plot] of Object.entries(s.plots)) {
        const [a, b] = k.split(',');
        const tx = Number(a);
        const ty = Number(b);
        if (tx < x0 - 1 || tx > x1 + 1 || ty < y0 - 1 || ty > y1 + 2) continue;
        c.drawImage(soilTile(plot.watered, tx, ty), tx * TILE, ty * TILE);
        if (plot.rune) c.drawImage(runeOverlay(plot.rune, this.t), tx * TILE, ty * TILE);
        if (plot.crop) {
          const st = growthStage(plot);
          const spr = cropSprite(plot.crop.id, st, plot.crop.bloomed, plot.crop.dead);
          const ready = isHarvestable(plot);
          drawables.push({
            y: ty * TILE + 12,
            draw: (cc) => {
              cc.drawImage(spr, tx * TILE - 1, ty * TILE - 10);
              if (ready && Math.floor(this.t * 2) % 2 === 0) {
                cc.fillStyle = '#ffffff';
                cc.fillRect(tx * TILE + 13, ty * TILE - 6, 1, 3);
                cc.fillRect(tx * TILE + 12, ty * TILE - 5, 3, 1);
              }
            },
          });
        }
      }
    }
    // 예고 표시(바닥)
    for (const t of this.telegraphs) this.drawTelegraph(c, t);
    // 오브젝트
    for (const o of this.map.objects) {
      if (!this.isShown(o)) continue;
      if (o.tx + o.tw < x0 - 4 || o.tx > x1 + 4 || o.ty > y1 + 6 || o.ty + o.th < y0 - 2) continue;
      const spr = this.objSprite(o, season);
      if (!spr) continue;
      const cx = (o.tx + o.tw / 2) * TILE;
      const by = (o.ty + o.th) * TILE;
      drawables.push({ y: by - (o.kind === 'fenceV' ? 8 : 1), draw: (cc) => cc.drawImage(spr, Math.round(cx - spr.width / 2), by - spr.height + (o.kind === 'tree' ? 2 : 1)) });
    }
    // 광산 계단·귀환 문양
    if (this.mine) {
      const m = this.mine;
      if (this.floorCleared && m.floor < WYRM_FLOOR) {
        const spr = stairsSprite(true);
        drawables.push({ y: m.stairs.y * TILE, draw: (cc) => cc.drawImage(spr, m.stairs.x * TILE, m.stairs.y * TILE) });
      }
      const ps = portalSprite(this.t);
      drawables.push({ y: m.portal.y * TILE, draw: (cc) => cc.drawImage(ps, m.portal.x * TILE, m.portal.y * TILE) });
    }
    // 가축
    for (const a of this.animals) {
      const spr = animalSprite(a.data.species, a.data.variant, !isAdult(a.data), Math.floor(a.animT * 4) % 2);
      drawables.push({
        y: a.y,
        draw: (cc) => {
          shadow(cc, a.x, a.y, 7);
          if (a.flip) {
            cc.save();
            cc.translate(Math.round(a.x), 0);
            cc.scale(-1, 1);
            cc.drawImage(spr, -13, Math.round(a.y) - 21);
            cc.restore();
          } else cc.drawImage(spr, Math.round(a.x) - 13, Math.round(a.y) - 21);
          if (a.heartT > 0) heart(cc, a.x, a.y - 24 - (1.2 - a.heartT) * 8);
          if (a.data.productReady && Math.floor(this.t * 2) % 2 === 0) {
            cc.fillStyle = '#ffe27a';
            cc.fillRect(Math.round(a.x) - 1, Math.round(a.y) - 26, 2, 2);
          }
        },
      });
    }
    // 주민
    for (const n of this.npcs) {
      if (!n.visible) continue;
      const dir: Dir = n.facing === 'left' || n.facing === 'right' ? 'side' : n.facing;
      const frame = n.moving ? 1 + (Math.floor(n.animT * 6) % 2) : 0;
      const spr = charSprite(n.look, dir, frame);
      const flip = n.facing === 'left';
      drawables.push({ y: n.y, draw: (cc) => drawChar(cc, spr, n.x, n.y, flip, false) });
    }
    // 플레이어
    for (const p of this.players) {
      const dir: Dir = p.facing === 'left' || p.facing === 'right' ? 'side' : p.facing;
      const frame = p.moving && !p.dashing ? 1 + (Math.floor(p.animT * 8) % 2) : 0;
      const spr = charSprite(p.look, dir, frame, p.pattern);
      drawables.push({
        y: p.y,
        draw: (cc) => {
          if (p.downed) {
            cc.globalAlpha = 0.6;
            cc.save();
            cc.translate(Math.round(p.x), Math.round(p.y) - 4);
            cc.rotate(Math.PI / 2);
            cc.drawImage(spr, -9, -13);
            cc.restore();
            cc.globalAlpha = 1;
            if (p.revive > 0) {
              cc.fillStyle = '#1a1430';
              cc.fillRect(Math.round(p.x) - 10, Math.round(p.y) - 22, 20, 3);
              cc.fillStyle = '#7ff0a0';
              cc.fillRect(Math.round(p.x) - 10, Math.round(p.y) - 22, Math.round((20 * p.revive) / 1.5), 3);
            }
            return;
          }
          const blink = p.iframes > 0 && !p.dashing && Math.floor(this.t * 20) % 2 === 0;
          if (!blink) drawChar(cc, spr, p.x, p.y, p.facing === 'left', p.swimming);
          if (p.buffs.aegis > 0) {
            cc.strokeStyle = 'rgba(159,216,255,0.8)';
            cc.beginPath();
            cc.arc(Math.round(p.x) + 0.5, Math.round(p.y) - 10.5, 13, 0, Math.PI * 2);
            cc.stroke();
          }
          this.drawHeldTool(cc, p);
        },
      });
    }
    // 몬스터
    for (const m of this.monsters) {
      const kind = m.spriteKind;
      const frame = m.state === 'windup' || m.state === 'act' ? 1 : Math.floor(m.animT * 4) % 2;
      const flash = m.flash > 0 || (m.state === 'windup' && Math.floor(this.t * 16) % 2 === 0);
      if (m.type === 'wyrm') {
        for (let i = m.segs.length - 1; i >= 0; i--) {
          const sg = m.segs[i]!;
          const bs = monsterSprite('wyrmBody', 0, 0, m.flash > 0);
          drawables.push({ y: sg.y, draw: (cc) => cc.drawImage(bs, Math.round(sg.x) - 11, Math.round(sg.y) - 11) });
        }
      }
      const spr = monsterSprite(kind, m.tier, frame, flash);
      drawables.push({
        y: m.y + m.def.r,
        draw: (cc) => {
          if (m.state === 'spawn') {
            cc.globalAlpha = 1 - m.t / 0.6;
          }
          if (m.type !== 'bat' && m.type !== 'wisp') shadow(cc, m.x, m.y + m.def.r * 0.6, m.def.r);
          const bob = m.type === 'bat' || m.type === 'wisp' ? Math.sin(m.animT * 6) * 2 : 0;
          cc.drawImage(spr, Math.round(m.x - spr.width / 2), Math.round(m.y - spr.height / 2 + bob));
          cc.globalAlpha = 1;
          if (!m.def.boss && m.hp < m.maxHp) {
            cc.fillStyle = '#1a1430';
            cc.fillRect(Math.round(m.x) - 8, Math.round(m.y - m.def.r) - 8, 16, 2);
            cc.fillStyle = '#ff6a7a';
            cc.fillRect(Math.round(m.x) - 8, Math.round(m.y - m.def.r) - 8, Math.round((16 * m.hp) / m.maxHp), 2);
          }
          if (m.burn > 0 && Math.random() < 0.5) this.particles.push({ x: m.x + (Math.random() - 0.5) * 10, y: m.y, vx: 0, vy: -30, life: 0.3, max: 0.3, color: '#ff8a3a', size: 1, glow: true });
          if (m.state === 'stun') {
            for (let i = 0; i < 3; i++) {
              const a = this.t * 4 + (i * Math.PI * 2) / 3;
              cc.fillStyle = '#ffe27a';
              cc.fillRect(Math.round(m.x + Math.cos(a) * 10), Math.round(m.y - m.def.r - 4 + Math.sin(a) * 3), 2, 2);
            }
          }
        },
      });
    }
    // 드롭
    for (const pk of this.pickups) {
      drawables.push({
        y: pk.y,
        draw: (cc) => {
          shadow(cc, pk.x, pk.y + 4, 4);
          if (pk.gold > 0) {
            cc.fillStyle = '#c8a03a';
            cc.fillRect(Math.round(pk.x) - 2, Math.round(pk.y - pk.z) - 2, 5, 5);
            cc.fillStyle = '#ffe27a';
            cc.fillRect(Math.round(pk.x) - 1, Math.round(pk.y - pk.z) - 2, 3, 4);
          } else cc.drawImage(itemIcon(pk.id), Math.round(pk.x) - 9, Math.round(pk.y - pk.z) - 12);
        },
      });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw(c);
    // 베기 잔상
    for (const sl of this.slashes) this.drawSlash(c, sl);
    // 탄
    for (const pr of this.projectiles) this.drawProjectile(c, pr);
    // 파티클
    for (const p of this.particles) {
      c.globalAlpha = Math.min(1, p.life / p.max + 0.2);
      c.fillStyle = p.color;
      c.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    c.globalAlpha = 1;
    // 대상 칸 표시
    const p0 = this.players[0];
    if (p0 && this.map.id === 'farm' && !p0.downed) {
      const st = s.inventory[p0.slot];
      if (st && ['tool', 'seed', 'fertilizer'].includes(itemDef(st.id).kind) && st.id !== 'sword') {
        const { tx, ty } = this.targetTile(p0);
        c.strokeStyle = 'rgba(255,255,255,0.7)';
        c.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
        if (st.id === 'staff') {
          const r = isNight(s.minutes) ? (s.staffLevel > 0 ? 2 : 1) : s.staffLevel > 0 ? 3 : 2;
          c.strokeStyle = isNight(s.minutes) ? 'rgba(255,226,122,0.5)' : 'rgba(159,208,255,0.5)';
          c.strokeRect((tx - r) * TILE + 0.5, (ty - r) * TILE + 0.5, (r * 2 + 1) * TILE - 1, (r * 2 + 1) * TILE - 1);
        }
      }
    }
    c.restore();
    this.drawLighting(c, ox, oy);
    if (weatherOf(s.seed, s.day) === 'rain' && this.map.id !== 'mine') this.drawRain(c);
    if (this.hurtFlash > 0) {
      c.fillStyle = `rgba(255,60,80,${this.hurtFlash * 0.8})`;
      c.fillRect(0, 0, VW, VH);
    }
    if (this.fade > 0) {
      c.fillStyle = `rgba(11,10,26,${Math.min(1, this.fade)})`;
      c.fillRect(0, 0, VW, VH);
    }
  }

  private objSprite(o: MapObj, season: 0 | 1 | 2 | 3): HTMLCanvasElement | null {
    const night = isNight(this.s.minutes) || solarEclipseActive(this.s.day, this.s.minutes);
    switch (o.kind) {
      case 'house': return houseSprite(season, night);
      case 'barn': return barnSprite(season);
      case 'observatory': return observatorySprite(night);
      case 'bin': return shippingBinSprite();
      case 'cauldron': return cauldronSprite(this.t);
      case 'mineEntrance': return mineEntranceSprite();
      case 'tree': return treeSprite(season, o.v ?? 0);
      case 'fenceH': return fenceSprite(true);
      case 'fenceV': return fenceSprite(false);
      case 'store': return shopSprite('store', season, night);
      case 'forge': return shopSprite('forge', season, night);
      case 'bakery': return shopSprite('bakery', season, night);
      case 'fountain': return fountainSprite(this.t, villageRank(this.s) >= 4);
      case 'lantern': return lanternSprite(night || isFestivalDay(this.s.day));
      case 'telescope': return telescopeSprite();
      case 'bench': return benchSprite();
      case 'stage': return stageSprite();
      case 'flowerBox': return flowerBoxSprite(season);
      case 'starArch': return starArchSprite(this.t);
      case 'banner': return bannerSprite(this.s.appearance.pattern, this.s.appearance.outfit);
      case 'flag': return bannerSprite(null, ['#ff8ab8', '#9fd8ff', '#ffe27a', '#7fd0a0'][(o.tx + o.ty) % 4]!);
      case 'rock': return rockSprite('rock', o.v ?? 0);
      case 'ore': return rockSprite((o.data ?? 'copper') as 'copper', o.v ?? 0);
      default: return null;
    }
  }

  private drawHeldTool(c: CanvasRenderingContext2D, p: Player): void {
    if (p.toolT <= 0 || p.attacking) return;
    const st = this.s.inventory[p.slot];
    if (!st) return;
    const icon = itemIcon(p.toolKind || st.id);
    const f = { down: [0, 4], up: [0, -14], left: [-12, -6], right: [12, -6] }[p.facing];
    const k = p.toolT / 0.22;
    c.save();
    c.translate(Math.round(p.x + f[0]!), Math.round(p.y - 8 + f[1]!));
    c.rotate((p.facing === 'left' ? -1 : 1) * (1 - k) * 1.2 - 0.6);
    c.drawImage(icon, -9, -9);
    c.restore();
  }

  private drawSlash(c: CanvasRenderingContext2D, s: SlashFx): void {
    const k = s.life / s.max;
    c.save();
    c.globalAlpha = k;
    c.strokeStyle = s.color;
    c.lineWidth = s.heavy ? 4 : 3;
    c.beginPath();
    c.arc(s.x, s.y, s.r * (1.1 - k * 0.2), s.angle - s.arc / 2, s.angle + s.arc / 2);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(s.x, s.y, s.r * (0.8 - k * 0.1), s.angle - s.arc / 2.5, s.angle + s.arc / 2.5);
    c.stroke();
    c.restore();
  }

  private drawProjectile(c: CanvasRenderingContext2D, p: Projectile): void {
    if (p.kind === 'slice') {
      const a = Math.atan2(p.vy, p.vx);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(a);
      c.strokeStyle = '#ffe27a';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(-4, 0, 9, -1.1, 1.1);
      c.stroke();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(-4, 0, 9, -0.8, 0.8);
      c.stroke();
      c.restore();
      return;
    }
    c.fillStyle = p.color;
    const r = Math.round(p.r);
    c.fillRect(Math.round(p.x) - r, Math.round(p.y) - r + 1, r * 2, r * 2 - 2);
    c.fillRect(Math.round(p.x) - r + 1, Math.round(p.y) - r, r * 2 - 2, r * 2);
    c.fillStyle = '#ffffff';
    c.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
  }

  private drawTelegraph(c: CanvasRenderingContext2D, t: Telegraph): void {
    const k = 1 - t.t / t.max;
    c.save();
    c.globalAlpha = 0.25 + k * 0.35;
    c.fillStyle = '#ff3a5a';
    c.strokeStyle = '#ff8a9a';
    if (t.kind === 'circle') {
      c.beginPath();
      c.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 0.8;
      c.beginPath();
      c.arc(t.x, t.y, t.r * k, 0, Math.PI * 2);
      c.stroke();
    } else if (t.kind === 'line') {
      c.translate(t.x, t.y);
      c.rotate(t.angle);
      c.fillRect(0, -t.width / 2, t.len, t.width);
      c.globalAlpha = 0.8;
      c.fillRect(0, -t.width / 2, t.len * k, 2);
      c.fillRect(0, t.width / 2 - 2, t.len * k, 2);
    } else {
      c.beginPath();
      c.moveTo(t.x, t.y);
      c.arc(t.x, t.y, t.len, t.angle - t.width, t.angle + t.width);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  darkness(): { a: number; color: string } {
    const s = this.s;
    if (this.map.id === 'mine') return { a: this.wyrmDark ? 0.72 : 0.42 + (this.mine?.floor ?? 1) * 0.015, color: this.wyrmDark ? '30,8,30' : '14,10,30' };
    const m = s.minutes;
    let a = 0;
    if (m < 7 * 60) a = 0.25 * (1 - (m - 360) / 60);
    else if (m >= 18 * 60) a = m < 19.5 * 60 ? ((m - 18 * 60) / 90) * 0.52 : Math.min(0.72, 0.52 + ((m - 19.5 * 60) / 150) * 0.2);
    let color = '18,16,58';
    if (solarEclipseActive(s.day, m)) {
      const into = Math.min(m - 11 * 60, 15 * 60 - m);
      a = Math.max(a, Math.min(0.62, (into / 30) * 0.62));
      color = '40,12,36';
    }
    if (weatherOf(s.seed, s.day) === 'rain') a = Math.max(a, 0.14);
    return { a, color };
  }

  private drawLighting(c: CanvasRenderingContext2D, ox: number, oy: number): void {
    const { a, color } = this.darkness();
    if (a <= 0.01) return;
    const L = this.light.x;
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, VW, VH);
    L.fillStyle = `rgba(${color},${a})`;
    L.fillRect(0, 0, VW, VH);
    L.globalCompositeOperation = 'destination-out';
    const bloom: { x: number; y: number; r: number; color: string }[] = [];
    const glow = (x: number, y: number, r: number, strength = 1, color?: string) => {
      const sx = x - ox;
      const sy = y - oy;
      if (sx < -r || sy < -r || sx > VW + r || sy > VH + r) return;
      if (color) bloom.push({ x: sx, y: sy, r: r * 0.9, color });
      const g = L.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g;
      L.fillRect(sx - r, sy - r, r * 2, r * 2);
    };
    for (const p of this.players) glow(p.x, p.y - 10, this.map.id === 'mine' ? 70 : 46, 0.85);
    const s = this.s;
    if (this.map.id === 'farm') {
      for (const [k, plot] of Object.entries(s.plots)) {
        if (!plot.crop || plot.crop.dead) continue;
        const def = cropDef(plot.crop.id);
        const shine = def.glowsAtNight || plot.rune;
        if (!shine) continue;
        const [tx, ty] = k.split(',').map(Number);
        glow(tx! * TILE + 8, ty! * TILE + 4, def.glowsAtNight ? 18 : 10, 0.7, def.glowsAtNight ? def.fruit : plot.rune ? RUNE_COLORS[plot.rune] : undefined);
      }
      for (const [k, plot] of Object.entries(s.plots)) if (plot.rune && !plot.crop) {
        const [tx, ty] = k.split(',').map(Number);
        glow(tx! * TILE + 8, ty! * TILE + 8, 9, 0.5, RUNE_COLORS[plot.rune]);
      }
    }
    for (const o of this.map.objects) {
      if (!this.isShown(o)) continue;
      const cx = (o.tx + o.tw / 2) * TILE;
      if (o.kind === 'house' || o.kind === 'store' || o.kind === 'forge' || o.kind === 'bakery' || o.kind === 'observatory') glow(cx, (o.ty + o.th) * TILE - 24, 46, 0.65);
      else if (o.kind === 'lantern') glow(cx, o.ty * TILE - 6, 40, 0.9, '#ffb03a');
      else if (o.kind === 'cauldron') glow(cx, o.ty * TILE + 8, 26, 0.7);
      else if (o.kind === 'fountain' || o.kind === 'starArch') glow(cx, o.ty * TILE + 8, 34, 0.5);
      else if (o.kind === 'mineEntrance') glow(cx, (o.ty + o.th) * TILE - 16, 26, 0.6);
      else if (o.kind === 'ore' && o.data !== 'copper') glow(o.tx * TILE + 8, o.ty * TILE + 8, 16, 0.5);
    }
    for (const pr of this.projectiles) glow(pr.x, pr.y, pr.kind === 'slice' ? 24 : 14, 0.8);
    for (const p of this.particles) if (p.glow) glow(p.x, p.y, 8, 0.5);
    for (const m of this.monsters) {
      if (m.type === 'wisp' || m.def.boss) glow(m.x, m.y, m.def.boss ? 56 : 22, 0.65, m.def.boss ? '#c08aff' : undefined);
      // 어두운 2페이즈에서도 비룡의 몸을 읽을 수 있게 마디마다 빛을 둔다
      for (const sg of m.segs) glow(sg.x, sg.y, 18, 0.5, '#8a6ad8');
    }
    if (this.mine) {
      glow(this.mine.portal.x * TILE + 12, this.mine.portal.y * TILE + 12, 30, 0.8);
      if (this.floorCleared) glow(this.mine.stairs.x * TILE + 12, this.mine.stairs.y * TILE + 12, 30, 0.8);
      for (let x = 2; x < this.map.w; x += 6) glow(x * TILE + 8, 2 * TILE + 8, 30, 0.6);
    }
    L.globalCompositeOperation = 'source-over';
    c.drawImage(this.light.c, 0, 0);
    // 어둠 위에 색빛을 더해 천문 작물·룬·등불이 은은하게 빛나게 한다
    if (a > 0.15 && bloom.length) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const k = Math.min(1, (a - 0.15) / 0.4) * 0.32;
      for (const b of bloom) {
        const [r, gg, bb] = hexToRgb(b.color);
        const grad = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, `rgba(${r},${gg},${bb},${k})`);
        grad.addColorStop(1, `rgba(${r},${gg},${bb},0)`);
        c.fillStyle = grad;
        c.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
      c.restore();
    }
  }

  private drawRain(c: CanvasRenderingContext2D): void {
    c.strokeStyle = 'rgba(200,220,255,0.45)';
    c.lineWidth = 1;
    c.beginPath();
    const t = this.t;
    for (let i = 0; i < 70; i++) {
      const x = ((i * 53 + t * 140) % (VW + 40)) - 20;
      const y = ((i * 97 + t * 320) % (VH + 20)) - 10;
      c.moveTo(Math.round(x), Math.round(y));
      c.lineTo(Math.round(x - 3), Math.round(y + 7));
    }
    c.stroke();
  }

  /** 월드 좌표 → 화면 좌표(UI 레이어용) */
  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: x - Math.round(this.camX), y: y - Math.round(this.camY) };
  }

  hasPlot(tx: number, ty: number): boolean {
    return this.s.plots[plotKey(tx, ty)] !== undefined;
  }

  countSeeds(): number {
    return this.s.inventory.reduce((a, s) => a + (s && itemDef(s.id).kind === 'seed' ? s.n : 0), 0);
  }

  hasItem(id: string): boolean {
    return countItem(this.s.inventory, id) > 0;
  }
}

const MONSTER_TITLES: Partial<Record<MonsterType, string>> = {
  matriarch: '수정 동굴의 수호자 · 정동석 여왕',
  wyrm: '검은 일식의 화신 · 일식의 비룡',
};

function shadow(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.fillStyle = 'rgba(20,12,40,0.3)';
  c.beginPath();
  c.ellipse(Math.round(x), Math.round(y), r, Math.max(2, r * 0.4), 0, 0, Math.PI * 2);
  c.fill();
}

function heart(c: CanvasRenderingContext2D, x: number, y: number): void {
  const px = Math.round(x) - 3;
  const py = Math.round(y);
  c.fillStyle = '#ff8ab8';
  c.fillRect(px, py, 2, 2);
  c.fillRect(px + 3, py, 2, 2);
  c.fillRect(px, py + 1, 5, 2);
  c.fillRect(px + 1, py + 3, 3, 1);
  c.fillRect(px + 2, py + 4, 1, 1);
}

function drawChar(c: CanvasRenderingContext2D, spr: HTMLCanvasElement, x: number, y: number, flip: boolean, swimming: boolean): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (!swimming) shadow(c, rx, ry, 6);
  c.save();
  if (swimming) {
    c.beginPath();
    c.rect(rx - 12, ry - 30, 24, 20);
    c.clip();
  }
  if (flip) {
    c.translate(rx, 0);
    c.scale(-1, 1);
    c.drawImage(spr, -9, ry - 22);
  } else c.drawImage(spr, rx - 9, ry - 22);
  c.restore();
  if (swimming) {
    c.fillStyle = 'rgba(207,232,255,0.8)';
    c.fillRect(rx - 8, ry - 10, 16, 1);
  }
}

export { MAX_ENERGY, MAX_HP, MAX_MANA, MATRIARCH_FLOOR };
