import type { CharLook, NpcDef } from '../data/npcs';
import type { DeviceId } from '../engine/input';
import { MAX_ENERGY, MAX_HP, MAX_MANA, type Animal } from '../sim/state';

export type Facing = 'down' | 'up' | 'left' | 'right';

export interface Buffs {
  aegis: number;
  gale: number;
  eclipse: number;
}

export class Player {
  x: number;
  y: number;
  facing: Facing = 'down';
  moving = false;
  animT = 0;
  hp = MAX_HP;
  energy = MAX_ENERGY;
  mana = MAX_MANA;
  slot = 0;
  // 전투
  attackT = 0;
  attackDur = 0;
  comboStep = 0;
  comboWindow = 0;
  swingAngle = 0;
  swingHit = new Set<object>();
  dashT = 0;
  dashCd = 0;
  dashX = 0;
  dashY = 0;
  /** 대시 직후 짧은 시간 공격하면 돌진 베기 */
  dashStrikeWindow = 0;
  iframes = 0;
  hurtT = 0;
  kbx = 0;
  kby = 0;
  magicCd = 0;
  downed = false;
  revive = 0;
  buffs: Buffs = { aegis: 0, gale: 0, eclipse: 0 };
  toolT = 0;
  toolKind = '';
  swimming = false;
  lastAimX = 0;
  lastAimY = 1;

  constructor(
    public index: number,
    public dev: DeviceId,
    public look: CharLook,
    public pattern: number[] | null,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
  }

  get attacking(): boolean {
    return this.attackT > 0;
  }
  get dashing(): boolean {
    return this.dashT > 0;
  }
  get invulnerable(): boolean {
    return this.iframes > 0 || this.dashT > 0 || this.buffs.aegis > 0 || this.downed;
  }
}

export class AnimalEnt {
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait = 0;
  animT = 0;
  flip = false;
  heartT = 0;
  constructor(public data: Animal, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.tx = x;
    this.ty = y;
  }
}

export class NpcEnt {
  x = 0;
  y = 0;
  tx = 0;
  ty = 0;
  visible = false;
  facing: Facing = 'down';
  moving = false;
  animT = 0;
  path: { x: number; y: number }[] = [];
  constructor(public def: NpcDef) {}
  get look(): CharLook {
    return this.def.look;
  }
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  gravity?: number;
  glow?: boolean;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  big?: boolean;
}

export interface Pickup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  id: string;
  n: number;
  gold: number;
  t: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  dmg: number;
  /** player = 플레이어 마법, enemy = 적 탄 */
  side: 'player' | 'enemy';
  kind: 'slice' | 'orb' | 'shard' | 'fire' | 'shadow';
  hit: Set<object>;
  owner?: Player;
  color: string;
}

/** 지면에 그리는 공격 예고(빨간 표시) */
export interface Telegraph {
  kind: 'circle' | 'line' | 'cone';
  x: number;
  y: number;
  r: number;
  angle: number;
  len: number;
  width: number;
  t: number;
  max: number;
}

/** 휘두르기 잔상 */
export interface SlashFx {
  x: number;
  y: number;
  angle: number;
  arc: number;
  r: number;
  life: number;
  max: number;
  color: string;
  heavy: boolean;
}
