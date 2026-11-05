import { itemDef, sellValue, type Quality } from '../data/items';
import { DAY_START, weatherOf } from './calendar';
import { growNight, rainOnFarm } from './farm';
import { completeGoal } from './goals';
import { animalNight } from './livestock';
import type { GameState } from './state';

export interface ShippedLine {
  id: string;
  q: Quality;
  n: number;
  value: number;
}

export interface DaySummary {
  endedDay: number;
  shipped: ShippedLine[];
  income: number;
  penalty: number;
  grown: number;
  withered: number;
  bloomed: number;
  rainToday: boolean;
}

/** 쓰러지면(새벽 2시 또는 광산에서 전멸) 골드 10%(최대 300)를 잃는다. */
export function faintPenalty(gold: number): number {
  return Math.min(300, Math.floor(gold * 0.1));
}

/**
 * 하루를 마감한다: 출하함 정산 → 밭 성장 → 가축 → 날짜 넘김 → 비 오는 날이면 자동 관개.
 * 저장은 호출하는 쪽이 이 함수 직후에 한다.
 */
export function advanceDay(s: GameState, fainted: boolean): DaySummary {
  const endedDay = s.day;
  const merged = new Map<string, ShippedLine>();
  for (const st of s.shippingBin) {
    const key = `${st.id}|${st.q}`;
    const line = merged.get(key) ?? { id: st.id, q: st.q, n: 0, value: 0 };
    line.n += st.n;
    line.value += sellValue(st.id, st.q) * st.n;
    merged.set(key, line);
  }
  const shipped = [...merged.values()].sort((a, b) => b.value - a.value);
  const income = shipped.reduce((acc, l) => acc + l.value, 0);
  s.shippingBin = [];
  if (income > 0) {
    s.gold += income;
    s.stats.earned += income;
    s.stats.shipped += shipped.reduce((acc, l) => acc + l.n, 0);
    if (shipped.some((l) => itemDef(l.id).kind === 'crop')) completeGoal(s, 'ship');
  }
  const penalty = fainted ? faintPenalty(s.gold) : 0;
  s.gold -= penalty;

  s.day = endedDay + 1;
  s.minutes = DAY_START;
  const g = growNight(s, endedDay, s.day);
  for (const a of s.animals) animalNight(a);
  if (s.essenceBlessDays > 0) s.essenceBlessDays--;
  const rain = weatherOf(s.seed, s.day) === 'rain';
  if (rain) rainOnFarm(s);

  return {
    endedDay,
    shipped,
    income,
    penalty,
    grown: g.grown,
    withered: g.withered,
    bloomed: g.bloomed,
    rainToday: rain,
  };
}
