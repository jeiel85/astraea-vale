import { cropDef } from '../data/crops';
import type { Season } from '../sim/calendar';
import { ellipse, mix, noise, poly, rect, shade, sprite } from './pixel';

const OUT = '#2a1f3a';

/** 계절별 풀 색 */
const GRASS: Record<Season, [string, string, string]> = {
  0: ['#7cc86a', '#69b45c', '#9be08a'],
  1: ['#5fb85a', '#4fa04c', '#86d070'],
  2: ['#c8a85a', '#b08c48', '#e0c070'],
  3: ['#dfe8f2', '#c8d4e4', '#ffffff'],
};

export function grassTile(season: Season, tx: number, ty: number): HTMLCanvasElement {
  const v = Math.floor(noise(tx, ty) * 4);
  return sprite(`g:${season}:${v}`, 16, 16, (x) => {
    const [a, b, c] = GRASS[season];
    rect(x, a, 0, 0, 16, 16);
    for (let i = 0; i < 9; i++) {
      const px = Math.floor(noise(v, i, 1) * 15);
      const py = Math.floor(noise(v, i, 2) * 15);
      rect(x, b, px, py, 1, 2);
      if (i % 3 === 0) rect(x, c, px + 1, py, 1, 1);
    }
  });
}

export function flowerTile(season: Season, tx: number, ty: number): HTMLCanvasElement {
  const v = Math.floor(noise(tx, ty, 7) * 3);
  return sprite(`fl:${season}:${v}`, 16, 16, (x) => {
    x.drawImage(grassTile(season, 0, 0), 0, 0);
    const cols = season === 3 ? ['#ffffff', '#cfe0ff'] : ['#ffd0e4', '#ffe27a', '#ffffff', '#c8a8ff'];
    for (let i = 0; i < 3; i++) {
      const px = 2 + Math.floor(noise(v, i, 3) * 11);
      const py = 2 + Math.floor(noise(v, i, 4) * 11);
      const c = cols[(v + i) % cols.length]!;
      rect(x, c, px - 1, py, 3, 1);
      rect(x, c, px, py - 1, 1, 3);
      rect(x, '#ffb03a', px, py, 1, 1);
    }
  });
}

export function pathTile(tx: number, ty: number): HTMLCanvasElement {
  const v = Math.floor(noise(tx, ty, 9) * 3);
  return sprite(`p:${v}`, 16, 16, (x) => {
    rect(x, '#d8b88a', 0, 0, 16, 16);
    for (let i = 0; i < 7; i++) {
      const px = Math.floor(noise(v, i, 5) * 14);
      const py = Math.floor(noise(v, i, 6) * 14);
      rect(x, '#c0a070', px, py, 2, 1);
      rect(x, '#e8d0a8', px + 1, py + 1, 1, 1);
    }
  });
}

export function cobbleTile(tx: number, ty: number): HTMLCanvasElement {
  const v = (tx + ty) % 2;
  return sprite(`cb:${v}`, 16, 16, (x) => {
    rect(x, '#b8a8c8', 0, 0, 16, 16);
    const st = (sx: number, sy: number, w: number, h: number) => {
      rect(x, '#d8cce4', sx, sy, w, h);
      rect(x, '#a090b4', sx, sy + h - 1, w, 1);
    };
    if (v) {
      st(0, 0, 7, 7); st(8, 0, 8, 7); st(0, 8, 10, 8); st(11, 8, 5, 8);
    } else {
      st(0, 0, 10, 7); st(11, 0, 5, 7); st(0, 8, 6, 8); st(7, 8, 9, 8);
    }
  });
}

export function sandTile(): HTMLCanvasElement {
  return sprite('sand', 16, 16, (x) => {
    rect(x, '#f0dca8', 0, 0, 16, 16);
    for (let i = 0; i < 8; i++) rect(x, '#e0c890', Math.floor(noise(i, 2) * 15), Math.floor(noise(i, 3) * 15), 1, 1);
  });
}

export function waterTile(frame: number, dark = false): HTMLCanvasElement {
  return sprite(`w:${frame}:${dark}`, 16, 16, (x) => {
    const base = dark ? '#3a4a8a' : '#5a9ae0';
    rect(x, base, 0, 0, 16, 16);
    const hi = dark ? '#5a6ab0' : '#9fd0ff';
    for (let i = 0; i < 3; i++) {
      const px = (Math.floor(noise(i, 9) * 12) + frame * 2) % 14;
      const py = 3 + i * 5;
      rect(x, hi, px, py, 3, 1);
    }
  });
}

export function soilTile(watered: boolean, tx: number, ty: number): HTMLCanvasElement {
  const v = Math.floor(noise(tx, ty, 11) * 2);
  return sprite(`soil:${watered}:${v}`, 16, 16, (x) => {
    const base = watered ? '#6a4a3a' : '#a8784a';
    const line = watered ? '#5a3a2a' : '#8a5e3a';
    const hi = watered ? '#7a5a48' : '#c09060';
    rect(x, base, 1, 1, 14, 14);
    rect(x, line, 1, 14, 14, 1);
    for (let i = 0; i < 3; i++) rect(x, line, 3, 4 + i * 4 + v, 10, 1);
    rect(x, hi, 2, 2, 12, 1);
  });
}

/** 넓은 농지(갈 수 있는 땅) */
export function farmlandTile(season: Season, tx: number, ty: number): HTMLCanvasElement {
  const v = Math.floor(noise(tx, ty, 13) * 3);
  return sprite(`fland:${season}:${v}`, 16, 16, (x) => {
    rect(x, season === 3 ? '#e4dccf' : '#c8a070', 0, 0, 16, 16);
    for (let i = 0; i < 6; i++) rect(x, season === 3 ? '#ffffff' : '#b08858', Math.floor(noise(v, i, 14) * 15), Math.floor(noise(v, i, 15) * 15), 2, 1);
  });
}

export function runeOverlay(c: 'orion' | 'cassiopeia' | 'phoenix' | 'eclipse', t: number): HTMLCanvasElement {
  const f = Math.floor(t * 3) % 2;
  return sprite(`rune:${c}:${f}`, 16, 16, (x) => {
    const col = RUNE_COLORS[c];
    const pts: Record<string, number[]> = {
      orion: [3, 3, 12, 3, 7, 8, 4, 12, 11, 12],
      cassiopeia: [2, 5, 5, 10, 8, 6, 11, 10, 14, 5],
      phoenix: [8, 2, 3, 8, 13, 8, 5, 13, 11, 13],
      eclipse: [8, 3, 3, 8, 8, 13, 13, 8, 8, 8],
    };
    const p = pts[c]!;
    x.strokeStyle = col;
    x.globalAlpha = 0.85;
    x.lineWidth = 1;
    x.beginPath();
    for (let i = 0; i < p.length; i += 2) {
      if (i === 0) x.moveTo(p[i]! + 0.5, p[i + 1]! + 0.5);
      else x.lineTo(p[i]! + 0.5, p[i + 1]! + 0.5);
    }
    x.stroke();
    x.globalAlpha = 1;
    for (let i = 0; i < p.length; i += 2) rect(x, f ? '#ffffff' : col, p[i]!, p[i + 1]!, 1, 1);
  });
}

export const RUNE_COLORS = { orion: '#7fd0ff', cassiopeia: '#ffb0e0', phoenix: '#ffa040', eclipse: '#c08aff' } as const;

/** 작물 스프라이트(16x24, 아래쪽 정렬). stage 0~4 */
export function cropSprite(id: string, stage: number, bloomed: boolean, dead: boolean): HTMLCanvasElement {
  return sprite(`crop:${id}:${stage}:${bloomed}:${dead}`, 18, 26, (x) => {
    x.translate(1, 1);
    const c = cropDef(id);
    const leaf = dead ? '#9a8a6a' : c.leaf;
    const leafD = shade(leaf, -0.25);
    if (stage === 0) {
      rect(x, '#5a3a2a', 6, 20, 1, 1);
      rect(x, '#5a3a2a', 9, 19, 1, 1);
      rect(x, leaf, 7, 18, 2, 2);
      return;
    }
    if (stage === 1) {
      rect(x, leafD, 7, 17, 1, 4);
      ellipse(x, leaf, 5.5, 16.5, 2.2, 1.4);
      ellipse(x, leaf, 9.8, 15.8, 2.2, 1.4);
      return;
    }
    const big = stage >= 3;
    const fruit = dead ? '#8a7a5a' : c.fruit;
    const fruit2 = dead ? '#6a5a4a' : c.fruit2;
    switch (c.shape) {
      case 'root': {
        if (stage === 4) {
          ellipse(x, fruit, 8, 18.5, 3.6, 2.6);
          rect(x, fruit2, 5, 19, 6, 1);
          rect(x, shade(fruit, 0.4), 6, 17, 2, 1);
        }
        for (const [lx, ly, r] of big ? [[4, 12, 2.8], [8, 10, 3], [12, 12, 2.8]] : [[6, 14, 2.2], [10, 14, 2.2]]) {
          ellipse(x, leaf, lx!, ly!, r! * 0.8, r!);
          rect(x, leafD, lx!, ly! + 1, 1, 3);
        }
        break;
      }
      case 'bush': {
        ellipse(x, leafD, 8, 15, big ? 6.5 : 4.5, big ? 5.5 : 4);
        ellipse(x, leaf, 8, 14, big ? 5.8 : 4, big ? 4.6 : 3.4);
        if (stage === 4) for (const [bx, by] of [[5, 13], [10, 12], [7, 16], [11, 16], [8, 11]]) {
          rect(x, fruit, bx!, by!, 2, 2);
          rect(x, shade(fruit, 0.45), bx!, by!, 1, 1);
        }
        break;
      }
      case 'vine': {
        rect(x, '#9a7a4a', 8, big ? 3 : 9, 1, big ? 18 : 12);
        for (let i = 0; i < (big ? 5 : 3); i++) ellipse(x, i % 2 ? leaf : leafD, 8 + (i % 2 ? 3 : -3), 18 - i * 3, 2.6, 1.8);
        if (stage === 4) for (const [bx, by] of [[4, 12], [10, 9], [5, 6], [11, 15]]) {
          ellipse(x, fruit, bx! + 1, by! + 1, 1.8, 2);
          rect(x, shade(fruit, 0.4), bx!, by!, 1, 1);
        }
        break;
      }
      case 'stalk': {
        rect(x, leafD, 7, big ? 1 : 8, 2, big ? 20 : 13);
        for (let i = 0; i < (big ? 4 : 2); i++) poly(x, leaf, [8, 18 - i * 4, i % 2 ? 14 : 2, 14 - i * 4, 8, 16 - i * 4]);
        if (stage === 4) {
          ellipse(x, fruit, 11, 9, 1.8, 3.5);
          rect(x, '#9ad868', 10, 5, 2, 2);
          ellipse(x, fruit, 5, 12, 1.6, 3);
        }
        break;
      }
      case 'gourd': {
        for (const [lx, ly] of [[3, 15], [13, 15], [8, 12]]) ellipse(x, leaf, lx!, ly!, 3, 2.2);
        rect(x, leafD, 7, 13, 2, 4);
        if (stage === 4) {
          ellipse(x, fruit, 8, 18, 5.5, 3.6);
          rect(x, fruit2, 5, 17, 1, 3);
          rect(x, fruit2, 10, 17, 1, 3);
          rect(x, shade(fruit, 0.4), 6, 16, 2, 1);
          rect(x, '#5a7a3a', 8, 14, 1, 1);
        } else if (stage === 3) ellipse(x, fruit2, 8, 18, 2.5, 1.8);
        break;
      }
      case 'head': {
        ellipse(x, leafD, 8, 17, big ? 6 : 4, big ? 4 : 3);
        ellipse(x, leaf, 8, 16, big ? 5 : 3.4, big ? 3.4 : 2.6);
        if (stage === 4) {
          ellipse(x, fruit, 8, 16, 3.4, 2.6);
          rect(x, fruit2, 8, 15, 1, 3);
        }
        break;
      }
      case 'flower':
      case 'lotus': {
        rect(x, leafD, 7, big ? 7 : 12, 2, big ? 13 : 8);
        ellipse(x, leaf, 4, 17, 3, 1.6);
        ellipse(x, leaf, 12, 16, 3, 1.6);
        if (stage === 4 && (bloomed || c.special !== 'fullMoonBloom')) {
          const cx = 8;
          const cy = 6;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ellipse(x, i % 2 ? fruit : mix(fruit, fruit2, 0.4), cx + Math.cos(a) * 3, cy + Math.sin(a) * 2.6, 2, 1.8);
          }
          ellipse(x, fruit2, cx, cy, 1.6, 1.4);
          if (c.shape === 'lotus') ellipse(x, '#ffffff', cx, cy, 0.8, 0.8);
        } else if (stage >= 3) {
          ellipse(x, fruit, 8, 6, 2, 3);
          rect(x, leaf, 7, 8, 2, 1);
        }
        break;
      }
      case 'grain': {
        for (const sx of [4, 8, 12]) {
          rect(x, leafD, sx, big ? 6 : 11, 1, big ? 15 : 10);
          if (stage === 4) {
            ellipse(x, fruit, sx + 0.5, 6, 1.6, 3.4);
            rect(x, fruit2, sx, 4, 1, 1);
          } else if (big) ellipse(x, leaf, sx + 0.5, 8, 1.2, 2.6);
        }
        break;
      }
      case 'pepper': {
        ellipse(x, leafD, 8, 14, big ? 5 : 3.6, big ? 4.5 : 3);
        ellipse(x, leaf, 8, 13, big ? 4.2 : 3, big ? 3.6 : 2.4);
        if (stage === 4) for (const [bx, by] of [[5, 15], [10, 14], [8, 17]]) {
          poly(x, fruit, [bx!, by!, bx! + 2, by!, bx! + 1, by! + 4]);
          rect(x, fruit2, bx!, by! - 1, 1, 1);
          rect(x, fruit2, bx! + 2, by! - 1, 1, 1);
        }
        break;
      }
    }
  }, OUT);
}

export function treeSprite(season: Season, v: number): HTMLCanvasElement {
  return sprite(`tree:${season}:${v}`, 34, 42, (x) => {
    x.translate(1, 1);
    const canopy = season === 0 ? (v % 2 ? '#ffc0d8' : '#6ac06a') : season === 1 ? '#4fa04c' : season === 2 ? (v % 2 ? '#e88a3a' : '#d8b03a') : '#eef4fa';
    const dark = shade(canopy, -0.22);
    const lite = shade(canopy, 0.25);
    rect(x, '#7a5a3a', 13, 26, 6, 13);
    rect(x, '#5a3e2a', 16, 26, 3, 13);
    ellipse(x, dark, 16, 18, 15, 12);
    ellipse(x, canopy, 15, 15, 13, 11);
    ellipse(x, canopy, 9, 20, 7, 6);
    ellipse(x, canopy, 23, 20, 7, 6);
    ellipse(x, lite, 11, 10, 5, 3);
    if (season === 0 && v % 2) for (let i = 0; i < 6; i++) rect(x, '#ffffff', 6 + Math.floor(noise(v, i) * 20), 8 + Math.floor(noise(i, v) * 16), 1, 1);
    if (season === 1) for (let i = 0; i < 4; i++) rect(x, '#ff5a5a', 6 + Math.floor(noise(v, i) * 20), 10 + Math.floor(noise(i, v) * 14), 2, 2);
  }, OUT);
}

export function rockSprite(kind: 'rock' | 'copper' | 'moonsilver' | 'star_crystal' | 'relic', v: number): HTMLCanvasElement {
  return sprite(`rock:${kind}:${v}`, 18, 18, (x) => {
    x.translate(1, 1);
    const base = kind === 'rock' ? '#8a7a8a' : '#6a5a6a';
    ellipse(x, shade(base, -0.25), 8, 10, 7, 5.5);
    ellipse(x, base, 8, 9, 6.5, 5);
    ellipse(x, shade(base, 0.25), 6, 7, 3, 2);
    const gem: Record<string, string> = { copper: '#ff9a4a', moonsilver: '#dfeaff', star_crystal: '#ffe27a', relic: '#5ad8c8' };
    const g = gem[kind];
    if (g) {
      for (let i = 0; i < 4; i++) {
        const gx = 3 + Math.floor(noise(v, i) * 10);
        const gy = 5 + Math.floor(noise(i, v) * 7);
        rect(x, g, gx, gy, 2, 2);
        rect(x, '#ffffff', gx, gy, 1, 1);
      }
      if (kind === 'star_crystal') poly(x, '#ff9ad8', [8, 0, 11, 7, 5, 7]);
      if (kind === 'relic') rect(x, '#c8a86a', 6, 6, 5, 4);
    }
  }, OUT);
}

export function fenceSprite(horizontal: boolean): HTMLCanvasElement {
  return sprite(`fence:${horizontal}`, 16, 20, (x) => {
    const w = '#c89a6a';
    const d = '#8a6040';
    if (horizontal) {
      rect(x, w, 0, 9, 16, 2);
      rect(x, w, 0, 14, 16, 2);
      rect(x, d, 0, 11, 16, 1);
      rect(x, w, 2, 6, 3, 12);
      rect(x, d, 2, 17, 3, 1);
      rect(x, w, 11, 6, 3, 12);
      rect(x, d, 11, 17, 3, 1);
    } else {
      rect(x, w, 6, 2, 4, 18);
      rect(x, d, 9, 2, 1, 18);
    }
  });
}

export function cliffTile(tx: number, ty: number, top: boolean): HTMLCanvasElement {
  const v = Math.floor(noise(tx, ty, 21) * 2);
  return sprite(`cliff:${top}:${v}`, 16, 16, (x) => {
    rect(x, '#7a6a8a', 0, 0, 16, 16);
    rect(x, '#6a5a7a', 0, 8 + v, 16, 1);
    rect(x, '#8a7a9a', 2 + v * 5, 3, 4, 2);
    rect(x, '#5a4a6a', 0, 15, 16, 1);
    if (top) {
      rect(x, '#5fb85a', 0, 0, 16, 3);
      rect(x, '#4fa04c', 0, 3, 16, 1);
    }
  });
}

export function mineFloorTile(tx: number, ty: number, depth: number): HTMLCanvasElement {
  const v = Math.floor(noise(tx, ty, 31) * 4);
  const band = depth >= 7 ? 2 : depth >= 4 ? 1 : 0;
  return sprite(`mf:${band}:${v}`, 16, 16, (x) => {
    const base = ['#5a4a5a', '#3e4a6a', '#3a2a4a'][band]!;
    rect(x, base, 0, 0, 16, 16);
    for (let i = 0; i < 4; i++) rect(x, shade(base, 0.12), Math.floor(noise(v, i, 1) * 14), Math.floor(noise(v, i, 2) * 14), 2, 1);
    if (v === 0) rect(x, shade(base, -0.2), 3, 9, 6, 1);
  });
}

export function mineWallTile(tx: number, ty: number, depth: number, face: boolean): HTMLCanvasElement {
  const v = Math.floor(noise(tx, ty, 41) * 3);
  const band = depth >= 7 ? 2 : depth >= 4 ? 1 : 0;
  return sprite(`mw:${band}:${v}:${face}`, 16, 16, (x) => {
    const base = ['#3a2e3e', '#26304a', '#1e1630'][band]!;
    rect(x, base, 0, 0, 16, 16);
    if (face) {
      rect(x, shade(base, 0.25), 0, 0, 16, 10);
      rect(x, shade(base, 0.4), 1 + v * 4, 2, 4, 2);
      rect(x, shade(base, -0.3), 0, 14, 16, 2);
    } else {
      rect(x, shade(base, 0.1), v * 5, 4, 3, 3);
    }
  });
}

export function stairsSprite(down: boolean): HTMLCanvasElement {
  return sprite(`stairs:${down}`, 24, 24, (x) => {
    rect(x, '#1a1426', 2, 2, 20, 20);
    for (let i = 0; i < 4; i++) rect(x, down ? shade('#8a7a9a', -i * 0.18) : '#ffe27a', 3, 4 + i * 4, 18, 3);
    rect(x, '#c8a86a', 1, 1, 22, 2);
    rect(x, '#c8a86a', 1, 1, 2, 22);
    rect(x, '#c8a86a', 21, 1, 2, 22);
  });
}

export function portalSprite(t: number): HTMLCanvasElement {
  const f = Math.floor(t * 6) % 4;
  return sprite(`portal:${f}`, 24, 24, (x) => {
    ellipse(x, '#3a2a6a', 12, 14, 10, 7);
    ellipse(x, '#8a6ad8', 12, 14, 8, 5.5);
    ellipse(x, '#c8a8ff', 12, 14, 5, 3.5);
    for (let i = 0; i < 4; i++) {
      const a = ((i + f / 4) / 4) * Math.PI * 2;
      rect(x, '#ffe27a', 12 + Math.round(Math.cos(a) * 8), 14 + Math.round(Math.sin(a) * 5), 1, 1);
    }
  });
}
