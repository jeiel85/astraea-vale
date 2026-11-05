import type { CharLook } from '../data/npcs';
import type { Appearance } from '../sim/state';
import { PATTERN_PALETTE } from './patterns';
import { rect, shade, sprite, type Ctx } from './pixel';

export type Dir = 'down' | 'up' | 'side';
export const CHAR_W = 18;
export const CHAR_H = 26;
const OUT = '#2a1f3a';
const EYE_DARK = '#2a1a2a';
const BLUSH = '#ff9aa8';

export function appearanceToLook(a: Appearance): CharLook {
  return {
    skin: a.skin,
    hair: a.hair,
    hairShade: shade(a.hair, -0.35),
    eyes: a.eyes,
    outfit: a.outfit,
    outfitShade: shade(a.outfit, -0.25),
    accent: a.accent,
    pants: shade(a.outfit, -0.55),
    hairStyle: a.hairStyle,
  };
}

export function lookKey(l: CharLook, pattern: number[] | null): string {
  const p = pattern ? pattern.join('') : '';
  return [l.skin, l.hair, l.eyes, l.outfit, l.accent, l.pants, l.hairStyle, l.accessory ?? '', hashStr(p)].join('|');
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** 캐시된 캐릭터 스프라이트. frame 0=정지, 1/2=걷기 */
export function charSprite(l: CharLook, dir: Dir, frame: number, pattern: number[] | null = null): HTMLCanvasElement {
  const key = `ch:${lookKey(l, pattern)}:${dir}:${frame}`;
  return sprite(key, CHAR_W, CHAR_H, (x) => {
    x.translate(1, 1);
    if (dir === 'down') drawFront(x, l, frame, pattern);
    else if (dir === 'up') drawBack(x, l, frame);
    else drawSide(x, l, frame);
  }, OUT);
}

function legs(x: Ctx, l: CharLook, frame: number, side: boolean): void {
  const shoe = shade(l.pants, -0.45);
  if (side) {
    if (frame === 0) {
      rect(x, l.pants, 6, 17, 4, 3);
      rect(x, shoe, 6, 20, 5, 1);
    } else {
      rect(x, shade(l.pants, -0.2), 4, 17, 2, 3);
      rect(x, shoe, 3, 20, 3, 1);
      rect(x, l.pants, 9, 17, 2, 3);
      rect(x, shoe, 9, 20, 3, 1);
      rect(x, l.pants, 6, 17, 3, 1);
    }
    return;
  }
  const lUp = frame === 1 ? 1 : 0;
  const rUp = frame === 2 ? 1 : 0;
  rect(x, l.pants, 5, 17, 2, 3 - lUp);
  rect(x, shoe, 5, 20 - lUp, 2, 1);
  rect(x, l.pants, 9, 17, 2, 3 - rUp);
  rect(x, shoe, 9, 20 - rUp, 2, 1);
}

function torso(x: Ctx, l: CharLook, frame: number, front: boolean, pattern: number[] | null): void {
  rect(x, l.outfit, 4, 12, 8, 5);
  rect(x, l.outfitShade, 4, 16, 8, 1);
  rect(x, l.outfitShade, 11, 12, 1, 5);
  if (pattern) {
    for (let by = 0; by < 4; by++)
      for (let bx = 0; bx < 6; bx++) {
        const v = pattern[(by * 3 + 2) * 16 + (bx * 2 + 2)]!;
        if (v >= 0) rect(x, PATTERN_PALETTE[v]!, 5 + bx, 13 + by);
      }
  }
  if (front) {
    rect(x, l.accent, 6, 12, 4, 1);
    rect(x, l.accent, 7, 13, 2, 1);
  }
  const la = frame === 1 ? 1 : 0;
  const ra = frame === 2 ? 1 : 0;
  rect(x, l.outfit, 3, 12 + ra, 1, 3);
  rect(x, l.skin, 3, 15 + ra, 1, 1);
  rect(x, l.outfitShade, 12, 12 + la, 1, 3);
  rect(x, l.skin, 12, 15 + la, 1, 1);
}

function headFront(x: Ctx, l: CharLook): void {
  rect(x, l.skin, 4, 3, 8, 1);
  rect(x, l.skin, 3, 4, 10, 6);
  rect(x, l.skin, 4, 10, 8, 1);
  rect(x, l.skin, 5, 11, 6, 1);
  rect(x, shade(l.skin, -0.12), 5, 11, 6, 1);
}

function eyesFront(x: Ctx, l: CharLook): void {
  const iris = l.eyes;
  const irisD = shade(l.eyes, -0.3);
  for (const ex of [5, 9]) {
    rect(x, EYE_DARK, ex, 6, 2, 1);
    rect(x, '#ffffff', ex, 7, 1, 1);
    rect(x, iris, ex + 1, 7, 1, 1);
    rect(x, irisD, ex, 8, 2, 1);
  }
  rect(x, BLUSH, 4, 9);
  rect(x, BLUSH, 11, 9);
  rect(x, shade(l.skin, -0.3), 7, 10, 2, 1);
}

function hairFrontTop(x: Ctx, l: CharLook): void {
  const h = l.hair;
  const hs = l.hairShade;
  const hi = shade(l.hair, 0.35);
  rect(x, h, 5, 1, 6, 1);
  rect(x, h, 3, 2, 10, 1);
  rect(x, h, 2, 3, 12, 2);
  // 앞머리
  for (const bx of [2, 3, 4, 6, 7, 9, 11, 12, 13]) rect(x, h, bx, 5);
  rect(x, hs, 7, 5);
  rect(x, hs, 11, 5);
  // 옆머리
  const side = l.hairStyle === 0 || l.hairStyle === 4 ? 3 : 5;
  rect(x, h, 2, 6, 2, side);
  rect(x, h, 12, 6, 2, side);
  rect(x, hs, 3, 6, 1, side);
  rect(x, hs, 12, 6, 1, side);
  // 90년대풍 머리 광택 띠
  rect(x, hi, 4, 3, 3, 1);
  rect(x, hi, 9, 3, 2, 1);
  rect(x, hi, 5, 2, 1, 1);
  if (l.hairStyle === 4) {
    for (const sx of [3, 6, 9, 12]) rect(x, h, sx, 0, 1, 1);
    rect(x, h, 2, 1, 12, 1);
  }
}

function accessory(x: Ctx, l: CharLook, dir: Dir): void {
  if (!l.accessory) return;
  if (l.accessory === 'glasses' && dir !== 'up') {
    const c = '#d8e4f0';
    if (dir === 'down') {
      rect(x, c, 4, 6, 4, 1);
      rect(x, c, 8, 6, 4, 1);
      rect(x, c, 4, 9, 4, 1);
      rect(x, c, 8, 9, 4, 1);
    } else {
      rect(x, c, 9, 6, 4, 1);
      rect(x, c, 9, 9, 4, 1);
    }
  } else if (l.accessory === 'headband') {
    if (dir === 'side') rect(x, l.accent, 3, 4, 10, 1);
    else rect(x, l.accent, 2, 4, 12, 1);
  } else if (l.accessory === 'starpin') {
    const c = '#ffe27a';
    const px = dir === 'side' ? 6 : 11;
    rect(x, c, px, 2, 1, 3);
    rect(x, c, px - 1, 3, 3, 1);
  } else if (l.accessory === 'ribbon') {
    const c = l.accent;
    const px = dir === 'side' ? 3 : 6;
    rect(x, c, px, 0, 2, 2);
    rect(x, c, px + 3, 0, 2, 2);
    rect(x, shade(c, -0.3), px + 2, 1, 1, 1);
  }
}

function drawFront(x: Ctx, l: CharLook, frame: number, pattern: number[] | null): void {
  const h = l.hair;
  const hs = l.hairShade;
  if (l.hairStyle === 1) {
    rect(x, hs, 2, 6, 12, 10);
  } else if (l.hairStyle === 2) {
    rect(x, h, 0, 5, 3, 9);
    rect(x, hs, 0, 5, 1, 9);
    rect(x, h, 13, 5, 3, 9);
    rect(x, hs, 15, 5, 1, 9);
    rect(x, l.accent, 1, 5, 2, 1);
    rect(x, l.accent, 13, 5, 2, 1);
  } else if (l.hairStyle === 3) {
    rect(x, hs, 12, 2, 3, 7);
  }
  legs(x, l, frame, false);
  torso(x, l, frame, true, pattern);
  headFront(x, l);
  eyesFront(x, l);
  hairFrontTop(x, l);
  accessory(x, l, 'down');
}

function drawBack(x: Ctx, l: CharLook, frame: number): void {
  const h = l.hair;
  const hs = l.hairShade;
  const hi = shade(l.hair, 0.35);
  legs(x, l, frame, false);
  torso(x, l, frame, false, null);
  rect(x, l.skin, 6, 11, 4, 1);
  rect(x, h, 5, 1, 6, 1);
  rect(x, h, 3, 2, 10, 1);
  rect(x, h, 2, 3, 12, 7);
  rect(x, h, 3, 10, 10, 1);
  rect(x, hs, 2, 8, 12, 2);
  rect(x, hi, 5, 3, 6, 1);
  if (l.hairStyle === 1) {
    rect(x, h, 3, 11, 10, 4);
    rect(x, hs, 3, 14, 10, 1);
  } else if (l.hairStyle === 2) {
    rect(x, h, 0, 5, 3, 9);
    rect(x, h, 13, 5, 3, 9);
    rect(x, l.accent, 1, 5, 2, 1);
    rect(x, l.accent, 13, 5, 2, 1);
  } else if (l.hairStyle === 3) {
    rect(x, l.accent, 7, 8, 2, 1);
    rect(x, h, 6, 9, 4, 5);
    rect(x, hs, 7, 13, 2, 2);
  } else if (l.hairStyle === 4) {
    for (const sx of [3, 6, 9, 12]) rect(x, h, sx, 0, 1, 1);
    rect(x, h, 2, 1, 12, 1);
  }
  accessory(x, l, 'up');
}

function drawSide(x: Ctx, l: CharLook, frame: number): void {
  const h = l.hair;
  const hs = l.hairShade;
  const hi = shade(l.hair, 0.35);
  if (l.hairStyle === 1) rect(x, hs, 3, 5, 6, 11);
  else if (l.hairStyle === 2) {
    rect(x, h, 1, 5, 3, 9);
    rect(x, hs, 1, 5, 1, 9);
    rect(x, l.accent, 2, 5, 2, 1);
  } else if (l.hairStyle === 3) {
    rect(x, h, 0, 4, 4, 3);
    rect(x, h, 0, 7, 3, 5);
    rect(x, hs, 0, 10, 2, 2);
    rect(x, l.accent, 3, 4, 1, 2);
  }
  legs(x, l, frame, true);
  // 몸통(옆)
  rect(x, l.outfit, 5, 12, 6, 5);
  rect(x, l.outfitShade, 5, 16, 6, 1);
  rect(x, l.accent, 9, 12, 2, 1);
  const armX = frame === 1 ? 9 : frame === 2 ? 5 : 7;
  rect(x, l.outfitShade, armX, 12, 2, 3);
  rect(x, l.skin, armX, 15, 2, 1);
  // 머리
  rect(x, l.skin, 5, 3, 7, 1);
  rect(x, l.skin, 4, 4, 9, 6);
  rect(x, l.skin, 5, 10, 7, 1);
  rect(x, shade(l.skin, -0.12), 6, 11, 5, 1);
  rect(x, l.skin, 13, 7, 1, 1);
  // 눈
  rect(x, EYE_DARK, 10, 6, 2, 1);
  rect(x, '#ffffff', 10, 7, 1, 1);
  rect(x, l.eyes, 11, 7, 1, 1);
  rect(x, shade(l.eyes, -0.3), 10, 8, 2, 1);
  rect(x, BLUSH, 11, 9);
  rect(x, shade(l.skin, -0.3), 12, 10, 1, 1);
  // 머리카락
  rect(x, h, 5, 1, 6, 1);
  rect(x, h, 4, 2, 9, 1);
  rect(x, h, 3, 3, 11, 2);
  rect(x, h, 3, 5, 6, 5);
  rect(x, h, 12, 5, 2, 1);
  rect(x, h, 4, 10, 4, 1);
  rect(x, hs, 3, 8, 5, 2);
  rect(x, l.skin, 7, 7, 1, 2);
  rect(x, hi, 6, 3, 4, 1);
  if (l.hairStyle === 1) rect(x, h, 3, 10, 5, 4);
  if (l.hairStyle === 4) {
    for (const sx of [4, 7, 10]) rect(x, h, sx, 0, 1, 1);
    rect(x, h, 2, 3, 1, 2);
  }
  accessory(x, l, 'side');
}
