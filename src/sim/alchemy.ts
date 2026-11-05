import type { Recipe } from '../data/recipes';
import { addItem, canAdd, countItem, removeItem } from './inventory';
import type { GameState } from './state';

export function canCraft(s: GameState, r: Recipe): boolean {
  return r.inputs.every((i) => countItem(s.inventory, i.id) >= i.n);
}

export type CraftResult = { ok: true } | { ok: false; msg: string };

export function craft(s: GameState, r: Recipe): CraftResult {
  if (!canCraft(s, r)) return { ok: false, msg: '재료가 부족하다.' };
  if (!canAdd(s.inventory, r.output, r.outputCount)) {
    // 재료를 꺼내면 자리가 생길 수 있으므로, 꺼낸 뒤 다시 확인하고 실패하면 되돌린다.
    const backup = s.inventory.map((x) => (x ? { ...x } : null));
    for (const i of r.inputs) removeItem(s.inventory, i.id, i.n);
    if (!canAdd(s.inventory, r.output, r.outputCount)) {
      s.inventory.splice(0, s.inventory.length, ...backup);
      return { ok: false, msg: '가방에 자리가 없다.' };
    }
    addItem(s.inventory, r.output, r.outputCount);
    s.stats.crafted++;
    return { ok: true };
  }
  for (const i of r.inputs) removeItem(s.inventory, i.id, i.n);
  addItem(s.inventory, r.output, r.outputCount);
  s.stats.crafted++;
  return { ok: true };
}
