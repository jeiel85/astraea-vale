import { CROPS } from './crops';

export type ItemKind = 'tool' | 'seed' | 'crop' | 'product' | 'ore' | 'essence' | 'fertilizer' | 'potion' | 'key';
export type IconShape =
  | 'hoe' | 'can' | 'staff' | 'sword'
  | 'seed' | 'crop'
  | 'bottle' | 'egg' | 'ore' | 'crystal' | 'relic' | 'heart' | 'orb' | 'sack' | 'flask';

export type PotionEffect = 'heal' | 'aegis' | 'firestorm' | 'gale' | 'astral' | 'eclipse';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: ItemKind;
  /** 출하 가격(0이면 팔 수 없음) */
  price: number;
  stack: number;
  icon: IconShape;
  c1: string;
  c2: string;
  /** 먹을 수 있으면 회복하는 기력 */
  energy?: number;
  potion?: PotionEffect;
  cropId?: string;
}

/** 품질: 0 일반, 1 ★별빛(1.5배), 2 ☀일식(3배) */
export type Quality = 0 | 1 | 2;
export const QUALITY_MULT: Record<Quality, number> = { 0: 1, 1: 1.5, 2: 3 };
export const QUALITY_LABEL: Record<Quality, string> = { 0: '', 1: '★별빛 ', 2: '☀일식 ' };

const list: ItemDef[] = [
  { id: 'hoe', name: '괭이', desc: '흙을 갈아 밭을 만든다.', kind: 'tool', price: 0, stack: 1, icon: 'hoe', c1: '#b8c4d0', c2: '#9a6a3a' },
  { id: 'can', name: '물뿌리개', desc: '앞의 밭 한 칸에 물을 준다. 물은 마르지 않는다.', kind: 'tool', price: 0, stack: 1, icon: 'can', c1: '#6aa8e8', c2: '#3a6ab0' },
  { id: 'staff', name: '별빛 지팡이', desc: '낮: 마력으로 넓은 밭에 비를 내린다.\n맑은 밤: 별자리 룬을 엮는다.', kind: 'tool', price: 0, stack: 1, icon: 'staff', c1: '#ffe27a', c2: '#8a6ad8' },
  { id: 'sword', name: '검', desc: '광산의 괴물과 싸우는 검. 대장간에서 강화할 수 있다.', kind: 'tool', price: 0, stack: 1, icon: 'sword', c1: '#dfe8f2', c2: '#7a5a3a' },

  { id: 'milk', name: '우유', desc: '신선한 우유.', kind: 'product', price: 70, stack: 99, icon: 'bottle', c1: '#ffffff', c2: '#cfe4ff', energy: 20 },
  { id: 'milk_pink', name: '딸기 우유', desc: '분홍 소가 주는 달콤한 우유.', kind: 'product', price: 110, stack: 99, icon: 'bottle', c1: '#ffc4dc', c2: '#ff8ab8', energy: 25 },
  { id: 'milk_navy', name: '은하 우유', desc: '별무늬 소의 우유. 반짝이는 알갱이가 떠 있다.', kind: 'product', price: 160, stack: 99, icon: 'bottle', c1: '#5a6ad8', c2: '#ffe27a', energy: 30 },
  { id: 'milk_gold', name: '황금 우유', desc: '황금빛 소에게서만 나는 전설의 우유.', kind: 'product', price: 260, stack: 99, icon: 'bottle', c1: '#ffd84a', c2: '#fff4b0', energy: 40 },
  { id: 'egg', name: '오리알', desc: '큼직한 오리알.', kind: 'product', price: 40, stack: 99, icon: 'egg', c1: '#f4efe2', c2: '#d8cdb0', energy: 15 },
  { id: 'egg_pink', name: '분홍 알', desc: '파스텔 오리가 낳은 분홍빛 알.', kind: 'product', price: 65, stack: 99, icon: 'egg', c1: '#ffcde0', c2: '#ff9cc0', energy: 18 },
  { id: 'egg_navy', name: '별무늬 알', desc: '밤하늘처럼 점이 박힌 알.', kind: 'product', price: 95, stack: 99, icon: 'egg', c1: '#4a5ac8', c2: '#ffe27a', energy: 22 },
  { id: 'egg_gold', name: '황금 알', desc: '눈부시게 빛나는 알.', kind: 'product', price: 160, stack: 99, icon: 'egg', c1: '#ffd84a', c2: '#fff4b0', energy: 30 },

  { id: 'copper', name: '구리 광석', desc: '광산 얕은 층의 광석.', kind: 'ore', price: 30, stack: 99, icon: 'ore', c1: '#d8884a', c2: '#7a6a62' },
  { id: 'moonsilver', name: '월은 광석', desc: '달빛을 머금은 은. 중층에서 나온다.', kind: 'ore', price: 90, stack: 99, icon: 'ore', c1: '#cfe0ff', c2: '#5a5a7a' },
  { id: 'star_crystal', name: '별 결정', desc: '떨어진 별이 굳은 결정. 깊은 층에서 나온다.', kind: 'ore', price: 200, stack: 99, icon: 'crystal', c1: '#ffe27a', c2: '#ff9ad8' },
  { id: 'relic', name: '고대 유물', desc: '검은 일식 이전 시대의 유물 조각.', kind: 'ore', price: 600, stack: 99, icon: 'relic', c1: '#c8a86a', c2: '#5ad8c8' },
  { id: 'essence', name: '몬스터 정수', desc: '쓰러진 괴물에서 추출한 마력. 연금술 재료.', kind: 'essence', price: 25, stack: 99, icon: 'orb', c1: '#c06aff', c2: '#ffd0ff' },
  { id: 'fertilizer', name: '정수 비료', desc: '밭에 쓰면 한 단계 자란다.\n목장에 쓰면 교배 대기 80% 단축 + 돌연변이 확률 상승(3일).', kind: 'fertilizer', price: 60, stack: 99, icon: 'sack', c1: '#b48ae8', c2: '#7a5a3a' },
  { id: 'eclipse_heart', name: '일식의 심장', desc: '일식의 비룡이 품고 있던 검은 태양. 골짜기를 되살릴 열쇠.', kind: 'key', price: 0, stack: 1, icon: 'heart', c1: '#2a1a3a', c2: '#ffb03a' },

  { id: 'tonic', name: '회복 토닉', desc: '체력 45 회복.', kind: 'potion', price: 80, stack: 20, icon: 'flask', c1: '#ff6a8a', c2: '#ffd0dc', potion: 'heal' },
  { id: 'aegis', name: '별빛 방패 물약', desc: '4초 동안 모든 피해를 막는다.', kind: 'potion', price: 400, stack: 20, icon: 'flask', c1: '#9fd8ff', c2: '#ffffff', potion: 'aegis' },
  { id: 'firestorm', name: '불사조 화염폭풍', desc: '주변 넓은 범위에 화염 폭풍을 일으킨다.', kind: 'potion', price: 450, stack: 20, icon: 'flask', c1: '#ff5a2a', c2: '#ffd04a', potion: 'firestorm' },
  { id: 'gale', name: '질풍 엘릭서', desc: '30초 동안 이동·대시가 빨라지고 공격력 +20%.', kind: 'potion', price: 300, stack: 20, icon: 'flask', c1: '#6af0b0', c2: '#e0fff0', potion: 'gale' },
  { id: 'astral', name: '별의 비약', desc: '기력과 마력을 가득 채운다.', kind: 'potion', price: 380, stack: 20, icon: 'flask', c1: '#c0a0ff', c2: '#ffe27a', potion: 'astral' },
  { id: 'eclipse_elixir', name: '일식의 영약', desc: '60초 동안 공격력 +50%.', kind: 'potion', price: 1500, stack: 20, icon: 'flask', c1: '#3a2a5a', c2: '#ffb03a', potion: 'eclipse' },
];

for (const c of CROPS) {
  list.push({
    id: `seed_${c.id}`,
    name: c.seedName,
    desc: c.desc,
    kind: 'seed',
    price: Math.floor(c.seedPrice / 2),
    stack: 99,
    icon: 'seed',
    c1: c.fruit,
    c2: c.leaf,
    cropId: c.id,
  });
  list.push({
    id: c.id,
    name: c.name,
    desc: c.desc,
    kind: 'crop',
    price: c.sellPrice,
    stack: 99,
    icon: 'crop',
    c1: c.fruit,
    c2: c.fruit2,
    energy: c.energy > 0 ? c.energy : undefined,
    cropId: c.id,
  });
}

export const ITEMS: ReadonlyMap<string, ItemDef> = new Map(list.map((i) => [i.id, i]));

export function itemDef(id: string): ItemDef {
  const d = ITEMS.get(id);
  if (!d) throw new Error(`알 수 없는 아이템: ${id}`);
  return d;
}
export function sellValue(id: string, q: Quality): number {
  return Math.floor(itemDef(id).price * QUALITY_MULT[q]);
}
export function displayName(id: string, q: Quality = 0): string {
  return QUALITY_LABEL[q] + itemDef(id).name;
}
