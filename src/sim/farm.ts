import { cropBySeed, cropDef, cropGrowsIn, type CropDef } from '../data/crops';
import type { Quality } from '../data/items';
import { Rng } from '../engine/rng';
import {
  CONSTELLATION_NAMES,
  isFullMoon,
  isNight,
  seasonOf,
  solarEclipseActive,
  type Constellation,
} from './calendar';
import { plotKey, type GameState, type ItemStack, type Plot } from './state';

export type FarmResult = { ok: true; msg?: string } | { ok: false; msg: string };

export function getPlot(s: GameState, x: number, y: number): Plot | undefined {
  return s.plots[plotKey(x, y)];
}

export function till(s: GameState, x: number, y: number): FarmResult {
  const k = plotKey(x, y);
  const p = s.plots[k];
  if (p) {
    if (p.crop?.dead) {
      p.crop = null;
      return { ok: true, msg: '시든 작물을 정리했다.' };
    }
    return { ok: false, msg: '이미 갈아 둔 밭이다.' };
  }
  s.plots[k] = { watered: false, crop: null, rune: null };
  return { ok: true };
}

export function water(s: GameState, x: number, y: number): boolean {
  const p = getPlot(s, x, y);
  if (!p || p.watered) return false;
  p.watered = true;
  return true;
}

/** 지팡이 마법 관개: 정사각 범위의 밭에 모두 물을 준다. 물 준 칸 수를 돌려준다. */
export function irrigate(s: GameState, cx: number, cy: number, radius: number): number {
  let n = 0;
  for (let y = cy - radius; y <= cy + radius; y++)
    for (let x = cx - radius; x <= cx + radius; x++) if (water(s, x, y)) n++;
  return n;
}

export function plant(s: GameState, x: number, y: number, seedId: string): FarmResult {
  const p = getPlot(s, x, y);
  const crop = cropBySeed(seedId);
  if (!crop) return { ok: false, msg: '씨앗이 아니다.' };
  if (!p) return { ok: false, msg: '먼저 괭이로 밭을 갈아야 한다.' };
  if (p.crop) return { ok: false, msg: '이미 무언가 심겨 있다.' };
  if (!cropGrowsIn(crop, seasonOf(s.day))) return { ok: false, msg: `${crop.name}은(는) 이 계절에 자라지 않는다.` };
  if (crop.requiredConstellation && p.rune !== crop.requiredConstellation) {
    return { ok: false, msg: `${crop.seedName}은(는) ${CONSTELLATION_NAMES[crop.requiredConstellation]} 룬이 새겨진 밭에서만 싹튼다.` };
  }
  p.crop = { id: crop.id, growth: 0, bloomed: false, dead: false, harvests: 0 };
  return { ok: true };
}

export function isMature(p: Plot): boolean {
  if (!p.crop || p.crop.dead) return false;
  return p.crop.growth >= cropDef(p.crop.id).growDays;
}

export function isHarvestable(p: Plot): boolean {
  if (!isMature(p)) return false;
  const c = cropDef(p.crop!.id);
  return c.special !== 'fullMoonBloom' || p.crop!.bloomed;
}

/** 그리기용 성장 단계 0(씨앗)~4(다 자람) */
export function growthStage(p: Plot): number {
  if (!p.crop) return -1;
  const c = cropDef(p.crop.id);
  if (p.crop.growth >= c.growDays) return 4;
  return Math.min(3, Math.floor((p.crop.growth / c.growDays) * 4));
}

export interface HarvestCtx {
  day: number;
  minutes: number;
  rng: Rng;
}

export function harvestQuality(p: Plot, c: CropDef, ctx: HarvestCtx): Quality {
  if (c.special === 'eclipseTriple' && solarEclipseActive(ctx.day, ctx.minutes)) return 2;
  if (p.rune === 'eclipse' && ctx.rng.chance(0.5)) return 2;
  if (p.rune === 'cassiopeia') return 1;
  return 0;
}

/** 수확해 얻은 아이템을 돌려준다. 수확할 수 없으면 null. */
export function harvest(s: GameState, x: number, y: number, ctx: HarvestCtx): ItemStack | null {
  const p = getPlot(s, x, y);
  if (!p || !isHarvestable(p)) return null;
  const c = cropDef(p.crop!.id);
  const q = harvestQuality(p, c, ctx);
  const n = c.yield + (p.rune === 'phoenix' ? 1 : 0);
  p.crop!.harvests++;
  if (c.regrowDays) {
    p.crop!.growth = c.growDays - c.regrowDays;
  } else {
    p.crop = null;
    p.rune = null;
  }
  s.stats.harvested += n;
  return { id: c.id, n, q };
}

/** 별자리 룬을 범위 안의 갈아 둔 밭에 새긴다. 새긴 칸 수를 돌려준다. */
export function weaveRune(s: GameState, cx: number, cy: number, radius: number, c: Constellation): number {
  let n = 0;
  for (let y = cy - radius; y <= cy + radius; y++)
    for (let x = cx - radius; x <= cx + radius; x++) {
      const p = getPlot(s, x, y);
      if (p) {
        p.rune = c;
        n++;
      }
    }
  if (n > 0) s.stats.woven++;
  return n;
}

/** 정수 비료: 작물을 한 단계(성장일의 1/4, 최소 1일) 키운다. */
export function fertilizePlot(s: GameState, x: number, y: number): FarmResult {
  const p = getPlot(s, x, y);
  if (!p?.crop || p.crop.dead) return { ok: false, msg: '자라고 있는 작물에만 쓸 수 있다.' };
  const c = cropDef(p.crop.id);
  if (p.crop.growth >= c.growDays) return { ok: false, msg: '이미 다 자랐다.' };
  p.crop.growth = Math.min(c.growDays, p.crop.growth + Math.max(1, Math.ceil(c.growDays / 4)));
  return { ok: true };
}

/** 보름달 밤이 되면 다 자란 봉오리가 꽃을 피운다. 새로 핀 개수를 돌려준다. */
export function bloomUnderFullMoon(s: GameState, day: number, minutes: number): number {
  if (!isFullMoon(day) || !isNight(minutes)) return 0;
  let n = 0;
  for (const p of Object.values(s.plots)) {
    if (p.crop && !p.crop.bloomed && isMature(p) && cropDef(p.crop.id).special === 'fullMoonBloom') {
      p.crop.bloomed = true;
      n++;
    }
  }
  return n;
}

export interface NightGrowth {
  grown: number;
  withered: number;
  bloomed: number;
}

/**
 * 하루가 끝날 때 밭을 갱신한다. endedDay는 방금 끝난 날.
 * 물 준 작물이 자라고(오리온 룬은 하루 더), 보름달 밤에 개화하며,
 * 계절이 바뀌면 제철이 아닌 작물은 시든다(불사조 룬은 예외).
 */
export function growNight(s: GameState, endedDay: number, newDay: number): NightGrowth {
  const out: NightGrowth = { grown: 0, withered: 0, bloomed: 0 };
  const seasonChanged = seasonOf(endedDay) !== seasonOf(newDay);
  const newSeason = seasonOf(newDay);
  for (const p of Object.values(s.plots)) {
    const crop = p.crop;
    if (crop && !crop.dead) {
      const c = cropDef(crop.id);
      if (p.watered && crop.growth < c.growDays) {
        crop.growth = Math.min(c.growDays, crop.growth + (p.rune === 'orion' ? 2 : 1));
        out.grown++;
      }
      if (c.special === 'fullMoonBloom' && !crop.bloomed && isFullMoon(endedDay) && crop.growth >= c.growDays) {
        crop.bloomed = true;
        out.bloomed++;
      }
      if (seasonChanged && !cropGrowsIn(c, newSeason) && p.rune !== 'phoenix') {
        crop.dead = true;
        out.withered++;
      }
    }
    p.watered = false;
  }
  return out;
}

export function rainOnFarm(s: GameState): void {
  for (const p of Object.values(s.plots)) p.watered = true;
}
