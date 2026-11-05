import { SPECIES, type Species, type Variant } from '../data/animals';
import { ellipse, noise, poly, rect, shade, sprite } from './pixel';

const OUT = '#2a1f3a';

/** 가축 스프라이트. baby면 작게. frame 0/1 */
export function animalSprite(species: Species, variant: Variant, baby: boolean, frame: number): HTMLCanvasElement {
  return sprite(`an:${species}:${variant}:${baby}:${frame}`, 26, 22, (x) => {
    x.translate(1, 1);
    const [body, sh, mark] = SPECIES[species].colors[variant];
    const s = baby ? 0.7 : 1;
    x.translate(12, 20);
    x.scale(s, s);
    x.translate(-12, -20);
    const bob = frame ? 1 : 0;
    if (species === 'cow') {
      rect(x, sh, 5, 15, 2, 5 - bob);
      rect(x, sh, 16, 15, 2, 5 - bob);
      rect(x, body, 8, 15, 2, 5);
      rect(x, body, 13, 15, 2, 5);
      ellipse(x, sh, 12, 12 + bob * 0.3, 9, 5.5);
      ellipse(x, body, 11.5, 11 + bob * 0.3, 8.5, 5);
      if (variant === 'starryNavy') {
        for (let i = 0; i < 6; i++) rect(x, mark, 5 + Math.floor(noise(i, 1) * 13), 8 + Math.floor(noise(1, i) * 6), 1, 1);
        rect(x, mark, 10, 9, 1, 3);
        rect(x, mark, 9, 10, 3, 1);
      } else {
        ellipse(x, mark, 8, 10, 2.5, 2);
        ellipse(x, mark, 15, 12, 2, 1.6);
      }
      // 머리(오른쪽)
      ellipse(x, body, 20, 9 - bob * 0.3, 4, 4);
      ellipse(x, '#ffc8c8', 22, 11 - bob * 0.3, 2.5, 1.8);
      rect(x, '#2a1a2a', 20, 8, 1, 2);
      rect(x, '#ffffff', 20, 8, 1, 1);
      rect(x, '#f4e8c8', 17, 4, 2, 2);
      rect(x, '#f4e8c8', 22, 4, 2, 2);
      ellipse(x, sh, 16.5, 7, 1.5, 1);
      rect(x, sh, 2, 9, 2, 1);
      rect(x, sh, 1, 10, 1, 3);
      if (variant === 'goldenGlow') rect(x, '#ffffff', 9, 7, 3, 1);
    } else {
      rect(x, mark, 9, 16, 2, 3 - bob);
      rect(x, mark, 13, 16, 2, 3);
      ellipse(x, sh, 11, 13, 7, 4.5);
      ellipse(x, body, 10.5, 12, 6.5, 4.2);
      poly(x, sh, [4, 11, 1, 8, 5, 9]);
      ellipse(x, body, 16, 6 - bob * 0.5, 3.5, 3.5);
      rect(x, body, 15, 8, 3, 3);
      poly(x, mark, [19, 6, 23, 7, 19, 8]);
      rect(x, '#2a1a2a', 17, 5, 1, 1);
      ellipse(x, sh, 10, 12, 3, 1.5);
      if (variant === 'starryNavy') for (let i = 0; i < 4; i++) rect(x, '#ffe27a', 7 + Math.floor(noise(i, 2) * 8), 10 + Math.floor(noise(2, i) * 4), 1, 1);
      if (variant === 'pastelPink') rect(x, '#ff8ab8', 15, 3, 2, 1);
    }
  }, OUT);
}

export type MonsterKind = 'slime' | 'bat' | 'wisp' | 'golem' | 'matriarch' | 'wyrmHead' | 'wyrmBody';

/** 층 깊이에 따라 색이 바뀌는 몬스터 스프라이트 */
export function monsterSprite(kind: MonsterKind, tier: number, frame: number, flash: boolean): HTMLCanvasElement {
  const key = `mon:${kind}:${tier}:${frame}:${flash}`;
  const size = kind === 'matriarch' ? 40 : kind === 'golem' ? 28 : kind === 'wyrmHead' ? 34 : kind === 'wyrmBody' ? 22 : 20;
  return sprite(key, size, size, (x) => {
    x.translate(1, 1);
    const W = size - 2;
    const F = (c: string) => (flash ? '#ffffff' : c);
    switch (kind) {
      case 'slime': {
        const col = F(['#7fd0a0', '#7f9aff', '#d07fff'][tier]!);
        const sq = frame === 1 ? 1.5 : 0;
        ellipse(x, F(shade(col, -0.3)), 9, 13 + sq * 0.5, 7.5 + sq, 5 - sq * 0.5);
        ellipse(x, col, 9, 12 + sq * 0.5, 7 + sq, 4.8 - sq * 0.5);
        ellipse(x, F(shade(col, 0.4)), 6, 9 + sq, 2, 1.2);
        rect(x, F('#2a1a2a'), 6, 11, 1, 2);
        rect(x, F('#2a1a2a'), 11, 11, 1, 2);
        break;
      }
      case 'bat': {
        const col = F(['#a07ad0', '#8a8ae0', '#d05a9a'][tier]!);
        const up = frame === 1;
        poly(x, F(shade(col, -0.2)), up ? [9, 9, 0, 2, 3, 10] : [9, 9, 0, 13, 4, 8]);
        poly(x, F(shade(col, -0.2)), up ? [9, 9, 18, 2, 15, 10] : [9, 9, 18, 13, 14, 8]);
        ellipse(x, col, 9, 9, 4, 4);
        rect(x, F('#ff5a5a'), 7, 8, 1, 1);
        rect(x, F('#ff5a5a'), 10, 8, 1, 1);
        rect(x, F('#ffffff'), 8, 11, 1, 1);
        rect(x, F('#ffffff'), 10, 11, 1, 1);
        break;
      }
      case 'wisp': {
        const col = F(['#9fd8ff', '#c8a8ff', '#ffb0e0'][tier]!);
        const f = frame;
        poly(x, F(shade(col, -0.2)), [4, 10, 9, 18 - f, 14, 10]);
        ellipse(x, col, 9, 8, 5.5, 5.5);
        ellipse(x, F('#ffffff'), 9, 8, 3, 3);
        rect(x, F('#3a2a6a'), 7, 7, 1, 2);
        rect(x, F('#3a2a6a'), 11, 7, 1, 2);
        break;
      }
      case 'golem': {
        const col = F(['#9a8a9a', '#6a7a9a', '#7a5a8a'][tier]!);
        const gem = F(['#ff9a4a', '#cfe0ff', '#ffe27a'][tier]!);
        rect(x, F(shade(col, -0.3)), 5, 20, 6, 6);
        rect(x, F(shade(col, -0.3)), 15, 20, 6, 6);
        rect(x, col, 4, 6, 18, 16);
        rect(x, F(shade(col, 0.2)), 4, 6, 18, 3);
        rect(x, F(shade(col, -0.2)), 0, 9 + frame, 4, 10);
        rect(x, F(shade(col, -0.2)), 22, 9 - frame, 4, 10);
        rect(x, gem, 11, 12, 4, 4);
        rect(x, F('#ffffff'), 11, 12, 1, 1);
        rect(x, F('#ffe27a'), 8, 9, 2, 1);
        rect(x, F('#ffe27a'), 16, 9, 2, 1);
        break;
      }
      case 'matriarch': {
        const col = F('#8a6ab0');
        ellipse(x, F('#5a3a8a'), 19, 26, 18, 11);
        ellipse(x, col, 19, 23, 16, 11);
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (1.1 + i * 0.13);
          const cx = 19 + Math.cos(a) * 13;
          const cy = 20 + Math.sin(a) * 9;
          poly(x, F(i % 2 ? '#ff9ad8' : '#9fd8ff'), [cx - 3, cy + 2, cx, cy - 8 - (i % 3) * 2, cx + 3, cy + 2]);
        }
        ellipse(x, F('#ffe27a'), 13, 24, 2.5, 2 + frame * 0.5);
        ellipse(x, F('#ffe27a'), 25, 24, 2.5, 2 + frame * 0.5);
        rect(x, F('#2a1a2a'), 13, 24, 1, 2);
        rect(x, F('#2a1a2a'), 25, 24, 1, 2);
        rect(x, F('#3a1a3a'), 16, 30, 6, 2);
        break;
      }
      case 'wyrmHead': {
        const col = F('#3e2e66');
        ellipse(x, col, 16, 16, 14, 11);
        ellipse(x, F('#5e4c96'), 15, 14, 11, 8);
        poly(x, F('#ffb03a'), [4, 6, 0, 0, 9, 4]);
        poly(x, F('#ffb03a'), [28, 6, 32, 0, 23, 4]);
        rect(x, F('#ff5a3a'), 9, 13, 4, 3);
        rect(x, F('#ff5a3a'), 19, 13, 4, 3);
        rect(x, F('#ffe27a'), 10, 13, 1, 1);
        rect(x, F('#ffe27a'), 20, 13, 1, 1);
        if (frame) poly(x, F('#ff8a3a'), [10, 22, 16, 30, 22, 22]);
        else rect(x, F('#1a1028'), 10, 22, 12, 2);
        break;
      }
      case 'wyrmBody': {
        ellipse(x, F('#3e2e66'), 10, 10, 9, 9);
        ellipse(x, F('#5e4c96'), 9, 8, 6, 6);
        rect(x, F('#ffb03a'), 9, 1, 2, 3);
        break;
      }
    }
    void W;
  }, OUT);
}
