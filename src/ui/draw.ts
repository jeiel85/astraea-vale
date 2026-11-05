import { itemIcon } from '../art/icons';
import type { ItemStack } from '../sim/state';

export const FONT = 'Galmuri11';
export const FONT_S = 'Galmuri9';
export type Ctx = CanvasRenderingContext2D;

export const UI = {
  panel: '#2a2148',
  panel2: '#3a2f5e',
  border: '#c8a8ff',
  borderDim: '#6a5a9a',
  text: '#fff8ec',
  dim: '#b8acd8',
  gold: '#ffe27a',
  pink: '#ff8ab8',
  mint: '#7ff0c0',
  red: '#ff6a7a',
  sky: '#9fd8ff',
  shadow: '#140e24',
};

export function font(size: 12 | 10 | 14 | 16 | 20 | 24 | 32 = 12): string {
  if (size === 10) return `10px ${FONT_S}`;
  return `${size}px ${FONT}`;
}

export interface TextOpts {
  size?: 12 | 10 | 14 | 16 | 20 | 24 | 32;
  color?: string;
  align?: CanvasTextAlign;
  shadow?: string | false;
  alpha?: number;
}

export function text(c: Ctx, s: string, x: number, y: number, o: TextOpts = {}): number {
  c.font = font(o.size ?? 12);
  c.textAlign = o.align ?? 'left';
  c.textBaseline = 'top';
  if (o.alpha !== undefined) c.globalAlpha = o.alpha;
  if (o.shadow !== false) {
    c.fillStyle = o.shadow ?? UI.shadow;
    c.fillText(s, Math.round(x) + 1, Math.round(y) + 1);
  }
  c.fillStyle = o.color ?? UI.text;
  c.fillText(s, Math.round(x), Math.round(y));
  const w = c.measureText(s).width;
  c.globalAlpha = 1;
  return w;
}

export function measure(c: Ctx, s: string, size: TextOpts['size'] = 12): number {
  c.font = font(size);
  return c.measureText(s).width;
}

/** 한글을 고려한 줄바꿈: 공백에서 먼저 끊고, 긴 단어는 글자 단위로 자른다. */
export function wrap(c: Ctx, s: string, maxW: number, size: TextOpts['size'] = 12): string[] {
  c.font = font(size);
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    const words = para.split(' ');
    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi]!;
      const trial = line ? `${line} ${word}` : word;
      if (c.measureText(trial).width <= maxW) {
        line = trial;
        continue;
      }
      if (line) out.push(line);
      line = '';
      let chunk = '';
      for (const ch of word) {
        if (c.measureText(chunk + ch).width > maxW) {
          out.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}

export function panel(c: Ctx, x: number, y: number, w: number, h: number, opts: { fill?: string; border?: string; alpha?: number } = {}): void {
  x = Math.round(x);
  y = Math.round(y);
  c.globalAlpha = opts.alpha ?? 1;
  c.fillStyle = opts.fill ?? UI.panel;
  c.fillRect(x + 1, y + 1, w - 2, h - 2);
  c.globalAlpha = 1;
  c.fillStyle = opts.border ?? UI.border;
  c.fillRect(x + 2, y, w - 4, 1);
  c.fillRect(x + 2, y + h - 1, w - 4, 1);
  c.fillRect(x, y + 2, 1, h - 4);
  c.fillRect(x + w - 1, y + 2, 1, h - 4);
  c.fillRect(x + 1, y + 1, 1, 1);
  c.fillRect(x + w - 2, y + 1, 1, 1);
  c.fillRect(x + 1, y + h - 2, 1, 1);
  c.fillRect(x + w - 2, y + h - 2, 1, 1);
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.fillRect(x + 2, y + 2, w - 4, 1);
}

export function bar(c: Ctx, x: number, y: number, w: number, h: number, v: number, color: string, back = '#1a1430'): void {
  c.fillStyle = back;
  c.fillRect(x, y, w, h);
  c.fillStyle = color;
  c.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, v))), h);
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, v))), 1);
}

export function itemSlot(c: Ctx, x: number, y: number, st: ItemStack | null, selected: boolean, opts: { size?: number; dim?: boolean } = {}): void {
  const s = opts.size ?? 18;
  c.fillStyle = selected ? '#5a4a8a' : '#1e1834';
  c.fillRect(x, y, s, s);
  c.fillStyle = selected ? UI.gold : UI.borderDim;
  c.fillRect(x, y, s, 1);
  c.fillRect(x, y + s - 1, s, 1);
  c.fillRect(x, y, 1, s);
  c.fillRect(x + s - 1, y, 1, s);
  if (!st) return;
  if (opts.dim) c.globalAlpha = 0.35;
  c.drawImage(itemIcon(st.id), x + Math.floor((s - 18) / 2), y + Math.floor((s - 18) / 2));
  c.globalAlpha = 1;
  if (st.q === 1) text(c, '★', x + 1, y, { size: 10, color: UI.gold });
  if (st.q === 2) text(c, '☀', x + 1, y, { size: 10, color: '#ffb03a' });
  if (st.n > 1) text(c, String(st.n), x + s - 1, y + s - 10, { size: 10, align: 'right' });
}

/** 하트 n개(0~10) */
export function heartsRow(c: Ctx, x: number, y: number, n: number, max = 10): void {
  for (let i = 0; i < max; i++) {
    c.fillStyle = i < n ? UI.pink : '#4a3a6a';
    const hx = x + i * 7;
    c.fillRect(hx, y + 1, 2, 2);
    c.fillRect(hx + 3, y + 1, 2, 2);
    c.fillRect(hx, y + 2, 5, 2);
    c.fillRect(hx + 1, y + 4, 3, 1);
    c.fillRect(hx + 2, y + 5, 1, 1);
  }
}

export function keyHint(c: Ctx, x: number, y: number, s: string, align: CanvasTextAlign = 'left'): void {
  text(c, s, x, y, { size: 10, color: UI.dim, align });
}
