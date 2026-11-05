import type { Species, Variant } from '../data/animals';
import { SPECIES } from '../data/animals';
import type { GoalId } from '../data/goals';
import type { Quality } from '../data/items';
import type { NpcId } from '../data/npcs';
import { NPCS } from '../data/npcs';
import type { Constellation } from './calendar';
import { DAY_START } from './calendar';

export const SAVE_VERSION = 1;
export const INVENTORY_SIZE = 30;
export const HOTBAR_SIZE = 10;

export interface ItemStack {
  id: string;
  n: number;
  q: Quality;
}

export interface PlotCrop {
  id: string;
  /** 물 준 날 누적. growDays 이상이면 다 자람 */
  growth: number;
  /** 보름달 개화 작물이 꽃을 피웠는지 */
  bloomed: boolean;
  /** 계절이 바뀌어 시들었는지 */
  dead: boolean;
  harvests: number;
}

export interface Plot {
  watered: boolean;
  crop: PlotCrop | null;
  rune: Constellation | null;
}

export interface Animal {
  id: number;
  species: Species;
  variant: Variant;
  name: string;
  affection: number;
  ageDays: number;
  cooldown: number;
  pettedToday: boolean;
  productReady: boolean;
}

export interface NpcState {
  affection: number;
  talkedDay: number;
  giftedDay: number;
  eventsSeen: number[];
}

export interface Appearance {
  hairStyle: number;
  hair: string;
  eyes: string;
  skin: string;
  outfit: string;
  accent: string;
  /** 16x16 도트 무늬(팔레트 인덱스, -1은 투명). null이면 무늬 없음 */
  pattern: number[] | null;
  patternOnShirt: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  playerName: string;
  appearance: Appearance;
  day: number;
  minutes: number;
  gold: number;
  inventory: (ItemStack | null)[];
  plots: Record<string, Plot>;
  animals: Animal[];
  nextAnimalId: number;
  npcs: Record<NpcId, NpcState>;
  shippingBin: ItemStack[];
  goals: Partial<Record<GoalId, boolean>>;
  mine: { deepest: number; checkpoint: number; matriarch: boolean; wyrm: boolean };
  swordLevel: number;
  staffLevel: number;
  /** 정수 비료 축복이 남은 날 수(돌연변이 확률 상승) */
  essenceBlessDays: number;
  festivalEntered: number[];
  festivalDanced: number[];
  bannerPlaced: boolean;
  introSeen: boolean;
  endingSeen: boolean;
  stats: { shipped: number; earned: number; kills: number; harvested: number; woven: number; bred: number; crafted: number };
}

export const DEFAULT_APPEARANCE: Appearance = {
  hairStyle: 3,
  hair: '#5a3a8a',
  eyes: '#ff6a9a',
  skin: '#ffe0cc',
  outfit: '#ff8aa8',
  accent: '#fff4c0',
  pattern: null,
  patternOnShirt: false,
};

export const SWORD_DAMAGE = [8, 12, 17, 24] as const;
export const SWORD_NAMES = ['낡은 검', '구리 검', '월은 검', '별결정 검'] as const;
export const MAX_HP = 100;
export const MAX_ENERGY = 120;
export const MAX_MANA = 60;

export function plotKey(x: number, y: number): string {
  return `${x},${y}`;
}
export function parsePlotKey(k: string): { x: number; y: number } {
  const [a, b] = k.split(',');
  return { x: Number(a), y: Number(b) };
}

export function newAnimal(s: GameState, species: Species, variant: Variant, ageDays: number, name?: string): Animal {
  const id = s.nextAnimalId++;
  const def = SPECIES[species];
  const taken = new Set(s.animals.map((a) => a.name));
  const free = def.names.filter((n) => !taken.has(n));
  const nm = name ?? (free.length > 0 ? free[id % free.length]! : `${def.name} ${id}`);
  return { id, species, variant, name: nm, affection: 20, ageDays, cooldown: 0, pettedToday: false, productReady: false };
}

export function newGame(seed: number, playerName: string): GameState {
  const npcs = {} as Record<NpcId, NpcState>;
  for (const n of NPCS) npcs[n.id] = { affection: 0, talkedDay: -1, giftedDay: -1, eventsSeen: [] };
  const inv: (ItemStack | null)[] = new Array(INVENTORY_SIZE).fill(null);
  const start: ItemStack[] = [
    { id: 'hoe', n: 1, q: 0 },
    { id: 'can', n: 1, q: 0 },
    { id: 'staff', n: 1, q: 0 },
    { id: 'sword', n: 1, q: 0 },
    { id: 'seed_turnip', n: 12, q: 0 },
    { id: 'seed_potato', n: 6, q: 0 },
    { id: 'seed_moon_rose', n: 1, q: 0 },
    { id: 'tonic', n: 2, q: 0 },
  ];
  start.forEach((st, i) => (inv[i] = st));
  const s: GameState = {
    version: SAVE_VERSION,
    seed: seed >>> 0,
    rngState: (seed ^ 0xa5a5a5a5) >>> 0,
    playerName,
    appearance: { ...DEFAULT_APPEARANCE },
    day: 0,
    minutes: DAY_START,
    gold: 500,
    inventory: inv,
    plots: {},
    animals: [],
    nextAnimalId: 1,
    npcs,
    shippingBin: [],
    goals: {},
    mine: { deepest: 0, checkpoint: 1, matriarch: false, wyrm: false },
    swordLevel: 0,
    staffLevel: 0,
    essenceBlessDays: 0,
    festivalEntered: [],
    festivalDanced: [],
    bannerPlaced: false,
    introSeen: false,
    endingSeen: false,
    stats: { shipped: 0, earned: 0, kills: 0, harvested: 0, woven: 0, bred: 0, crafted: 0 },
  };
  s.animals.push(newAnimal(s, 'cow', 'standard', 5));
  s.animals.push(newAnimal(s, 'cow', 'standard', 5));
  s.animals.push(newAnimal(s, 'duck', 'standard', 4));
  s.animals.push(newAnimal(s, 'duck', 'standard', 4));
  return s;
}
