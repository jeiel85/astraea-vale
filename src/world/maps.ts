import { noise } from '../art/pixel';
import { TILE } from '../engine/screen';

export type MapId = 'farm' | 'village' | 'mine';
export type Ground =
  | 'grass' | 'flower' | 'path' | 'cobble' | 'water' | 'sand' | 'farmland'
  | 'cliff' | 'cliffTop' | 'mfloor' | 'mwall' | 'mface';

export type ObjKind =
  | 'house' | 'barn' | 'observatory' | 'bin' | 'cauldron' | 'mineEntrance' | 'tree'
  | 'fenceH' | 'fenceV' | 'store' | 'forge' | 'bakery' | 'fountain' | 'lantern'
  | 'telescope' | 'bench' | 'stage' | 'flowerBox' | 'starArch' | 'banner' | 'flag'
  | 'rock' | 'ore' | 'stairs' | 'portal';

export type Interaction =
  | 'sleep' | 'ship' | 'craft' | 'observatory' | 'mine' | 'barn' | 'lookbook'
  | 'telescope' | 'stairs' | 'portal' | 'fountain' | 'banner';

export interface MapObj {
  kind: ObjKind;
  /** 발자국(충돌·정렬 기준) 타일 영역 */
  tx: number;
  ty: number;
  tw: number;
  th: number;
  solid: boolean;
  interact?: Interaction;
  /** 그리기 변형 값 */
  v?: number;
  /** 광산 광석 종류 등 */
  data?: string;
  hp?: number;
  /** 마을 등급·축제 등 표시 조건 */
  show?: 'rank1' | 'rank2' | 'rank3' | 'rank4' | 'rank5' | 'festival' | 'banner';
}

export interface Exit {
  tx: number;
  ty: number;
  tw: number;
  th: number;
  to: MapId;
  spawn: { tx: number; ty: number };
}

export interface GameMap {
  id: MapId;
  w: number;
  h: number;
  ground: Ground[];
  objects: MapObj[];
  exits: Exit[];
  /** 고정 지형 충돌(오브젝트 충돌은 따로 계산) */
  blocked: Uint8Array;
  spawn: { tx: number; ty: number };
}

export function newMap(id: MapId, w: number, h: number, fill: Ground): GameMap {
  return {
    id,
    w,
    h,
    ground: new Array<Ground>(w * h).fill(fill),
    objects: [],
    exits: [],
    blocked: new Uint8Array(w * h),
    spawn: { tx: 1, ty: 1 },
  };
}

export function fillG(m: GameMap, x0: number, y0: number, w: number, h: number, g: Ground): void {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < m.w && y < m.h) m.ground[y * m.w + x] = g;
}

export function groundAt(m: GameMap, tx: number, ty: number): Ground | null {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return null;
  return m.ground[ty * m.w + tx]!;
}

function obj(m: GameMap, o: MapObj): MapObj {
  m.objects.push(o);
  return o;
}

function treeLine(m: GameMap, x0: number, y0: number, x1: number, y1: number, skip: (x: number, y: number) => boolean = () => false): void {
  for (let y = y0; y <= y1; y += 2)
    for (let x = x0; x <= x1; x += 2) if (!skip(x, y)) obj(m, { kind: 'tree', tx: x, ty: y, tw: 2, th: 1, solid: true, v: Math.floor(noise(x, y) * 4) });
}

function sprinkleFlowers(m: GameMap, rate: number): void {
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) if (m.ground[y * m.w + x] === 'grass' && noise(x, y, 77) < rate) m.ground[y * m.w + x] = 'flower';
}

function finalizeBlocked(m: GameMap): void {
  for (let i = 0; i < m.w * m.h; i++) {
    const g = m.ground[i]!;
    m.blocked[i] = g === 'cliff' || g === 'cliffTop' || g === 'mwall' || g === 'mface' ? 1 : 0;
  }
}

// ── 농장 ─────────────────────────────────────────────
export const FARM_FIELD = { x: 12, y: 13, w: 22, h: 12 };
export const PASTURE = { x: 37, y: 19, w: 12, h: 6 };
export const FARM_W = 52;
export const FARM_H = 36;

export function buildFarm(): GameMap {
  const m = newMap('farm', FARM_W, FARM_H, 'grass');
  // 길
  fillG(m, 7, 9, 1, 2, 'path');
  fillG(m, 2, 10, 50, 2, 'path');
  fillG(m, 25, 8, 1, 2, 'path');
  fillG(m, 34, 10, 2, 23, 'path');
  fillG(m, 34, 32, 10, 2, 'path');
  fillG(m, 11, 12, 1, 1, 'path');
  // 밭
  fillG(m, FARM_FIELD.x, FARM_FIELD.y, FARM_FIELD.w, FARM_FIELD.h, 'farmland');
  // 연못
  for (let y = 20; y < 32; y++)
    for (let x = 0; x < 12; x++) {
      const d = Math.hypot((x - 5.5) / 5, (y - 25.5) / 4.2);
      if (d < 0.82) m.ground[y * m.w + x] = 'water';
      else if (d < 1.08) m.ground[y * m.w + x] = 'sand';
    }
  // 광산 절벽
  fillG(m, 37, 27, 15, 5, 'cliff');
  fillG(m, 37, 27, 15, 1, 'cliffTop');
  sprinkleFlowers(m, 0.06);

  // 건물
  obj(m, { kind: 'house', tx: 4, ty: 3, tw: 7, th: 6, solid: true, interact: 'sleep' });
  obj(m, { kind: 'bin', tx: 11, ty: 8, tw: 2, th: 1, solid: true, interact: 'ship' });
  obj(m, { kind: 'cauldron', tx: 2, ty: 7, tw: 2, th: 2, solid: true, interact: 'craft' });
  obj(m, { kind: 'banner', tx: 12, ty: 5, tw: 1, th: 1, solid: true, interact: 'banner', show: 'banner' });
  obj(m, { kind: 'observatory', tx: 23, ty: 3, tw: 5, th: 6, solid: true, interact: 'observatory' });
  obj(m, { kind: 'barn', tx: 42, ty: 13, tw: 6, th: 5, solid: true, interact: 'barn' });
  obj(m, { kind: 'mineEntrance', tx: 40, ty: 28, tw: 4, th: 4, solid: true, interact: 'mine' });
  // 목장 울타리 (출입구: 위쪽 38~39)
  for (let x = 36; x <= 49; x++) {
    if (x !== 38 && x !== 39) obj(m, { kind: 'fenceH', tx: x, ty: 18, tw: 1, th: 1, solid: true });
    obj(m, { kind: 'fenceH', tx: x, ty: 25, tw: 1, th: 1, solid: true });
  }
  for (let y = 19; y <= 24; y++) {
    obj(m, { kind: 'fenceV', tx: 36, ty: y, tw: 1, th: 1, solid: true });
    obj(m, { kind: 'fenceV', tx: 49, ty: y, tw: 1, th: 1, solid: true });
  }
  fillG(m, 38, 12, 2, 7, 'path');
  // 테두리 나무
  treeLine(m, 0, 0, 50, 0);
  treeLine(m, 0, 2, 0, 34, (_x, y) => y === 10);
  treeLine(m, 0, 34, 36, 34);
  treeLine(m, 50, 2, 50, 26, (_x, y) => y === 10);
  // 장식 나무
  for (const [x, y] of [[14, 6], [17, 3], [30, 5], [33, 2], [20, 28], [26, 30], [14, 30], [44, 2], [47, 6], [2, 14]] as const)
    obj(m, { kind: 'tree', tx: x, ty: y, tw: 2, th: 1, solid: true, v: Math.floor(noise(x, y) * 4) });

  m.exits.push({ tx: 51, ty: 10, tw: 1, th: 2, to: 'village', spawn: { tx: 1, ty: 15 } });
  m.spawn = { tx: 7, ty: 10 };
  finalizeBlocked(m);
  // 연못은 걸어 들어가 헤엄칠 수 있다(막지 않음)
  return m;
}

// ── 마을 ─────────────────────────────────────────────
export const VILLAGE_W = 46;
export const VILLAGE_H = 32;

export function buildVillage(): GameMap {
  const m = newMap('village', VILLAGE_W, VILLAGE_H, 'grass');
  fillG(m, 0, 15, 14, 2, 'path');
  fillG(m, 13, 8, 20, 16, 'cobble');
  fillG(m, 19, 2, 8, 6, 'cobble');
  fillG(m, 6, 8, 8, 2, 'path');
  fillG(m, 33, 8, 7, 2, 'path');
  fillG(m, 33, 19, 2, 12, 'path');
  fillG(m, 33, 30, 7, 1, 'path');
  sprinkleFlowers(m, 0.07);

  obj(m, { kind: 'store', tx: 3, ty: 2, tw: 7, th: 6, solid: true });
  obj(m, { kind: 'forge', tx: 36, ty: 2, tw: 7, th: 6, solid: true });
  obj(m, { kind: 'bakery', tx: 36, ty: 24, tw: 7, th: 6, solid: true });
  obj(m, { kind: 'fountain', tx: 21, ty: 14, tw: 3, th: 2, solid: true, interact: 'fountain' });
  obj(m, { kind: 'telescope', tx: 22, ty: 3, tw: 2, th: 1, solid: true, interact: 'telescope' });
  obj(m, { kind: 'bench', tx: 15, ty: 20, tw: 2, th: 1, solid: true });
  obj(m, { kind: 'bench', tx: 28, ty: 20, tw: 2, th: 1, solid: true });
  obj(m, { kind: 'stage', tx: 19, ty: 9, tw: 5, th: 1, solid: true, show: 'festival' });
  for (const [x, y] of [[13, 8], [32, 8], [13, 23], [32, 23], [17, 8], [28, 8]] as const)
    obj(m, { kind: 'lantern', tx: x, ty: y, tw: 1, th: 1, solid: true, show: 'rank2' });
  for (const [x, y] of [[3, 8], [8, 8], [36, 8], [41, 8]] as const) obj(m, { kind: 'flowerBox', tx: x, ty: y, tw: 1, th: 1, solid: false, show: 'rank1' });
  for (const [x, y] of [[14, 9], [31, 9], [14, 22], [31, 22]] as const) obj(m, { kind: 'flag', tx: x, ty: y, tw: 1, th: 1, solid: true, show: 'rank3' });
  obj(m, { kind: 'starArch', tx: 11, ty: 16, tw: 1, th: 1, solid: false, show: 'rank5' });

  treeLine(m, 0, 0, 44, 0);
  treeLine(m, 0, 2, 0, 30, (_x, y) => y === 14 || y === 16);
  treeLine(m, 44, 2, 44, 30);
  treeLine(m, 0, 30, 30, 30);
  for (const [x, y] of [[4, 20], [7, 25], [11, 27], [3, 12], [27, 27], [16, 27], [42, 18], [40, 13]] as const)
    obj(m, { kind: 'tree', tx: x, ty: y, tw: 2, th: 1, solid: true, v: Math.floor(noise(x, y) * 4) });

  m.exits.push({ tx: 0, ty: 15, tw: 1, th: 2, to: 'farm', spawn: { tx: 49, ty: 10 } });
  m.spawn = { tx: 1, ty: 15 };
  finalizeBlocked(m);
  return m;
}

export function inField(tx: number, ty: number): boolean {
  return tx >= FARM_FIELD.x && ty >= FARM_FIELD.y && tx < FARM_FIELD.x + FARM_FIELD.w && ty < FARM_FIELD.y + FARM_FIELD.h;
}

export function tileCenter(t: number): number {
  return t * TILE + TILE / 2;
}
