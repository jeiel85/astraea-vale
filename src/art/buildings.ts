import type { Season } from '../sim/calendar';
import { PATTERN_PALETTE } from './patterns';
import { ellipse, noise, poly, rect, shade, sprite, type Ctx } from './pixel';

const OUT = '#2a1f3a';

function windowPane(x: Ctx, px: number, py: number, lit: boolean): void {
  rect(x, '#5a3e2a', px - 1, py - 1, 12, 12);
  rect(x, lit ? '#ffe9a0' : '#9fd0ff', px, py, 10, 10);
  rect(x, lit ? '#ffd060' : '#cfe8ff', px, py, 4, 4);
  rect(x, '#5a3e2a', px + 4, py, 2, 10);
  rect(x, '#5a3e2a', px, py + 4, 10, 2);
}

function door(x: Ctx, px: number, py: number, color: string): void {
  rect(x, shade(color, -0.35), px - 1, py - 1, 16, 21);
  rect(x, color, px, py, 14, 20);
  rect(x, shade(color, 0.2), px + 2, py + 2, 4, 7);
  rect(x, shade(color, 0.2), px + 8, py + 2, 4, 7);
  rect(x, '#ffe27a', px + 10, py + 11, 2, 2);
}

function roof(x: Ctx, w: number, top: number, h: number, color: string, snow: boolean): void {
  const d = shade(color, -0.25);
  poly(x, d, [0, top + h, w / 2, top, w, top + h]);
  poly(x, color, [3, top + h - 2, w / 2, top + 3, w - 3, top + h - 2]);
  // 기와 줄: 삼각형 안쪽 폭만큼만 긋는다
  for (let i = 1; i < 6; i++) {
    const yy = top + h - 2 - i * 5;
    const half = ((yy - top - 3) / (h - 5)) * (w / 2 - 3) - 3;
    if (half > 2) rect(x, d, Math.round(w / 2 - half), yy, Math.round(half * 2), 1);
  }
  rect(x, shade(color, -0.4), 0, top + h - 2, w, 3);
  if (snow) {
    poly(x, '#ffffff', [w / 2, top, w / 2 - 14, top + 9, w / 2 + 14, top + 9]);
    rect(x, '#ffffff', 2, top + h - 4, w - 4, 2);
  }
}

/** 집 112x96. 문은 아래 가운데. */
export function houseSprite(season: Season, night: boolean): HTMLCanvasElement {
  return sprite(`house:${season}:${night}`, 114, 98, (x) => {
    x.translate(1, 1);
    rect(x, '#f4e4cc', 8, 40, 96, 54);
    rect(x, '#e0ccb0', 8, 86, 96, 8);
    for (let i = 0; i < 6; i++) rect(x, '#e8d6bc', 8, 46 + i * 8, 96, 1);
    roof(x, 112, 0, 46, '#d85a7a', season === 3);
    rect(x, '#b84a6a', 74, 6, 12, 22);
    rect(x, '#8a3a5a', 74, 6, 12, 3);
    windowPane(x, 20, 56, night);
    windowPane(x, 82, 56, night);
    door(x, 49, 74, '#8a5a3a');
    rect(x, '#a8784a', 44, 92, 24, 2);
    // 화분
    for (const px of [36, 70]) {
      rect(x, '#c8784a', px, 86, 8, 7);
      ellipse(x, season === 3 ? '#e0e8f0' : '#5fb85a', px + 4, 85, 5, 3);
      if (season < 2) rect(x, '#ff8ab8', px + 3, 83, 2, 2);
    }
  }, OUT);
}

/** 헛간(목장) 96x80 */
export function barnSprite(season: Season): HTMLCanvasElement {
  return sprite(`barn:${season}`, 98, 82, (x) => {
    x.translate(1, 1);
    rect(x, '#c84a4a', 6, 34, 84, 44);
    for (let i = 0; i < 10; i++) rect(x, '#b03a3a', 8 + i * 8, 34, 1, 44);
    roof(x, 96, 0, 38, '#6a5a7a', season === 3);
    rect(x, '#f4e4cc', 32, 48, 32, 30);
    rect(x, '#8a3a3a', 34, 50, 28, 28);
    poly(x, '#f4e4cc', [34, 50, 62, 78, 59, 78, 34, 53]);
    poly(x, '#f4e4cc', [62, 50, 34, 78, 37, 78, 62, 53]);
    rect(x, '#ffe27a', 44, 16, 8, 8);
    rect(x, '#c8a03a', 47, 16, 2, 8);
  }, OUT);
}

/** 관측소 80x96: 돔 지붕과 망원경 */
export function observatorySprite(night: boolean): HTMLCanvasElement {
  return sprite(`obs:${night}`, 82, 98, (x) => {
    x.translate(1, 1);
    rect(x, '#d8d0e8', 10, 44, 60, 50);
    for (let i = 0; i < 5; i++) rect(x, '#c4bcd8', 10, 50 + i * 9, 60, 1);
    ellipse(x, '#4a4a8a', 40, 44, 34, 30);
    ellipse(x, '#5a5aa8', 38, 40, 30, 26);
    rect(x, '#2a2a5a', 36, 14, 8, 30);
    poly(x, '#c8a86a', [40, 22, 70, 2, 74, 8, 44, 28]);
    rect(x, '#ffe27a', 68, 2, 6, 6);
    rect(x, '#d8d0e8', 6, 44, 68, 3);
    for (let i = 0; i < 7; i++) rect(x, '#ffe27a', 14 + Math.floor(noise(i, 3) * 50), 22 + Math.floor(noise(3, i) * 18), 1, 1);
    windowPane(x, 16, 58, night);
    windowPane(x, 54, 58, night);
    door(x, 33, 74, '#4a4a8a');
  }, OUT);
}

export function shopSprite(kind: 'store' | 'forge' | 'bakery', season: Season, night: boolean): HTMLCanvasElement {
  return sprite(`shop:${kind}:${season}:${night}`, 114, 90, (x) => {
    x.translate(1, 1);
    const wall = kind === 'forge' ? '#a8988a' : kind === 'bakery' ? '#fff0e0' : '#e8f4e0';
    const roofC = kind === 'forge' ? '#5a4a5a' : kind === 'bakery' ? '#ff8ac8' : '#3a8a6a';
    rect(x, wall, 8, 36, 96, 50);
    if (kind === 'forge') for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) rect(x, '#988a7a', 8 + c * 12 + (r % 2) * 6, 38 + r * 8, 11, 1);
    roof(x, 112, 0, 40, roofC, season === 3);
    // 차양
    for (let i = 0; i < 12; i++) rect(x, i % 2 ? '#ffffff' : roofC, 10 + i * 8, 40, 8, 6);
    for (let i = 0; i < 12; i++) ellipse(x, i % 2 ? '#ffffff' : roofC, 14 + i * 8, 46, 4, 2);
    windowPane(x, 20, 54, night);
    windowPane(x, 82, 54, night);
    door(x, 49, 66, kind === 'forge' ? '#5a4a4a' : '#8a5a3a');
    // 간판
    rect(x, '#8a5a3a', 40, 24, 32, 12);
    rect(x, '#f4e4cc', 42, 26, 28, 8);
    if (kind === 'store') {
      ellipse(x, '#5fb85a', 52, 30, 3, 2);
      rect(x, '#ff4f6d', 58, 28, 4, 4);
    } else if (kind === 'forge') {
      rect(x, '#5a5a6a', 50, 28, 12, 3);
      rect(x, '#5a5a6a', 54, 31, 4, 3);
      rect(x, '#ff8a3a', 66, 74, 6, 8);
      rect(x, '#ffe27a', 67, 76, 4, 4);
    } else {
      ellipse(x, '#d89a5a', 56, 30, 7, 3);
      rect(x, '#b87a3a', 52, 29, 1, 2);
      rect(x, '#b87a3a', 56, 29, 1, 2);
      rect(x, '#b87a3a', 60, 29, 1, 2);
    }
  }, OUT);
}

export function shippingBinSprite(): HTMLCanvasElement {
  return sprite('bin', 26, 22, (x) => {
    x.translate(1, 1);
    rect(x, '#8a5a3a', 0, 6, 24, 14);
    rect(x, '#a8784a', 1, 7, 22, 3);
    rect(x, '#6a4a2a', 0, 4, 24, 3);
    rect(x, '#c8a86a', 10, 10, 4, 4);
    rect(x, '#ffe27a', 11, 11, 2, 2);
  }, OUT);
}

export function cauldronSprite(t: number): HTMLCanvasElement {
  const f = Math.floor(t * 4) % 3;
  return sprite(`cauldron:${f}`, 26, 26, (x) => {
    x.translate(1, 1);
    rect(x, '#5a4a4a', 4, 18, 3, 6);
    rect(x, '#5a4a4a', 17, 18, 3, 6);
    ellipse(x, '#3a3a4a', 12, 15, 11, 8);
    ellipse(x, '#5a5a6a', 11, 13, 8, 5);
    ellipse(x, '#2a2a3a', 12, 9, 10, 3);
    ellipse(x, '#b06aff', 12, 9, 8, 2);
    for (let i = 0; i < 3; i++) ellipse(x, '#e0b0ff', 6 + i * 5 + f, 6 - ((i + f) % 3), 1.5, 1.5);
    rect(x, '#ff8a3a', 8, 22, 8, 2);
    rect(x, '#ffe27a', 10, 22, 4, 1);
  }, OUT);
}

export function fountainSprite(t: number, sparkle: boolean): HTMLCanvasElement {
  const f = Math.floor(t * 5) % 3;
  return sprite(`fountain:${f}:${sparkle}`, 50, 42, (x) => {
    x.translate(1, 1);
    ellipse(x, '#a090b4', 24, 30, 23, 10);
    ellipse(x, '#5a9ae0', 24, 29, 19, 7);
    rect(x, '#b8a8c8', 21, 8, 6, 22);
    ellipse(x, '#b8a8c8', 24, 10, 8, 3);
    for (let i = 0; i < 5; i++) ellipse(x, '#cfe8ff', 24 + (i - 2) * 4, 4 + ((i + f) % 3), 1.2, 2);
    ellipse(x, '#9fd0ff', 24, 26 + f * 0.3, 10, 2);
    if (sparkle) for (let i = 0; i < 6; i++) rect(x, '#ffe27a', 6 + Math.floor(noise(i, f) * 36), 18 + Math.floor(noise(f, i) * 16), 1, 1);
  }, OUT);
}

export function lanternSprite(lit: boolean): HTMLCanvasElement {
  return sprite(`lantern:${lit}`, 12, 30, (x) => {
    x.translate(1, 1);
    rect(x, '#4a3a5a', 4, 10, 2, 18);
    rect(x, '#4a3a5a', 1, 26, 8, 2);
    rect(x, '#4a3a5a', 1, 2, 8, 2);
    rect(x, lit ? '#ffe27a' : '#c8b88a', 2, 4, 6, 6);
    rect(x, lit ? '#ffffff' : '#e0d0a0', 3, 5, 2, 2);
    rect(x, '#4a3a5a', 3, 0, 4, 2);
  }, OUT);
}

export function bannerSprite(pattern: number[] | null, color: string): HTMLCanvasElement {
  const key = pattern ? pattern.join(',') : 'none';
  return sprite(`banner:${color}:${hashCode(key)}`, 20, 34, (x) => {
    x.translate(1, 1);
    rect(x, '#8a6a4a', 0, 0, 2, 32);
    rect(x, '#ffe27a', 0, 0, 2, 2);
    rect(x, color, 2, 2, 16, 18);
    poly(x, color, [2, 20, 18, 20, 10, 25]);
    if (pattern) {
      for (let py = 0; py < 16; py++)
        for (let px = 0; px < 16; px++) {
          const v = pattern[py * 16 + px]!;
          if (v >= 0) rect(x, PATTERN_PALETTE[v]!, 2 + px, 3 + py);
        }
    }
  }, OUT);
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export function flowerBoxSprite(season: Season): HTMLCanvasElement {
  return sprite(`fbox:${season}`, 22, 14, (x) => {
    x.translate(1, 1);
    rect(x, '#a8784a', 0, 6, 20, 6);
    rect(x, '#8a5a3a', 0, 10, 20, 2);
    const cols = season === 3 ? ['#ffffff', '#cfe0ff'] : ['#ff8ab8', '#ffe27a', '#c8a8ff', '#ff6a6a'];
    for (let i = 0; i < 5; i++) {
      ellipse(x, '#5fb85a', 2 + i * 4, 6, 2, 1.5);
      rect(x, cols[i % cols.length]!, 1 + i * 4, 2, 3, 3);
    }
  }, OUT);
}

export function starArchSprite(t: number): HTMLCanvasElement {
  const f = Math.floor(t * 4) % 2;
  return sprite(`arch:${f}`, 66, 50, (x) => {
    x.translate(1, 1);
    rect(x, '#c8a86a', 2, 10, 4, 38);
    rect(x, '#c8a86a', 58, 10, 4, 38);
    x.strokeStyle = '#c8a86a';
    x.lineWidth = 4;
    x.beginPath();
    x.arc(32, 30, 28, Math.PI * 1.05, Math.PI * 1.95);
    x.stroke();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.1 + i * 0.13);
      const sx = 32 + Math.cos(a) * 28;
      const sy = 30 + Math.sin(a) * 28;
      rect(x, (i + f) % 2 ? '#ffe27a' : '#ffffff', sx - 1, sy - 1, 3, 3);
    }
  }, OUT);
}

export function mineEntranceSprite(): HTMLCanvasElement {
  return sprite('mineEntrance', 66, 58, (x) => {
    x.translate(1, 1);
    ellipse(x, '#5a4a6a', 32, 34, 32, 26);
    ellipse(x, '#7a6a8a', 30, 30, 28, 22);
    ellipse(x, '#140e20', 32, 42, 14, 16);
    rect(x, '#140e20', 18, 42, 28, 14);
    rect(x, '#8a5a3a', 16, 26, 4, 30);
    rect(x, '#8a5a3a', 44, 26, 4, 30);
    rect(x, '#8a5a3a', 14, 24, 36, 4);
    rect(x, '#ffb03a', 18, 32, 2, 3);
    rect(x, '#ffb03a', 44, 32, 2, 3);
  }, OUT);
}

export function telescopeSprite(): HTMLCanvasElement {
  return sprite('telescope', 26, 30, (x) => {
    x.translate(1, 1);
    ellipse(x, '#c8a86a', 12, 25, 10, 3);
    rect(x, '#5a4a6a', 11, 14, 2, 12);
    rect(x, '#5a4a6a', 6, 22, 2, 5);
    rect(x, '#5a4a6a', 16, 22, 2, 5);
    poly(x, '#4a4a8a', [4, 16, 20, 4, 23, 8, 7, 20]);
    rect(x, '#ffe27a', 20, 3, 3, 3);
  }, OUT);
}

export function benchSprite(): HTMLCanvasElement {
  return sprite('bench', 34, 18, (x) => {
    x.translate(1, 1);
    rect(x, '#a8784a', 0, 4, 32, 4);
    rect(x, '#8a5a3a', 0, 8, 32, 2);
    rect(x, '#a8784a', 0, 0, 32, 3);
    rect(x, '#5a4a4a', 2, 10, 2, 6);
    rect(x, '#5a4a4a', 28, 10, 2, 6);
  }, OUT);
}

export function stageSprite(): HTMLCanvasElement {
  return sprite('stage', 82, 34, (x) => {
    x.translate(1, 1);
    rect(x, '#8a5a3a', 0, 12, 80, 20);
    rect(x, '#c8986a', 0, 10, 80, 4);
    for (let i = 0; i < 10; i++) poly(x, i % 2 ? '#ff8ac8' : '#ffe27a', [i * 8, 14, i * 8 + 8, 14, i * 8 + 4, 22]);
  }, OUT);
}
