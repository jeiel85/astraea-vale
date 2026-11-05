import { cropDef } from '../data/crops';
import { itemDef } from '../data/items';
import { cropSprite } from './world';
import { ellipse, poly, rect, shade, sprite } from './pixel';

const OUT = '#2a1f3a';

/** 아이템 아이콘 18x18(테두리 포함) */
export function itemIcon(id: string): HTMLCanvasElement {
  return sprite(`icon:${id}`, 18, 18, (x) => {
    x.translate(1, 1);
    const d = itemDef(id);
    const a = d.c1;
    const b = d.c2;
    switch (d.icon) {
      case 'hoe':
        poly(x, b, [2, 14, 12, 4, 13, 5, 3, 15]);
        poly(x, a, [9, 2, 14, 2, 14, 7, 12, 7, 12, 4, 9, 4]);
        break;
      case 'can':
        ellipse(x, a, 7, 10, 5, 4.5);
        rect(x, a, 2, 6, 10, 4);
        poly(x, a, [11, 8, 15, 4, 15, 6, 12, 10]);
        rect(x, b, 3, 5, 8, 2);
        rect(x, '#ffffff', 4, 8, 2, 2);
        break;
      case 'staff':
        poly(x, '#8a5a3a', [3, 15, 10, 5, 11, 6, 4, 16]);
        poly(x, a, [11, 0, 12.5, 3.5, 16, 4, 13, 6.5, 14, 10, 11, 8, 8, 10, 9, 6.5, 6, 4, 9.5, 3.5]);
        rect(x, '#ffffff', 11, 4, 1, 1);
        rect(x, b, 9, 8, 2, 2);
        break;
      case 'sword':
        poly(x, a, [13, 1, 15, 1, 15, 3, 6, 12, 4, 10]);
        rect(x, '#ffffff', 12, 2, 1, 1);
        poly(x, '#c8a86a', [2, 9, 4, 7, 9, 12, 7, 14]);
        poly(x, b, [1, 14, 4, 11, 5, 12, 2, 15]);
        break;
      case 'seed': {
        rect(x, '#e8d8b0', 2, 2, 12, 13);
        rect(x, '#c8b890', 2, 13, 12, 2);
        rect(x, '#c8b890', 2, 2, 12, 1);
        const c = d.cropId ? cropDef(d.cropId) : null;
        ellipse(x, b, 8, 8, 3.5, 2.5);
        ellipse(x, a, 8, 9, 2.5, 2.2);
        if (c?.requiredConstellation || c?.special) rect(x, '#ffe27a', 11, 3, 2, 2);
        break;
      }
      case 'crop': {
        const spr = cropSprite(d.cropId!, 4, true, false);
        x.drawImage(spr, 1, 0, 16, 26, 0, -9, 16, 26);
        break;
      }
      case 'bottle':
        rect(x, '#e0e8f0', 6, 1, 4, 3);
        rect(x, '#c8a86a', 6, 1, 4, 1);
        ellipse(x, '#e0e8f0', 8, 10, 5, 5.5);
        ellipse(x, a, 8, 11, 4, 4);
        rect(x, b, 6, 9, 2, 2);
        rect(x, '#ffffff', 5, 6, 1, 3);
        break;
      case 'egg':
        ellipse(x, a, 8, 9, 5, 6);
        ellipse(x, shade(a, -0.15), 9, 11, 4, 4);
        rect(x, '#ffffff', 5, 6, 2, 2);
        if (b !== shade(a, 0)) {
          rect(x, b, 9, 7, 1, 1);
          rect(x, b, 6, 11, 1, 1);
          rect(x, b, 10, 12, 1, 1);
        }
        break;
      case 'ore':
        ellipse(x, b, 8, 9, 6.5, 5.5);
        ellipse(x, shade(b, 0.2), 7, 8, 5, 4);
        rect(x, a, 5, 6, 3, 3);
        rect(x, a, 9, 9, 3, 2);
        rect(x, '#ffffff', 5, 6, 1, 1);
        break;
      case 'crystal':
        poly(x, a, [8, 1, 13, 7, 8, 15, 3, 7]);
        poly(x, b, [8, 1, 13, 7, 8, 8]);
        rect(x, '#ffffff', 6, 5, 1, 3);
        break;
      case 'relic':
        rect(x, a, 3, 3, 10, 10);
        rect(x, shade(a, -0.3), 3, 12, 10, 1);
        ellipse(x, b, 8, 8, 2.5, 2.5);
        rect(x, shade(a, 0.3), 4, 4, 3, 1);
        break;
      case 'heart':
        ellipse(x, b, 8, 8, 7, 7);
        ellipse(x, a, 8, 8, 5, 5);
        rect(x, b, 7, 2, 2, 2);
        break;
      case 'orb':
        ellipse(x, shade(a, -0.3), 8, 9, 6, 6);
        ellipse(x, a, 8, 8, 5, 5);
        ellipse(x, b, 6, 6, 2, 2);
        break;
      case 'sack':
        ellipse(x, b, 8, 10, 6, 5);
        rect(x, b, 5, 3, 6, 5);
        rect(x, a, 4, 3, 8, 2);
        ellipse(x, a, 8, 11, 3, 2);
        break;
      case 'flask':
        rect(x, '#c8a86a', 6, 0, 4, 2);
        rect(x, '#e0e8f0', 6, 2, 4, 4);
        ellipse(x, '#e0e8f0', 8, 11, 6, 5);
        ellipse(x, a, 8, 12, 5, 3.5);
        rect(x, b, 6, 11, 2, 2);
        rect(x, '#ffffff', 4, 8, 1, 3);
        break;
    }
  }, OUT);
}
