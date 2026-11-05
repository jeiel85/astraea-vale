import { itemDef, type Quality } from '../data/items';
import type { ItemStack } from './state';

type Inv = (ItemStack | null)[];

/** 아이템을 넣고, 자리가 없어 못 넣은 개수를 돌려준다. */
export function addItem(inv: Inv, id: string, n: number, q: Quality = 0): number {
  const max = itemDef(id).stack;
  let left = n;
  for (const s of inv) {
    if (left <= 0) break;
    if (s && s.id === id && s.q === q && s.n < max) {
      const put = Math.min(max - s.n, left);
      s.n += put;
      left -= put;
    }
  }
  for (let i = 0; i < inv.length && left > 0; i++) {
    if (!inv[i]) {
      const put = Math.min(max, left);
      inv[i] = { id, n: put, q };
      left -= put;
    }
  }
  return left;
}

export function canAdd(inv: Inv, id: string, n: number, q: Quality = 0): boolean {
  const max = itemDef(id).stack;
  let room = 0;
  for (const s of inv) {
    if (!s) room += max;
    else if (s.id === id && s.q === q) room += max - s.n;
    if (room >= n) return true;
  }
  return room >= n;
}

/** q를 생략하면 품질에 상관없이 센다. */
export function countItem(inv: Inv, id: string, q?: Quality): number {
  let c = 0;
  for (const s of inv) if (s && s.id === id && (q === undefined || s.q === q)) c += s.n;
  return c;
}

/** 낮은 품질부터 n개를 꺼낸다. 모자라면 아무것도 꺼내지 않고 false. */
export function removeItem(inv: Inv, id: string, n: number, q?: Quality): boolean {
  if (countItem(inv, id, q) < n) return false;
  let left = n;
  for (const quality of [0, 1, 2] as const) {
    if (q !== undefined && quality !== q) continue;
    for (let i = 0; i < inv.length && left > 0; i++) {
      const s = inv[i];
      if (s && s.id === id && s.q === quality) {
        const take = Math.min(s.n, left);
        s.n -= take;
        left -= take;
        if (s.n <= 0) inv[i] = null;
      }
    }
  }
  return true;
}

/** 특정 칸에서 n개를 꺼낸다. */
export function takeFromSlot(inv: Inv, index: number, n: number): ItemStack | null {
  const s = inv[index];
  if (!s) return null;
  const take = Math.min(n, s.n);
  s.n -= take;
  const out = { id: s.id, n: take, q: s.q };
  if (s.n <= 0) inv[index] = null;
  return out;
}

export function swapSlots(inv: Inv, a: number, b: number): void {
  const t = inv[a] ?? null;
  inv[a] = inv[b] ?? null;
  inv[b] = t;
}

export function hasTool(inv: Inv, id: string): boolean {
  return inv.some((s) => s?.id === id);
}
