import type { NpcDef, NpcId, HeartEvent } from '../data/npcs';
import { npcDef } from '../data/npcs';
import type { Rng } from '../engine/rng';
import { isFestivalDay, isFullMoon, isLunarEclipse, isSolarEclipse, weatherOf } from './calendar';
import type { GameState } from './state';

export const POINTS_PER_HEART = 100;
export const MAX_HEARTS = 10;

export function hearts(points: number): number {
  return Math.min(MAX_HEARTS, Math.floor(points / POINTS_PER_HEART));
}

function addAffection(s: GameState, id: NpcId, delta: number): void {
  const n = s.npcs[id];
  n.affection = Math.max(0, Math.min(MAX_HEARTS * POINTS_PER_HEART, n.affection + delta));
}

export function fillName(line: string, name: string): string {
  return line.replaceAll('{name}', name);
}

/** 시간·날씨·달·친밀도에 따라 오늘 할 말을 고른다. */
export function pickLine(s: GameState, npc: NpcDef, rng: Rng): string {
  const L = npc.lines;
  const h = hearts(s.npcs[npc.id].affection);
  const pools: (readonly string[])[] = [];
  if (isFestivalDay(s.day) && s.minutes >= 16 * 60) pools.push(L.festival, L.festival);
  if (s.mine.wyrm) pools.push(L.boss);
  if (isSolarEclipse(s.day) || isLunarEclipse(s.day)) pools.push(L.eclipse, L.eclipse);
  else if (isFullMoon(s.day) && s.minutes >= 17 * 60) pools.push(L.fullMoon);
  if (weatherOf(s.seed, s.day) === 'rain') pools.push(L.rain);
  if (h >= 6) pools.push(L.close, L.close);
  const m = s.minutes;
  pools.push(m < 12 * 60 ? L.morning : m < 17 * 60 ? L.afternoon : m < 21 * 60 ? L.evening : L.night);
  const pool = rng.pick(pools);
  return fillName(rng.pick(pool), s.playerName);
}

export interface TalkResult {
  line: string;
  event: HeartEvent | null;
  firstToday: boolean;
}

/** 대화: 하루 첫 대화에 친밀도 +20. 하트 이벤트 조건이 되면 이벤트를 돌려주고 본 것으로 기록한다. */
export function talk(s: GameState, id: NpcId, rng: Rng): TalkResult {
  const npc = npcDef(id);
  const st = s.npcs[id];
  const firstToday = st.talkedDay !== s.day;
  if (firstToday) {
    st.talkedDay = s.day;
    addAffection(s, id, 20);
  }
  const h = hearts(st.affection);
  const idx = npc.events.findIndex((e, i) => e.hearts <= h && !st.eventsSeen.includes(i));
  if (idx >= 0) {
    st.eventsSeen.push(idx);
    return { line: '', event: npc.events[idx]!, firstToday };
  }
  return { line: pickLine(s, npc, rng), event: null, firstToday };
}

export type GiftReaction = 'love' | 'like' | 'neutral' | 'dislike';

export function giftReaction(npc: NpcDef, itemId: string): GiftReaction {
  if (npc.loves.includes(itemId)) return 'love';
  if (npc.likes.includes(itemId)) return 'like';
  if (npc.dislikes.includes(itemId)) return 'dislike';
  return 'neutral';
}

export const GIFT_POINTS: Record<GiftReaction, number> = { love: 80, like: 45, neutral: 20, dislike: -20 };

export function canGift(s: GameState, id: NpcId): boolean {
  return s.npcs[id].giftedDay !== s.day;
}

/** 선물은 하루 한 번. 아이템 차감은 호출하는 쪽에서 한다. */
export function giveGift(s: GameState, id: NpcId, itemId: string, qualityBonus: number): { reaction: GiftReaction; text: string } {
  const npc = npcDef(id);
  const reaction = giftReaction(npc, itemId);
  s.npcs[id].giftedDay = s.day;
  const pts = GIFT_POINTS[reaction];
  addAffection(s, id, pts > 0 ? Math.round(pts * (1 + qualityBonus)) : pts);
  return { reaction, text: fillName(npc.gift[reaction], s.playerName) };
}

export function danceAtFestival(s: GameState, id: NpcId): boolean {
  if (s.festivalDanced.includes(s.day)) return false;
  s.festivalDanced.push(s.day);
  addAffection(s, id, 150);
  return true;
}
