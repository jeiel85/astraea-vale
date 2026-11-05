/** 룩북 도트 무늬: 16색 팔레트, 16x16 칸. 공유 코드는 색 인덱스를 base64로 담는다. */
export const PATTERN_SIZE = 16;
export const PATTERN_PALETTE = [
  '#ffffff', '#2a1f3a', '#ff8aa8', '#ff4f6d', '#ffb03a', '#ffe27a', '#9be08a', '#3f8f4e',
  '#9fd8ff', '#5a7bff', '#3a3a8a', '#c8a8ff', '#8a4fc7', '#d9b27a', '#7a5a3a', '#c8bfb0',
] as const;

const PREFIX = 'AV1';

export interface LookbookCode {
  pattern: number[];
  hairStyle: number;
  hair: string;
  eyes: string;
  outfit: string;
  accent: string;
}

function hexByte(h: string): number[] {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 무늬 + 의상 색을 짧은 공유 코드로 만든다. */
export function encodeLookbook(c: LookbookCode): string {
  const bytes: number[] = [c.hairStyle & 255, ...hexByte(c.hair), ...hexByte(c.eyes), ...hexByte(c.outfit), ...hexByte(c.accent)];
  // 픽셀: 0~15 색, 16(투명)을 담으려고 5비트가 아니라 '투명 마스크 + 4비트 색' 두 묶음으로 저장
  const mask: number[] = new Array(32).fill(0);
  for (let i = 0; i < 256; i++) if (c.pattern[i]! >= 0) mask[i >> 3]! |= 1 << (i & 7);
  bytes.push(...mask);
  for (let i = 0; i < 256; i += 2) bytes.push(((Math.max(0, c.pattern[i]!) & 15) << 4) | (Math.max(0, c.pattern[i + 1]!) & 15));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLookbook(code: string): LookbookCode | null {
  const t = code.trim();
  if (!t.startsWith(PREFIX)) return null;
  let bin: string;
  try {
    const b64 = t.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  } catch {
    return null;
  }
  const bytes = [...bin].map((ch) => ch.charCodeAt(0));
  if (bytes.length !== 13 + 32 + 128) return null;
  const hex = (o: number) => '#' + bytes.slice(o, o + 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  const pattern: number[] = new Array(256);
  for (let i = 0; i < 256; i++) {
    const on = (bytes[13 + (i >> 3)]! >> (i & 7)) & 1;
    const pair = bytes[45 + (i >> 1)]!;
    const v = i % 2 === 0 ? pair >> 4 : pair & 15;
    pattern[i] = on ? v : -1;
  }
  const hairStyle = bytes[0]!;
  if (hairStyle > 4) return null;
  return { hairStyle, hair: hex(1), eyes: hex(4), outfit: hex(7), accent: hex(10), pattern };
}

export function emptyPattern(): number[] {
  return new Array(PATTERN_SIZE * PATTERN_SIZE).fill(-1);
}

/** 기본 무늬: 작은 별 */
export function starPattern(): number[] {
  const p = emptyPattern();
  const pts = [
    [7, 3], [8, 3], [7, 4], [8, 4], [6, 5], [7, 5], [8, 5], [9, 5],
    [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6],
    [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [6, 8], [7, 8], [8, 8], [9, 8],
    [5, 9], [6, 9], [9, 9], [10, 9], [4, 10], [5, 10], [10, 10], [11, 10],
  ];
  for (const [x, y] of pts) p[y! * 16 + x!] = 5;
  return p;
}
