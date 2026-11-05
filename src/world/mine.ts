import type { MonsterKind } from '../art/creatures';
import { Rng } from '../engine/rng';
import { TILE } from '../engine/screen';
import type { Player, Projectile, Telegraph } from './entities';
import { fillG, newMap, type GameMap, type MapObj } from './maps';

export const MINE_W = 26;
export const MINE_H = 18;
export const MATRIARCH_FLOOR = 5;
export const WYRM_FLOOR = 10;

export type MonsterType = 'slime' | 'bat' | 'wisp' | 'golem' | 'matriarch' | 'wyrm';

export interface MonsterDef {
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  essence: number;
  gold: number;
  knockResist: number;
  boss: boolean;
}

export const MONSTERS: Record<MonsterType, MonsterDef> = {
  slime: { name: '별젤리', hp: 22, speed: 40, dmg: 7, r: 6, essence: 0.45, gold: 3, knockResist: 0, boss: false },
  bat: { name: '동굴박쥐', hp: 14, speed: 55, dmg: 9, r: 5, essence: 0.4, gold: 4, knockResist: 0, boss: false },
  wisp: { name: '도깨비불', hp: 18, speed: 35, dmg: 8, r: 6, essence: 0.6, gold: 5, knockResist: 0.2, boss: false },
  golem: { name: '수정 골렘', hp: 70, speed: 24, dmg: 16, r: 10, essence: 1, gold: 9, knockResist: 0.75, boss: false },
  matriarch: { name: '정동석 여왕', hp: 560, speed: 40, dmg: 14, r: 16, essence: 5, gold: 300, knockResist: 1, boss: true },
  wyrm: { name: '일식의 비룡', hp: 1300, speed: 60, dmg: 16, r: 13, essence: 8, gold: 1000, knockResist: 1, boss: true },
};

export type MState = 'spawn' | 'move' | 'windup' | 'act' | 'recover' | 'stun' | 'dead';

export class Monster {
  hp: number;
  maxHp: number;
  vx = 0;
  vy = 0;
  kbx = 0;
  kby = 0;
  state: MState = 'spawn';
  t = 0.6;
  aiT = 0;
  dirX = 0;
  dirY = 1;
  flash = 0;
  animT = 0;
  action = 0;
  phase = 1;
  burn = 0;
  burnTick = 0;
  emitT = 0;
  hitWall = false;
  segs: { x: number; y: number }[] = [];
  readonly def: MonsterDef;
  readonly dmg: number;
  constructor(
    public type: MonsterType,
    public x: number,
    public y: number,
    public floor: number,
  ) {
    this.def = MONSTERS[type];
    const hpMult = this.def.boss ? 1 : 1 + 0.15 * (floor - 1);
    this.maxHp = this.hp = Math.round(this.def.hp * hpMult);
    this.dmg = Math.round(this.def.dmg * (this.def.boss ? 1 : 1 + 0.08 * (floor - 1)));
    this.aiT = 0.5 + Math.random();
    if (type === 'wyrm') for (let i = 0; i < 9; i++) this.segs.push({ x, y: y - i * 10 });
  }
  get tier(): number {
    return this.floor >= 7 ? 2 : this.floor >= 4 ? 1 : 0;
  }
  get spriteKind(): MonsterKind {
    return this.type === 'wyrm' ? 'wyrmHead' : this.type;
  }
  get alive(): boolean {
    return this.state !== 'dead';
  }
}

export interface MineCtx {
  players: Player[];
  rng: Rng;
  solidAt(px: number, py: number): boolean;
  shoot(p: Omit<Projectile, 'hit'>): void;
  telegraph(t: Telegraph): void;
  spawn(type: MonsterType, x: number, y: number): void;
  minions(): number;
  shake(n: number): void;
  sfx(name: 'telegraph' | 'bossRoar' | 'explosion' | 'magic' | 'dash'): void;
  hurtPlayersInCircle(x: number, y: number, r: number, dmg: number, fromX: number, fromY: number): void;
  setDarkness(on: boolean): void;
}

function nearest(m: Monster, ps: Player[]): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of ps) {
    if (p.downed) continue;
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function moveWithWalls(m: Monster, ctx: MineCtx, dx: number, dy: number): void {
  m.hitWall = false;
  const r = Math.min(m.def.r, 7);
  const nx = m.x + dx;
  if (!ctx.solidAt(nx + Math.sign(dx) * r, m.y)) m.x = nx;
  else m.hitWall = true;
  const ny = m.y + dy;
  if (!ctx.solidAt(m.x, ny + Math.sign(dy) * r)) m.y = ny;
  else m.hitWall = true;
}

function aimAt(m: Monster, p: Player): void {
  const d = Math.hypot(p.x - m.x, p.y - m.y) || 1;
  m.dirX = (p.x - m.x) / d;
  m.dirY = (p.y - m.y) / d;
}

/** 몬스터 한 마리의 AI를 진행한다. */
export function updateMonster(m: Monster, ctx: MineCtx, dt: number): void {
  m.animT += dt;
  if (m.flash > 0) m.flash -= dt;
  if (m.burn > 0) {
    m.burn -= dt;
    m.burnTick -= dt;
  }
  // 넉백
  if (Math.abs(m.kbx) + Math.abs(m.kby) > 1) {
    moveWithWalls(m, ctx, m.kbx * dt, m.kby * dt);
    m.kbx *= Math.pow(0.002, dt);
    m.kby *= Math.pow(0.002, dt);
  }
  if (m.state === 'spawn') {
    m.t -= dt;
    if (m.t <= 0) m.state = 'move';
    return;
  }
  if (m.state === 'dead') return;
  const p = nearest(m, ctx.players);
  if (!p) return;
  m.t -= dt;
  switch (m.type) {
    case 'slime':
      return slime(m, p, ctx, dt);
    case 'bat':
      return bat(m, p, ctx, dt);
    case 'wisp':
      return wisp(m, p, ctx, dt);
    case 'golem':
      return golem(m, p, ctx, dt);
    case 'matriarch':
      return matriarch(m, p, ctx, dt);
    case 'wyrm':
      return wyrm(m, p, ctx, dt);
  }
}

function slime(m: Monster, p: Player, ctx: MineCtx, dt: number): void {
  if (m.state === 'move') {
    m.aiT -= dt;
    if (m.aiT <= 0) {
      m.state = 'windup';
      m.t = 0.32;
      aimAt(m, p);
    }
  } else if (m.state === 'windup' && m.t <= 0) {
    m.state = 'act';
    m.t = 0.34;
  } else if (m.state === 'act') {
    const sp = 125 + m.tier * 15;
    moveWithWalls(m, ctx, m.dirX * sp * dt, m.dirY * sp * dt);
    if (m.t <= 0) {
      m.state = 'recover';
      m.t = 0.25;
    }
  } else if (m.state === 'recover' && m.t <= 0) {
    m.state = 'move';
    m.aiT = 0.8 + ctx.rng.next() * 0.6;
  }
}

function bat(m: Monster, p: Player, ctx: MineCtx, dt: number): void {
  if (m.state === 'move') {
    const ang = m.animT * 1.6 + m.x * 0.01;
    const tx = p.x + Math.cos(ang) * 52;
    const ty = p.y + Math.sin(ang) * 40;
    const d = Math.hypot(tx - m.x, ty - m.y) || 1;
    moveWithWalls(m, ctx, ((tx - m.x) / d) * m.def.speed * dt, ((ty - m.y) / d) * m.def.speed * dt);
    m.aiT -= dt;
    if (m.aiT <= 0) {
      m.state = 'windup';
      m.t = 0.5;
      aimAt(m, p);
      ctx.telegraph({ kind: 'line', x: m.x, y: m.y, r: 0, angle: Math.atan2(m.dirY, m.dirX), len: 95, width: 10, t: 0.5, max: 0.5 });
    }
  } else if (m.state === 'windup' && m.t <= 0) {
    m.state = 'act';
    m.t = 0.38;
  } else if (m.state === 'act') {
    moveWithWalls(m, ctx, m.dirX * 250 * dt, m.dirY * 250 * dt);
    if (m.t <= 0 || m.hitWall) {
      m.state = 'recover';
      m.t = 0.45;
    }
  } else if (m.state === 'recover' && m.t <= 0) {
    m.state = 'move';
    m.aiT = 2 + ctx.rng.next() * 0.8;
  }
}

function wisp(m: Monster, p: Player, ctx: MineCtx, dt: number): void {
  const d = Math.hypot(p.x - m.x, p.y - m.y) || 1;
  if (m.state === 'move' || m.state === 'recover') {
    let k = 0;
    if (d < 75) k = -1;
    else if (d > 125) k = 1;
    const side = Math.sin(m.animT * 0.9) * 0.6;
    const ux = (p.x - m.x) / d;
    const uy = (p.y - m.y) / d;
    moveWithWalls(m, ctx, (ux * k - uy * side) * m.def.speed * dt, (uy * k + ux * side) * m.def.speed * dt);
    if (m.state === 'recover' && m.t <= 0) m.state = 'move';
    m.aiT -= dt;
    if (m.state === 'move' && m.aiT <= 0) {
      m.state = 'windup';
      m.t = 0.6;
    }
  } else if (m.state === 'windup' && m.t <= 0) {
    aimAt(m, p);
    const n = m.tier >= 2 ? 5 : 3;
    const base = Math.atan2(m.dirY, m.dirX);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.32;
      ctx.shoot({ x: m.x, y: m.y, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, r: 3, life: 3, dmg: m.dmg, side: 'enemy', kind: 'orb', color: '#c8a8ff' });
    }
    m.state = 'recover';
    m.t = 0.4;
    m.aiT = 2.4 + ctx.rng.next() * 0.6;
  }
}

function golem(m: Monster, p: Player, ctx: MineCtx, dt: number): void {
  const d = Math.hypot(p.x - m.x, p.y - m.y);
  if (m.state === 'move') {
    aimAt(m, p);
    moveWithWalls(m, ctx, m.dirX * m.def.speed * dt, m.dirY * m.def.speed * dt);
    if (d < 40) {
      m.state = 'windup';
      m.t = 0.85;
      ctx.telegraph({ kind: 'circle', x: m.x, y: m.y, r: 32, angle: 0, len: 0, width: 0, t: 0.85, max: 0.85 });
    }
  } else if (m.state === 'windup' && m.t <= 0) {
    ctx.hurtPlayersInCircle(m.x, m.y, 32, m.dmg, m.x, m.y);
    ctx.shake(4);
    ctx.sfx('explosion');
    m.state = 'recover';
    m.t = 0.8;
  } else if (m.state === 'recover' && m.t <= 0) m.state = 'move';
}

function matriarch(m: Monster, p: Player, ctx: MineCtx, dt: number): void {
  if (m.phase === 1 && m.hp < m.maxHp * 0.5) {
    m.phase = 2;
    ctx.sfx('bossRoar');
    ctx.shake(6);
  }
  if (m.state === 'move') {
    aimAt(m, p);
    moveWithWalls(m, ctx, m.dirX * 20 * dt, m.dirY * 20 * dt);
    m.aiT -= dt;
    if (m.aiT > 0) return;
    m.action = (m.action + 1) % 3;
    if (m.action === 0) {
      aimAt(m, p);
      m.state = 'windup';
      m.t = 0.9;
      ctx.telegraph({ kind: 'line', x: m.x, y: m.y, r: 0, angle: Math.atan2(m.dirY, m.dirX), len: 260, width: 30, t: 0.9, max: 0.9 });
      ctx.sfx('telegraph');
    } else if (m.action === 1) {
      m.state = 'windup';
      m.t = 0.7;
      ctx.telegraph({ kind: 'circle', x: m.x, y: m.y, r: 26, angle: 0, len: 0, width: 0, t: 0.7, max: 0.7 });
    } else {
      if (ctx.minions() < 4) {
        for (let i = 0; i < (m.phase === 2 ? 3 : 2); i++) ctx.spawn('slime', m.x + (i - 1) * 24, m.y + 20);
        ctx.sfx('magic');
      }
      m.aiT = 1.2;
    }
  } else if (m.state === 'windup' && m.t <= 0) {
    if (m.action === 0) {
      m.state = 'act';
      m.t = 1.3;
      ctx.sfx('dash');
    } else {
      const bursts = m.phase === 2 ? 2 : 1;
      for (let b = 0; b < bursts; b++) {
        const n = m.phase === 2 ? 16 : 12;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + b * (Math.PI / n);
          const sp = 90 - b * 25;
          ctx.shoot({ x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3, life: 3.5, dmg: m.dmg, side: 'enemy', kind: 'shard', color: b ? '#9fd8ff' : '#ff9ad8' });
        }
      }
      ctx.sfx('magic');
      m.state = 'recover';
      m.t = 0.8;
    }
  } else if (m.state === 'act') {
    moveWithWalls(m, ctx, m.dirX * 235 * dt, m.dirY * 235 * dt);
    if (m.hitWall) {
      m.state = 'stun';
      m.t = 1.3;
      ctx.shake(7);
      ctx.sfx('explosion');
    } else if (m.t <= 0) {
      m.state = 'recover';
      m.t = 0.5;
    }
  } else if ((m.state === 'recover' || m.state === 'stun') && m.t <= 0) {
    m.state = 'move';
    m.aiT = m.phase === 2 ? 0.7 : 1.1;
  }
}

function wyrm(m: Monster, p: Player, ctx: MineCtx, dt: number): void {
  if (m.phase === 1 && m.hp < m.maxHp * 0.5) {
    m.phase = 2;
    ctx.setDarkness(true);
    ctx.sfx('bossRoar');
    ctx.shake(8);
  }
  // 몸통은 머리를 따라간다
  let px = m.x;
  let py = m.y;
  for (const s of m.segs) {
    const d = Math.hypot(s.x - px, s.y - py);
    if (d > 11) {
      s.x = px + ((s.x - px) / d) * 11;
      s.y = py + ((s.y - py) / d) * 11;
    }
    px = s.x;
    py = s.y;
  }
  if (m.state === 'move') {
    const ang = Math.atan2(p.y - m.y, p.x - m.x) + Math.sin(m.animT * 2) * 0.7;
    m.dirX = Math.cos(ang);
    m.dirY = Math.sin(ang);
    moveWithWalls(m, ctx, m.dirX * 58 * dt, m.dirY * 58 * dt);
    m.aiT -= dt;
    if (m.aiT > 0) return;
    const opts = m.phase === 2 ? 4 : 2;
    m.action = (m.action + 1) % opts;
    aimAt(m, p);
    const a = Math.atan2(m.dirY, m.dirX);
    if (m.action === 0) {
      m.state = 'windup';
      m.t = 0.8;
      ctx.telegraph({ kind: 'line', x: m.x, y: m.y, r: 0, angle: a, len: 210, width: 26, t: 0.8, max: 0.8 });
      ctx.sfx('telegraph');
    } else if (m.action === 1) {
      m.state = 'windup';
      m.t = 0.85;
      ctx.telegraph({ kind: 'cone', x: m.x, y: m.y, r: 0, angle: a, len: 120, width: 0.5, t: 0.85, max: 0.85 });
      ctx.sfx('telegraph');
    } else if (m.action === 2) {
      m.state = 'act';
      m.t = 2.6;
      m.emitT = 0;
      ctx.sfx('bossRoar');
    } else {
      if (ctx.minions() < 3) {
        ctx.spawn('wisp', m.x - 30, m.y);
        ctx.spawn('wisp', m.x + 30, m.y);
        ctx.sfx('magic');
      }
      m.aiT = 1;
    }
  } else if (m.state === 'windup' && m.t <= 0) {
    m.state = 'act';
    m.t = m.action === 0 ? 0.55 : 1.1;
    m.emitT = 0;
    if (m.action === 0) ctx.sfx('dash');
  } else if (m.state === 'act') {
    if (m.action === 0) {
      moveWithWalls(m, ctx, m.dirX * 290 * dt, m.dirY * 290 * dt);
      if (m.hitWall) {
        m.t = 0;
        ctx.shake(5);
      }
    } else if (m.action === 1) {
      m.emitT -= dt;
      while (m.emitT <= 0) {
        m.emitT += 0.045;
        const a = Math.atan2(m.dirY, m.dirX) + (ctx.rng.next() - 0.5) * 0.9;
        const sp = 130 + ctx.rng.next() * 40;
        ctx.shoot({ x: m.x + m.dirX * 10, y: m.y + m.dirY * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 4, life: 0.85, dmg: 10, side: 'enemy', kind: 'fire', color: '#ff8a3a' });
      }
    } else if (m.action === 2) {
      m.emitT -= dt;
      while (m.emitT <= 0) {
        m.emitT += 0.09;
        const base = m.animT * 2.4;
        for (let arm = 0; arm < 3; arm++) {
          const a = base + (arm / 3) * Math.PI * 2;
          ctx.shoot({ x: m.x, y: m.y, vx: Math.cos(a) * 78, vy: Math.sin(a) * 78, r: 3, life: 4, dmg: 11, side: 'enemy', kind: 'shadow', color: '#c08aff' });
        }
      }
    }
    if (m.t <= 0) {
      m.state = 'recover';
      m.t = 0.7;
    }
  } else if (m.state === 'recover' && m.t <= 0) {
    m.state = 'move';
    m.aiT = m.phase === 2 ? 0.8 : 1.2;
  }
}

// ── 층 생성 ──────────────────────────────────────────
export interface MineFloor {
  map: GameMap;
  floor: number;
  spawn: { x: number; y: number };
  stairs: { x: number; y: number };
  portal: { x: number; y: number };
  waves: MonsterType[][];
  boss: MonsterType | null;
}

export function oreFor(floor: number, rng: Rng): string {
  if (rng.chance(0.06 + floor * 0.006)) return 'relic';
  if (floor >= 6 && rng.chance(0.45)) return 'star_crystal';
  if (floor >= 3 && rng.chance(0.55)) return 'moonsilver';
  return 'copper';
}

export function waveCount(floor: number): number {
  return floor < 4 ? 2 : 3;
}

export function buildWaves(floor: number, rng: Rng): MonsterType[][] {
  if (floor === MATRIARCH_FLOOR || floor === WYRM_FLOOR) return [];
  const pool: MonsterType[] =
    floor <= 2 ? ['slime', 'slime', 'bat'] : floor <= 4 ? ['slime', 'bat', 'wisp'] : floor <= 7 ? ['bat', 'wisp', 'golem', 'slime'] : ['wisp', 'golem', 'bat', 'golem'];
  const waves: MonsterType[][] = [];
  for (let w = 0; w < waveCount(floor); w++) {
    const n = 2 + Math.floor(floor / 2) + w;
    const wave: MonsterType[] = [];
    for (let i = 0; i < n; i++) wave.push(rng.pick(pool));
    waves.push(wave);
  }
  return waves;
}

export function genMineFloor(floor: number, seed: number): MineFloor {
  const rng = new Rng(seed ^ (floor * 0x9e37));
  const m = newMap('mine', MINE_W, MINE_H, 'mfloor');
  fillG(m, 0, 0, MINE_W, 2, 'mwall');
  fillG(m, 0, 2, MINE_W, 1, 'mface');
  fillG(m, 0, MINE_H - 1, MINE_W, 1, 'mwall');
  fillG(m, 0, 0, 1, MINE_H, 'mwall');
  fillG(m, MINE_W - 1, 0, 1, MINE_H, 'mwall');
  const boss = floor === MATRIARCH_FLOOR ? 'matriarch' : floor === WYRM_FLOOR ? 'wyrm' : null;
  const spawn = { x: 13, y: 15 };
  const stairs = { x: 12, y: 3 };
  const portal = { x: 3, y: 15 };
  const reserved = (x: number, y: number) =>
    Math.abs(x - spawn.x) + Math.abs(y - spawn.y) < 4 ||
    (Math.abs(x - stairs.x - 0.5) < 3 && y < 7) ||
    Math.abs(x - portal.x) + Math.abs(y - portal.y) < 3 ||
    (boss !== null && Math.abs(x - 13) < 7 && Math.abs(y - 9) < 5);
  // 기둥 바위
  const pillars = boss ? 4 : rng.int(5, 8);
  for (let i = 0; i < pillars; i++) {
    const x = rng.int(3, MINE_W - 4);
    const y = rng.int(5, MINE_H - 4);
    const shape = rng.int(0, 2);
    const cells = shape === 0 ? [[0, 0]] : shape === 1 ? [[0, 0], [1, 0]] : [[0, 0], [0, 1], [1, 1]];
    for (const [dx, dy] of cells) {
      const cx = x + dx!;
      const cy = y + dy!;
      if (!reserved(cx, cy) && !m.objects.some((o) => o.tx === cx && o.ty === cy))
        m.objects.push({ kind: 'rock', tx: cx, ty: cy, tw: 1, th: 1, solid: true, v: rng.int(0, 3) });
    }
  }
  // 광석
  const ores = boss ? 3 : rng.int(3, 6);
  for (let i = 0; i < ores; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const x = rng.int(2, MINE_W - 3);
      const y = rng.int(4, MINE_H - 3);
      if (reserved(x, y) || m.objects.some((o) => Math.abs(o.tx - x) < 2 && Math.abs(o.ty - y) < 2)) continue;
      const o: MapObj = { kind: 'ore', tx: x, ty: y, tw: 1, th: 1, solid: true, data: oreFor(floor, rng), hp: 3, v: rng.int(0, 3) };
      m.objects.push(o);
      break;
    }
  }
  for (let i = 0; i < m.w * m.h; i++) {
    const g = m.ground[i]!;
    m.blocked[i] = g === 'mwall' || g === 'mface' ? 1 : 0;
  }
  m.spawn = { tx: spawn.x, ty: spawn.y };
  return { map: m, floor, spawn, stairs, portal, waves: buildWaves(floor, rng), boss };
}

export function tilePx(t: number): number {
  return t * TILE + TILE / 2;
}
