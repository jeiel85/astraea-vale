import {
  BASE_MUTATION,
  BLESSED_MUTATION_BONUS,
  BREED_COOLDOWN_DAYS,
  BREED_MIN_AFFECTION,
  PEN_CAPACITY,
  SPECIES,
  VARIANT_ORDER,
  type Variant,
} from '../data/animals';
import type { Quality } from '../data/items';
import type { Rng } from '../engine/rng';
import { newAnimal, type Animal, type GameState, type ItemStack } from './state';

export function isAdult(a: Animal): boolean {
  return a.ageDays >= SPECIES[a.species].adultAge;
}

export interface PetResult {
  petted: boolean;
  product: ItemStack | null;
}

/** 쓰다듬기: 하루 한 번 애정 +6. 준비된 생산물이 있으면 함께 거둔다. */
export function petAnimal(a: Animal): PetResult {
  let petted = false;
  if (!a.pettedToday) {
    a.pettedToday = true;
    a.affection = Math.min(100, a.affection + 6);
    petted = true;
  }
  let product: ItemStack | null = null;
  if (a.productReady) {
    a.productReady = false;
    const q: Quality = a.affection >= 70 ? 1 : 0;
    product = { id: SPECIES[a.species].product[a.variant], n: 1, q };
  }
  return { petted, product };
}

/** 밤사이 가축 상태 갱신. */
export function animalNight(a: Animal): void {
  if (!a.pettedToday) a.affection = Math.max(0, a.affection - 3);
  a.pettedToday = false;
  a.ageDays++;
  if (a.cooldown > 0) a.cooldown--;
  a.productReady = isAdult(a) && a.affection >= 10;
}

export function canBreed(a: Animal, b: Animal): string | null {
  if (a.id === b.id) return '서로 다른 두 마리가 필요하다.';
  if (a.species !== b.species) return '같은 종끼리만 교배할 수 있다.';
  if (!isAdult(a) || !isAdult(b)) return '다 자란 가축만 교배할 수 있다.';
  if (a.cooldown > 0 || b.cooldown > 0) return `교배 대기 중이다(${Math.max(a.cooldown, b.cooldown)}일 남음).`;
  if (a.affection < BREED_MIN_AFFECTION || b.affection < BREED_MIN_AFFECTION)
    return `애정이 ${BREED_MIN_AFFECTION} 이상이어야 한다.`;
  return null;
}

export function mutationChance(blessed: boolean): number {
  return BASE_MUTATION + (blessed ? BLESSED_MUTATION_BONUS : 0);
}

/** 새끼의 변종을 정한다: 부모 중 하나를 물려받고, 돌연변이면 한 단계 위로. */
export function rollVariant(a: Variant, b: Variant, rng: Rng, blessed: boolean): { variant: Variant; mutated: boolean } {
  let idx = VARIANT_ORDER.indexOf(rng.chance(0.5) ? a : b);
  let chance = mutationChance(blessed);
  // 같은 희귀 변종끼리면 혈통이 진해진다.
  if (a === b && a !== 'standard') chance += 0.15;
  let mutated = false;
  if (idx < VARIANT_ORDER.length - 1 && rng.chance(chance)) {
    idx++;
    mutated = true;
  }
  return { variant: VARIANT_ORDER[idx]!, mutated };
}

export type BreedResult = { ok: true; child: Animal; mutated: boolean } | { ok: false; msg: string };

export function breed(s: GameState, aId: number, bId: number, rng: Rng): BreedResult {
  const a = s.animals.find((x) => x.id === aId);
  const b = s.animals.find((x) => x.id === bId);
  if (!a || !b) return { ok: false, msg: '가축을 찾을 수 없다.' };
  if (s.animals.length >= PEN_CAPACITY) return { ok: false, msg: `목장이 가득 찼다(최대 ${PEN_CAPACITY}마리).` };
  const why = canBreed(a, b);
  if (why) return { ok: false, msg: why };
  const { variant, mutated } = rollVariant(a.variant, b.variant, rng, s.essenceBlessDays > 0);
  const child = newAnimal(s, a.species, variant, 0);
  child.affection = Math.round((a.affection + b.affection) / 4);
  s.animals.push(child);
  a.cooldown = BREED_COOLDOWN_DAYS;
  b.cooldown = BREED_COOLDOWN_DAYS;
  s.stats.bred++;
  return { ok: true, child, mutated };
}

/** 정수 비료를 목장에 뿌림: 모든 교배 대기 80% 단축, 3일간 돌연변이 확률 상승. */
export function blessPasture(s: GameState): number {
  let n = 0;
  for (const a of s.animals) {
    if (a.cooldown > 0) {
      a.cooldown = Math.floor(a.cooldown * 0.2);
      n++;
    }
  }
  s.essenceBlessDays = 3;
  return n;
}

export function buyAnimal(s: GameState, species: 'cow' | 'duck'): string | null {
  const def = SPECIES[species];
  if (s.animals.length >= PEN_CAPACITY) return `목장이 가득 찼다(최대 ${PEN_CAPACITY}마리).`;
  if (s.gold < def.price) return '골드가 부족하다.';
  s.gold -= def.price;
  s.animals.push(newAnimal(s, species, 'standard', 1));
  return null;
}
