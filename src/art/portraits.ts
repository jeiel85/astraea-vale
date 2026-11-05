import type { CharLook } from '../data/npcs';
import { ellipse, poly, rect, shade, sprite, type Ctx } from './pixel';

const OUT = '#2a1f3a';
export type Expression = 'normal' | 'happy' | 'surprised';
export const PORTRAIT = 50;

/** 90년대 아니메풍 흉상 초상화(48x48 + 테두리) */
export function portraitSprite(id: string, l: CharLook, expr: Expression): HTMLCanvasElement {
  return sprite(`portrait:${id}:${expr}:${l.hair}:${l.eyes}:${l.outfit}:${l.hairStyle}:${l.skin}`, PORTRAIT, PORTRAIT, (x) => {
    x.translate(1, 1);
    draw(x, l, expr);
  }, OUT);
}

function draw(x: Ctx, l: CharLook, expr: Expression): void {
  const h = l.hair;
  const hs = l.hairShade;
  const hi = shade(l.hair, 0.4);
  const skinS = shade(l.skin, -0.12);
  // 뒷머리
  if (l.hairStyle === 1) {
    poly(x, hs, [8, 16, 40, 16, 44, 47, 4, 47]);
  } else if (l.hairStyle === 2) {
    ellipse(x, hs, 6, 30, 6, 16);
    ellipse(x, hs, 42, 30, 6, 16);
    ellipse(x, h, 6, 28, 4.5, 15);
    ellipse(x, h, 42, 28, 4.5, 15);
  } else if (l.hairStyle === 3) {
    poly(x, hs, [34, 8, 46, 14, 44, 40, 38, 30]);
  }
  // 어깨·옷
  ellipse(x, shade(l.outfit, -0.2), 24, 50, 21, 12);
  ellipse(x, l.outfit, 24, 49, 19, 11);
  poly(x, l.accent, [17, 39, 24, 46, 31, 39, 28, 39, 24, 43, 20, 39]);
  // 목
  rect(x, skinS, 20, 33, 8, 7);
  // 얼굴(V자 턱)
  ellipse(x, l.skin, 24, 22, 13, 13);
  poly(x, l.skin, [11.5, 24, 24, 38, 36.5, 24]);
  poly(x, skinS, [16, 32, 24, 38, 32, 32, 24, 36]);
  // 귀
  ellipse(x, l.skin, 10.5, 26, 2, 3);
  ellipse(x, l.skin, 37.5, 26, 2, 3);
  // 눈
  for (const [ex, dir] of [[17.5, -1], [30.5, 1]] as const) {
    if (expr === 'happy') {
      x.strokeStyle = '#2a1a2a';
      x.lineWidth = 1.6;
      x.beginPath();
      x.arc(ex, 28, 3.6, Math.PI * 1.1, Math.PI * 1.9);
      x.stroke();
      continue;
    }
    const big = expr === 'surprised' ? 0.6 : 0;
    ellipse(x, '#ffffff', ex, 26, 3.8 + big, 5 + big);
    ellipse(x, l.eyes, ex, 27, 3 + big * 0.5, 4.2);
    ellipse(x, shade(l.eyes, -0.45), ex, 27.5, 1.8, 2.6);
    ellipse(x, shade(l.eyes, 0.35), ex, 30, 2, 1);
    rect(x, '#ffffff', ex - 2.5, 23.5, 2, 2);
    rect(x, '#ffffff', ex + 1, 29, 1, 1);
    // 속눈썹
    poly(x, '#2a1a2a', [ex - 4.5, 22.5, ex + 4.5, 21.5, ex + 4.5 + dir * 1, 23, ex - 4.5, 23.5]);
    rect(x, '#2a1a2a', dir > 0 ? ex + 3.5 : ex - 5.5, 22, 2, 1);
  }
  // 눈썹
  rect(x, hs, 14, 18, 6, 1);
  rect(x, hs, 28, 18, 6, 1);
  // 볼터치, 코, 입
  ellipse(x, '#ff9aa8', 14, 32, 2.6, 1.1);
  ellipse(x, '#ff9aa8', 34, 32, 2.6, 1.1);
  rect(x, skinS, 24, 30, 1, 2);
  if (expr === 'happy' || expr === 'surprised') {
    ellipse(x, '#c84a5a', 24, 35, 2.4, expr === 'surprised' ? 2 : 1.4);
    rect(x, '#ffffff', 23, 34, 2, 1);
  } else {
    rect(x, '#c86a6a', 22, 35, 4, 1);
    rect(x, '#c86a6a', 21, 34, 1, 1);
    rect(x, '#c86a6a', 26, 34, 1, 1);
  }
  // 앞머리
  ellipse(x, h, 24, 13, 16, 11);
  const bangs = [9, 15, 21, 27, 33, 39];
  bangs.forEach((bx, i) => {
    const len = i === 0 || i === bangs.length - 1 ? 30 : 20 + (i % 2) * 3;
    poly(x, i % 2 ? h : shade(h, -0.08), [bx - 4, 12, bx + 4, 12, bx + (i < 3 ? 1 : -1), len]);
  });
  // 옆머리
  const sideLen = l.hairStyle === 0 || l.hairStyle === 4 ? 30 : 40;
  poly(x, h, [8, 14, 13, 16, 12, sideLen, 8, sideLen - 4]);
  poly(x, h, [40, 14, 35, 16, 36, sideLen, 40, sideLen - 4]);
  poly(x, hs, [10, 20, 12, 20, 11, sideLen - 2]);
  poly(x, hs, [38, 20, 36, 20, 37, sideLen - 2]);
  // 광택 띠(천사의 고리)
  x.strokeStyle = hi;
  x.lineWidth = 1.6;
  x.beginPath();
  x.arc(24, 18, 12, Math.PI * 1.15, Math.PI * 1.45);
  x.stroke();
  x.beginPath();
  x.arc(24, 18, 12, Math.PI * 1.6, Math.PI * 1.8);
  x.stroke();
  if (l.hairStyle === 4) {
    for (const [sx, sy] of [[10, 6], [18, 1], [27, 0], [35, 3], [41, 9]]) poly(x, h, [sx! - 4, 10, sx!, sy!, sx! + 4, 10]);
  }
  // 장신구
  if (l.accessory === 'glasses') {
    x.strokeStyle = '#c8d8ea';
    x.lineWidth = 1;
    x.strokeRect(12.5, 21.5, 10, 9);
    x.strokeRect(25.5, 21.5, 10, 9);
    rect(x, '#c8d8ea', 22, 24, 4, 1);
  } else if (l.accessory === 'headband') {
    poly(x, l.accent, [8, 11, 40, 11, 40, 14, 8, 14]);
    rect(x, shade(l.accent, -0.3), 8, 13, 32, 1);
  } else if (l.accessory === 'starpin') {
    poly(x, '#ffe27a', [36, 5, 37.5, 8.5, 41, 9, 38.5, 11.5, 39.5, 15, 36, 13, 32.5, 15, 33.5, 11.5, 31, 9, 34.5, 8.5]);
    rect(x, '#ffffff', 35, 9, 1, 1);
  } else if (l.accessory === 'ribbon') {
    poly(x, l.accent, [24, 4, 14, 0, 15, 9]);
    poly(x, l.accent, [24, 4, 34, 0, 33, 9]);
    ellipse(x, shade(l.accent, -0.25), 24, 4, 2.5, 2.5);
  }
}
