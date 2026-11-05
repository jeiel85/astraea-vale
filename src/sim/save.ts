import { ITEMS } from '../data/items';
import { NPCS } from '../data/npcs';
import { INVENTORY_SIZE, SAVE_VERSION, type GameState } from './state';

export const SAVE_KEY = 'astraea-vale/save/v1';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; reason: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 저장 문자열을 검증해 게임 상태로 되살린다. 형식이 맞지 않으면 이유와 함께 실패한다. */
export function deserialize(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: '저장 데이터가 손상되었습니다(JSON 해석 실패).' };
  }
  if (!isObj(raw)) return { ok: false, reason: '저장 데이터 형식이 올바르지 않습니다.' };
  if (raw.version !== SAVE_VERSION) {
    return { ok: false, reason: `지원하지 않는 저장 버전입니다(${String(raw.version)}).` };
  }
  const numFields = ['seed', 'rngState', 'day', 'minutes', 'gold', 'nextAnimalId', 'swordLevel', 'staffLevel', 'essenceBlessDays'];
  for (const f of numFields) {
    if (typeof raw[f] !== 'number' || !Number.isFinite(raw[f])) return { ok: false, reason: `저장 데이터의 ${f} 값이 올바르지 않습니다.` };
  }
  if (!Array.isArray(raw.inventory) || raw.inventory.length !== INVENTORY_SIZE) {
    return { ok: false, reason: '가방 데이터가 올바르지 않습니다.' };
  }
  for (const it of raw.inventory) {
    if (it === null) continue;
    if (!isObj(it) || typeof it.id !== 'string' || !ITEMS.has(it.id) || typeof it.n !== 'number' || it.n <= 0) {
      return { ok: false, reason: '가방에 알 수 없는 아이템이 있습니다.' };
    }
  }
  if (!isObj(raw.plots) || !Array.isArray(raw.animals) || !isObj(raw.npcs) || !isObj(raw.mine) || !isObj(raw.appearance)) {
    return { ok: false, reason: '저장 데이터의 일부가 빠져 있습니다.' };
  }
  for (const n of NPCS) {
    if (!isObj((raw.npcs as Record<string, unknown>)[n.id])) return { ok: false, reason: `주민(${n.name}) 데이터가 없습니다.` };
  }
  if (!Array.isArray(raw.shippingBin)) return { ok: false, reason: '출하함 데이터가 올바르지 않습니다.' };
  return { ok: true, state: raw as unknown as GameState };
}

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function saveTo(store: Storage, s: GameState): { ok: true } | { ok: false; reason: string } {
  try {
    store.setItem(SAVE_KEY, serialize(s));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `저장하지 못했습니다: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function loadFrom(store: Storage): LoadResult | null {
  let text: string | null;
  try {
    text = store.getItem(SAVE_KEY);
  } catch (e) {
    return { ok: false, reason: `저장소를 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (text === null) return null;
  return deserialize(text);
}
