export interface Recipe {
  id: string;
  output: string;
  outputCount: number;
  inputs: readonly { id: string; n: number }[];
  hint: string;
}

/** 연금술 가마솥 레시피. 농장 수확물 + 광산 전리품이 서로를 돌린다. */
export const RECIPES: readonly Recipe[] = [
  { id: 'tonic', output: 'tonic', outputCount: 2, inputs: [{ id: 'turnip', n: 1 }, { id: 'milk', n: 1 }], hint: '농장 기본 재료로 만드는 회복약' },
  { id: 'tonic_b', output: 'tonic', outputCount: 2, inputs: [{ id: 'potato', n: 2 }, { id: 'egg', n: 1 }], hint: '감자와 알로 만드는 회복약' },
  { id: 'fertilizer', output: 'fertilizer', outputCount: 1, inputs: [{ id: 'essence', n: 3 }], hint: '몬스터 정수를 농장의 힘으로' },
  { id: 'gale', output: 'gale', outputCount: 1, inputs: [{ id: 'star_pepper', n: 1 }, { id: 'carrot', n: 1 }], hint: '오리온의 매운 기운' },
  { id: 'aegis', output: 'aegis', outputCount: 1, inputs: [{ id: 'moon_rose', n: 1 }, { id: 'egg', n: 1 }], hint: '보름달의 장막' },
  { id: 'firestorm', output: 'firestorm', outputCount: 1, inputs: [{ id: 'emberfruit', n: 1 }, { id: 'essence', n: 2 }], hint: '불사조의 숨결을 병에 담는다' },
  { id: 'astral', output: 'astral', outputCount: 1, inputs: [{ id: 'starbell', n: 1 }, { id: 'star_crystal', n: 1 }], hint: '별의 종소리와 결정' },
  { id: 'eclipse_elixir', output: 'eclipse_elixir', outputCount: 1, inputs: [{ id: 'umbral_lotus', n: 1 }, { id: 'sun_wheat', n: 2 }], hint: '해와 그림자를 한 잔에' },
];
