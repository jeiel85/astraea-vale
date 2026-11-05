import { hash01 } from '../engine/rng';

export type Constellation = 'orion' | 'cassiopeia' | 'phoenix' | 'eclipse';
export type Season = 0 | 1 | 2 | 3;
export type Weather = 'clear' | 'rain';

export const DAYS_PER_SEASON = 28;
export const SEASON_NAMES = ['봄', '여름', '가을', '겨울'] as const;
export const MOON_CYCLE = 8;
export const MOON_NAMES = ['삭', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'] as const;
export const MOON_SHORT = ['삭', '초승', '상현', '차오름', '보름', '기욺', '하현', '그믐'] as const;
export const CONSTELLATION_NAMES: Record<Constellation, string> = {
  orion: '오리온',
  cassiopeia: '카시오페이아',
  phoenix: '불사조',
  eclipse: '일식의 그림자',
};
export const CONSTELLATION_EFFECTS: Record<Constellation, string> = {
  orion: '사냥꾼의 기운 — 작물이 밤마다 하루 더 자란다',
  cassiopeia: '여왕의 기운 — 수확물이 ★별빛 등급(1.5배)이 된다',
  phoenix: '불사의 기운 — 수확량 +1, 계절이 바뀌어도 시들지 않는다',
  eclipse: '그림자의 기운 — 수확물의 절반이 ☀일식 등급(3배)으로 변한다',
};

/** 하루는 06:00(360분)에 시작해 다음 날 02:00(1560분)에 끝난다. */
export const DAY_START = 360;
export const NIGHT_START = 19 * 60;
export const DAY_END = 26 * 60;
/** 일식은 11:00~15:00 사이 하늘을 가린다. */
export const SOLAR_ECLIPSE_START = 11 * 60;
export const SOLAR_ECLIPSE_END = 15 * 60;
export const FESTIVAL_DAY_OF_SEASON = 19;
export const FESTIVAL_START = 17 * 60;
export const FESTIVAL_END = 24 * 60;

export function seasonOf(day: number): Season {
  return (Math.floor(day / DAYS_PER_SEASON) % 4) as Season;
}
export function dayOfSeason(day: number): number {
  return (day % DAYS_PER_SEASON) + 1;
}
export function yearOf(day: number): number {
  return Math.floor(day / (DAYS_PER_SEASON * 4)) + 1;
}
/** 0=삭, 4=보름. 첫날은 상현달(2)에서 시작해 사흘째에 첫 보름달이 뜬다. */
export function moonPhase(day: number): number {
  return (day + 2) % MOON_CYCLE;
}
export function lunation(day: number): number {
  return Math.floor((day + 2) / MOON_CYCLE);
}
export function isFullMoon(day: number): boolean {
  return moonPhase(day) === 4;
}
export function isNewMoon(day: number): boolean {
  return moonPhase(day) === 0;
}
/** 홀수 번째 삭에 일식이 일어난다. */
export function isSolarEclipse(day: number): boolean {
  return isNewMoon(day) && lunation(day) % 2 === 1;
}
/** 세 번에 한 번 보름달이 개기월식이 된다. 그날 밤 하늘에는 '일식의 그림자'가 뜬다. */
export function isLunarEclipse(day: number): boolean {
  return isFullMoon(day) && lunation(day) % 3 === 1;
}
export function solarEclipseActive(day: number, minutes: number): boolean {
  return isSolarEclipse(day) && minutes >= SOLAR_ECLIPSE_START && minutes < SOLAR_ECLIPSE_END;
}
export function constellationOf(day: number): Constellation {
  if (isLunarEclipse(day)) return 'eclipse';
  return (['orion', 'cassiopeia', 'phoenix'] as const)[day % 3]!;
}
export function isFestivalDay(day: number): boolean {
  return dayOfSeason(day) === FESTIVAL_DAY_OF_SEASON;
}
export function isNight(minutes: number): boolean {
  return minutes >= NIGHT_START;
}
export function weatherOf(seed: number, day: number): Weather {
  if (day === 0 || isSolarEclipse(day) || isLunarEclipse(day) || isFestivalDay(day)) return 'clear';
  return hash01(seed, day) < 0.2 ? 'rain' : 'clear';
}
/** 별자리 룬은 맑은 밤에만 엮을 수 있다. */
export function canWeave(seed: number, day: number, minutes: number): boolean {
  return isNight(minutes) && weatherOf(seed, day) === 'clear';
}
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${m.toString().padStart(2, '0')}`;
}
export function formatDate(day: number): string {
  return `${yearOf(day)}년차 ${SEASON_NAMES[seasonOf(day)]} ${dayOfSeason(day)}일`;
}

export interface DayForecast {
  day: number;
  weather: Weather;
  moon: number;
  constellation: Constellation;
  solarEclipse: boolean;
  lunarEclipse: boolean;
  festival: boolean;
}
export function forecast(seed: number, fromDay: number, count: number): DayForecast[] {
  const out: DayForecast[] = [];
  for (let d = fromDay; d < fromDay + count; d++) {
    out.push({
      day: d,
      weather: weatherOf(seed, d),
      moon: moonPhase(d),
      constellation: constellationOf(d),
      solarEclipse: isSolarEclipse(d),
      lunarEclipse: isLunarEclipse(d),
      festival: isFestivalDay(d),
    });
  }
  return out;
}
