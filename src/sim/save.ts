import { SPECIES, VARIANT_ORDER } from '../data/animals';
import { CROPS } from '../data/crops';
import { GOALS } from '../data/goals';
import { ITEMS, itemDef } from '../data/items';
import { NPCS } from '../data/npcs';
import { DAY_END, DAY_START } from './calendar';
import { INVENTORY_SIZE, SAVE_VERSION, type GameState } from './state';

export const SAVE_KEY = 'astraea-vale/save/v1';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; reason: string };

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min = -Infinity, max = Infinity): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isColor = (v: unknown): boolean => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

const CROP_IDS = new Set(CROPS.map((c) => c.id));
const RUNES = new Set(['orion', 'cassiopeia', 'phoenix', 'eclipse']);
const GOAL_IDS = new Set(GOALS.map((g) => g.id));

/** 저장 데이터 검사에서 처음 발견한 문제를 사람이 읽을 수 있는 문장으로 돌려준다(문제가 없으면 null). */
function check(raw: Obj): string | null {
  // 기본 수치
  if (!isInt(raw.seed, 0, 0xffffffff) || !isInt(raw.rngState, 0, 0xffffffff)) return '난수 시드 값이 올바르지 않습니다.';
  if (!isInt(raw.day, 0)) return '날짜 값이 올바르지 않습니다.';
  if (!isNum(raw.minutes) || raw.minutes < DAY_START || raw.minutes > DAY_END) return '시각 값이 올바르지 않습니다.';
  if (!isInt(raw.gold, 0)) return '골드 값이 올바르지 않습니다.';
  if (!isInt(raw.swordLevel, 0, 3) || !isInt(raw.staffLevel, 0, 1)) return '도구 강화 단계가 올바르지 않습니다.';
  if (!isInt(raw.essenceBlessDays, 0, 30)) return '정수 축복 값이 올바르지 않습니다.';
  if (typeof raw.playerName !== 'string' || raw.playerName.length === 0 || raw.playerName.length > 20) return '플레이어 이름이 올바르지 않습니다.';
  for (const f of ['bannerPlaced', 'introSeen', 'endingSeen'] as const) if (!isBool(raw[f])) return `저장 데이터의 ${f} 값이 올바르지 않습니다.`;

  // 가방
  if (!Array.isArray(raw.inventory) || raw.inventory.length !== INVENTORY_SIZE) return '가방 데이터가 올바르지 않습니다.';
  for (const it of raw.inventory) {
    if (it === null) continue;
    if (!isObj(it) || typeof it.id !== 'string' || !ITEMS.has(it.id)) return '가방에 알 수 없는 아이템이 있습니다.';
    if (!isInt(it.n, 1, itemDef(it.id).stack) || !isInt(it.q, 0, 2)) return `가방의 ${itemDef(it.id).name} 개수나 품질이 올바르지 않습니다.`;
  }
  // 출하함
  if (!Array.isArray(raw.shippingBin)) return '출하함 데이터가 올바르지 않습니다.';
  for (const it of raw.shippingBin) {
    if (!isObj(it) || typeof it.id !== 'string' || !ITEMS.has(it.id) || !isInt(it.n, 1) || !isInt(it.q, 0, 2)) return '출하함에 올바르지 않은 항목이 있습니다.';
  }

  // 밭
  if (!isObj(raw.plots)) return '밭 데이터가 없습니다.';
  for (const [k, p] of Object.entries(raw.plots)) {
    if (!/^\d{1,3},\d{1,3}$/.test(k)) return `밭 좌표(${k.slice(0, 12)})가 올바르지 않습니다.`;
    if (!isObj(p) || !isBool(p.watered)) return `밭(${k}) 데이터가 올바르지 않습니다.`;
    if (p.rune !== null && !(typeof p.rune === 'string' && RUNES.has(p.rune))) return `밭(${k})의 룬이 올바르지 않습니다.`;
    const c = p.crop;
    if (c === null) continue;
    if (!isObj(c) || typeof c.id !== 'string' || !CROP_IDS.has(c.id)) return `밭(${k})에 알 수 없는 작물이 있습니다.`;
    if (!isNum(c.growth) || c.growth < 0 || !isBool(c.bloomed) || !isBool(c.dead) || !isInt(c.harvests, 0)) return `밭(${k})의 작물 상태가 올바르지 않습니다.`;
  }

  // 가축
  if (!Array.isArray(raw.animals)) return '가축 데이터가 없습니다.';
  const ids = new Set<number>();
  for (const a of raw.animals) {
    if (!isObj(a) || !isInt(a.id, 1)) return '가축 데이터가 올바르지 않습니다.';
    if (ids.has(a.id)) return '가축 번호가 겹칩니다.';
    ids.add(a.id);
    if (typeof a.species !== 'string' || !(a.species in SPECIES)) return '알 수 없는 가축 종이 있습니다.';
    if (typeof a.variant !== 'string' || !(VARIANT_ORDER as readonly string[]).includes(a.variant)) return '알 수 없는 가축 변종이 있습니다.';
    if (typeof a.name !== 'string' || a.name.length === 0) return '가축 이름이 올바르지 않습니다.';
    if (!isNum(a.affection) || a.affection < 0 || a.affection > 100 || !isInt(a.ageDays, 0) || !isInt(a.cooldown, 0)) return `가축(${a.name})의 수치가 올바르지 않습니다.`;
    if (!isBool(a.pettedToday) || !isBool(a.productReady)) return `가축(${a.name})의 상태가 올바르지 않습니다.`;
  }
  if (!isInt(raw.nextAnimalId, 1) || [...ids].some((id) => id >= (raw.nextAnimalId as number))) return '다음 가축 번호가 올바르지 않습니다.';

  // 주민
  if (!isObj(raw.npcs)) return '주민 데이터가 없습니다.';
  for (const n of NPCS) {
    const st = raw.npcs[n.id];
    if (!isObj(st)) return `주민(${n.name}) 데이터가 없습니다.`;
    if (!isNum(st.affection) || st.affection < 0 || st.affection > 1000 || !isInt(st.talkedDay, -1) || !isInt(st.giftedDay, -1)) return `주민(${n.name})의 친밀도 정보가 올바르지 않습니다.`;
    if (!Array.isArray(st.eventsSeen) || !st.eventsSeen.every((e) => isInt(e, 0, n.events.length - 1))) return `주민(${n.name})의 이벤트 기록이 올바르지 않습니다.`;
  }

  // 광산·목표·기록
  const mine = raw.mine;
  if (!isObj(mine) || !isInt(mine.deepest, 0, 10) || !isInt(mine.checkpoint, 1, 10) || !isBool(mine.matriarch) || !isBool(mine.wyrm)) return '광산 기록이 올바르지 않습니다.';
  if (!isObj(raw.goals) || Object.entries(raw.goals).some(([k, v]) => !GOAL_IDS.has(k as never) || !isBool(v))) return '목표 기록이 올바르지 않습니다.';
  for (const f of ['festivalEntered', 'festivalDanced'] as const) {
    const arr = raw[f];
    if (!Array.isArray(arr) || !arr.every((d) => isInt(d, 0))) return '축제 기록이 올바르지 않습니다.';
  }
  if (!isObj(raw.stats) || Object.values(raw.stats).some((v) => !isInt(v, 0))) return '플레이 기록이 올바르지 않습니다.';

  // 외형(룩북)
  const ap = raw.appearance;
  if (!isObj(ap) || !isInt(ap.hairStyle, 0, 4) || !['hair', 'eyes', 'skin', 'outfit', 'accent'].every((k) => isColor(ap[k])) || !isBool(ap.patternOnShirt)) return '외형 데이터가 올바르지 않습니다.';
  if (ap.pattern !== null && !(Array.isArray(ap.pattern) && ap.pattern.length === 256 && ap.pattern.every((v) => isInt(v, -1, 15)))) return '룩북 무늬 데이터가 올바르지 않습니다.';
  return null;
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
  const why = check(raw);
  if (why) return { ok: false, reason: why };
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
