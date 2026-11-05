export type Species = 'cow' | 'duck';
export type Variant = 'standard' | 'pastelPink' | 'starryNavy' | 'goldenGlow';

/** 돌연변이 등급 순서. 교배 시 한 단계씩 올라간다. */
export const VARIANT_ORDER: readonly Variant[] = ['standard', 'pastelPink', 'starryNavy', 'goldenGlow'];
export const VARIANT_NAMES: Record<Variant, string> = {
  standard: '보통',
  pastelPink: '파스텔 핑크',
  starryNavy: '별무늬 네이비',
  goldenGlow: '골든 글로우',
};

export interface SpeciesDef {
  id: Species;
  name: string;
  adultAge: number;
  price: number;
  product: Record<Variant, string>;
  /** 변종별 몸 색 [몸, 그림자, 무늬] */
  colors: Record<Variant, readonly [string, string, string]>;
  names: readonly string[];
}

export const SPECIES: Record<Species, SpeciesDef> = {
  cow: {
    id: 'cow',
    name: '소',
    adultAge: 3,
    price: 900,
    product: { standard: 'milk', pastelPink: 'milk_pink', starryNavy: 'milk_navy', goldenGlow: 'milk_gold' },
    colors: {
      standard: ['#f4f0e8', '#c8bfb0', '#5a4a42'],
      pastelPink: ['#ffd0e4', '#e8a0c0', '#ff7aa8'],
      starryNavy: ['#3a4a9a', '#283070', '#ffe27a'],
      goldenGlow: ['#ffd84a', '#d8a82a', '#fff6c0'],
    },
    names: ['모카', '라떼', '구름', '푸딩', '마시멜로', '보리', '콩떡', '버터', '치즈', '누룽지'],
  },
  duck: {
    id: 'duck',
    name: '오리',
    adultAge: 3,
    price: 450,
    product: { standard: 'egg', pastelPink: 'egg_pink', starryNavy: 'egg_navy', goldenGlow: 'egg_gold' },
    colors: {
      standard: ['#ffffff', '#d8dce8', '#ffb03a'],
      pastelPink: ['#ffd8ea', '#f0a8c8', '#ff8a5a'],
      starryNavy: ['#4a5ac8', '#2a3488', '#ffe27a'],
      goldenGlow: ['#ffe060', '#e0b030', '#ff8a3a'],
    },
    names: ['꽥순', '두부', '레몬', '방울', '삐약', '솜사탕', '오뚝', '감귤', '도토리', '별똥'],
  },
};

export const PEN_CAPACITY = 12;
export const BREED_COOLDOWN_DAYS = 6;
export const BREED_MIN_AFFECTION = 40;
export const BASE_MUTATION = 0.08;
export const BLESSED_MUTATION_BONUS = 0.35;
