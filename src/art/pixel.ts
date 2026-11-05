/** 도트 그래픽 도구: 작은 캔버스에 그리고, 반투명 가장자리를 잘라 선명한 픽셀로 만든다. */

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; x: Ctx } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) throw new Error('Canvas 2D를 사용할 수 없습니다.');
  x.imageSmoothingEnabled = false;
  return { c, x };
}

const cache = new Map<string, HTMLCanvasElement>();

/**
 * 스프라이트를 만들어 캐시한다.
 * outline: 불투명 영역 바깥에 1px 테두리를 두른다(캔버스에 여백 1px이 있어야 함).
 */
export function sprite(key: string, w: number, h: number, draw: (x: Ctx) => void, outline?: string): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, x } = makeCanvas(w, h);
  draw(x);
  crisp(x, w, h, outline);
  cache.set(key, c);
  return c;
}

export function clearSpriteCache(prefix: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}

/** 알파를 0/255로 자르고, 필요하면 바깥 테두리를 그린다. */
export function crisp(x: Ctx, w: number, h: number, outline?: string): void {
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i]! >= 110 ? 255 : 0;
  if (outline) {
    const [r, g, b] = hexToRgb(outline);
    const solid = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3]! > 0 ? 1 : 0;
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const i = yy * w + xx;
        if (solid[i]) continue;
        const n =
          (xx > 0 && solid[i - 1]) ||
          (xx < w - 1 && solid[i + 1]) ||
          (yy > 0 && solid[i - w]) ||
          (yy < h - 1 && solid[i + w]);
        if (n) {
          d[i * 4] = r;
          d[i * 4 + 1] = g;
          d[i * 4 + 2] = b;
          d[i * 4 + 3] = 255;
        }
      }
  }
  x.putImageData(img, 0, 0);
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** amt<0 어둡게, amt>0 밝게 (-1..1) */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amt < 0) return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function rect(x: Ctx, color: string, px: number, py: number, w = 1, h = 1): void {
  x.fillStyle = color;
  x.fillRect(px, py, w, h);
}

export function ellipse(x: Ctx, color: string, cx: number, cy: number, rx: number, ry: number): void {
  x.fillStyle = color;
  x.beginPath();
  x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  x.fill();
}

export function poly(x: Ctx, color: string, pts: readonly number[]): void {
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i]!, pts[i + 1]!);
  x.closePath();
  x.fill();
}

/** 문자열 그림: 각 글자를 팔레트 색으로 찍는다('.'은 투명). */
export function pix(x: Ctx, rows: readonly string[], pal: Record<string, string>, ox = 0, oy = 0): void {
  for (let yy = 0; yy < rows.length; yy++) {
    const row = rows[yy]!;
    for (let xx = 0; xx < row.length; xx++) {
      const ch = row[xx]!;
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) continue;
      x.fillStyle = col;
      x.fillRect(ox + xx, oy + yy, 1, 1);
    }
  }
}

/** 결정론적 난수(그림 무늬용) */
export function noise(a: number, b: number, c = 0): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
