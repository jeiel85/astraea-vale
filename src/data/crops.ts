import type { Constellation, Season } from '../sim/calendar';

export type CropShape = 'root' | 'bush' | 'vine' | 'stalk' | 'gourd' | 'head' | 'flower' | 'grain' | 'lotus' | 'pepper';
export type CropSpecial = 'fullMoonBloom' | 'eclipseTriple';

export interface CropDef {
  id: string;
  name: string;
  seedName: string;
  /** 자라는 계절. 'any'는 천문 작물처럼 계절을 타지 않는다. */
  seasons: readonly Season[] | 'any';
  /** 다 자라는 데 필요한 '물 준 날' 수 */
  growDays: number;
  /** 수확 후 다시 열매 맺기까지의 날 수 (없으면 한 번 수확하고 사라짐) */
  regrowDays?: number;
  yield: number;
  seedPrice: number;
  sellPrice: number;
  /** 이 별자리 룬이 새겨진 밭에서만 싹이 튼다. */
  requiredConstellation?: Constellation;
  glowsAtNight: boolean;
  special?: CropSpecial;
  /** 먹으면 회복하는 기력 */
  energy: number;
  shape: CropShape;
  leaf: string;
  fruit: string;
  fruit2: string;
  desc: string;
}

const L = '#5fb85a';
const L2 = '#3f8f4e';

export const CROPS: readonly CropDef[] = [
  { id: 'turnip', name: '순무', seedName: '순무 씨앗', seasons: [0, 2], growDays: 4, yield: 1, seedPrice: 20, sellPrice: 45, glowsAtNight: false, energy: 15, shape: 'root', leaf: L, fruit: '#f3eef7', fruit2: '#c58ad8', desc: '하얗고 동그란 뿌리채소. 빨리 자라 첫 농사에 좋다.' },
  { id: 'potato', name: '감자', seedName: '씨감자', seasons: [0], growDays: 6, yield: 2, seedPrice: 40, sellPrice: 55, glowsAtNight: false, energy: 20, shape: 'root', leaf: L2, fruit: '#d9b27a', fruit2: '#a77d4c', desc: '한 포기에서 두 알씩 나오는 든든한 감자.' },
  { id: 'carrot', name: '당근', seedName: '당근 씨앗', seasons: [0, 2], growDays: 5, yield: 1, seedPrice: 30, sellPrice: 70, glowsAtNight: false, energy: 15, shape: 'root', leaf: '#7fd068', fruit: '#ff9a3c', fruit2: '#d9661f', desc: '아삭하고 달콤한 주황빛 당근.' },
  { id: 'strawberry', name: '딸기', seedName: '딸기 모종', seasons: [0], growDays: 8, regrowDays: 3, yield: 1, seedPrice: 80, sellPrice: 60, glowsAtNight: false, energy: 12, shape: 'bush', leaf: L, fruit: '#ff4f6d', fruit2: '#c92a4a', desc: '수확해도 다시 열리는 봄의 보석.' },
  { id: 'tomato', name: '토마토', seedName: '토마토 씨앗', seasons: [1], growDays: 8, regrowDays: 3, yield: 1, seedPrice: 60, sellPrice: 55, glowsAtNight: false, energy: 14, shape: 'vine', leaf: L2, fruit: '#ff5a3c', fruit2: '#c7351f', desc: '지지대를 타고 오르며 계속 열매를 맺는다.' },
  { id: 'corn', name: '옥수수', seedName: '옥수수 씨앗', seasons: [1, 2], growDays: 10, regrowDays: 4, yield: 1, seedPrice: 100, sellPrice: 65, glowsAtNight: false, energy: 18, shape: 'stalk', leaf: '#6cc04a', fruit: '#ffd84a', fruit2: '#e0a92a', desc: '여름부터 가을까지 자라는 키다리.' },
  { id: 'blueberry', name: '블루베리', seedName: '블루베리 모종', seasons: [1], growDays: 9, regrowDays: 3, yield: 3, seedPrice: 90, sellPrice: 30, glowsAtNight: false, energy: 8, shape: 'bush', leaf: L2, fruit: '#5a7bff', fruit2: '#3a4fc0', desc: '한 번에 한 움큼씩 열리는 여름 베리.' },
  { id: 'eggplant', name: '가지', seedName: '가지 씨앗', seasons: [1, 2], growDays: 7, regrowDays: 4, yield: 1, seedPrice: 50, sellPrice: 50, glowsAtNight: false, energy: 12, shape: 'vine', leaf: L, fruit: '#8a4fc7', fruit2: '#5e2f95', desc: '윤기 나는 보랏빛 가지.' },
  { id: 'pumpkin', name: '호박', seedName: '호박 씨앗', seasons: [2], growDays: 10, yield: 1, seedPrice: 120, sellPrice: 320, glowsAtNight: false, energy: 30, shape: 'gourd', leaf: L2, fruit: '#ff8c2a', fruit2: '#c95f12', desc: '가을 축제의 주인공. 크고 값지다.' },
  { id: 'cabbage', name: '양배추', seedName: '양배추 씨앗', seasons: [2, 3], growDays: 7, yield: 1, seedPrice: 60, sellPrice: 150, glowsAtNight: false, energy: 20, shape: 'head', leaf: '#9be08a', fruit: '#c8f0b0', fruit2: '#7fc06a', desc: '서리에도 꿋꿋한 겨울 채소.' },
  // 천문 작물
  { id: 'star_pepper', name: '별고추', seedName: '별고추 씨앗', seasons: 'any', growDays: 5, regrowDays: 3, yield: 1, seedPrice: 120, sellPrice: 180, requiredConstellation: 'orion', glowsAtNight: true, energy: 10, shape: 'pepper', leaf: '#4fae8f', fruit: '#ff6a3a', fruit2: '#ffd36a', desc: '오리온 룬 위에서만 싹튼다. 끝이 별처럼 갈라진 매운 고추.' },
  { id: 'starbell', name: '별종꽃', seedName: '별종꽃 구근', seasons: 'any', growDays: 6, yield: 1, seedPrice: 150, sellPrice: 260, requiredConstellation: 'cassiopeia', glowsAtNight: true, energy: 5, shape: 'flower', leaf: '#5fb8a8', fruit: '#9fd8ff', fruit2: '#ffffff', desc: '카시오페이아 룬 위에서만 핀다. 밤바람에 맑은 종소리가 난다.' },
  { id: 'emberfruit', name: '불사조 열매', seedName: '불사조 열매 씨앗', seasons: 'any', growDays: 7, yield: 1, seedPrice: 180, sellPrice: 300, requiredConstellation: 'phoenix', glowsAtNight: true, energy: 25, shape: 'gourd', leaf: '#c98a3a', fruit: '#ff4a2a', fruit2: '#ffd04a', desc: '불사조 룬 위에서만 자란다. 손에 쥐면 따뜻하다.' },
  { id: 'moon_rose', name: '달빛 장미', seedName: '달빛 장미 모종', seasons: 'any', growDays: 5, yield: 1, seedPrice: 200, sellPrice: 520, glowsAtNight: true, special: 'fullMoonBloom', energy: 5, shape: 'flower', leaf: '#4a9a7a', fruit: '#7fb4ff', fruit2: '#e8f2ff', desc: '봉오리로 자란 뒤 보름달 밤에만 꽃을 피운다.' },
  { id: 'sun_wheat', name: '태양 밀', seedName: '태양 밀 씨앗', seasons: 'any', growDays: 6, yield: 2, seedPrice: 140, sellPrice: 150, glowsAtNight: false, special: 'eclipseTriple', energy: 15, shape: 'grain', leaf: '#b8c04a', fruit: '#ffd23a', fruit2: '#ff9a1a', desc: '일식이 하늘을 가린 동안 수확하면 ☀일식 등급(3배)이 된다.' },
  { id: 'umbral_lotus', name: '그림자 연꽃', seedName: '그림자 연꽃 씨앗', seasons: 'any', growDays: 4, yield: 1, seedPrice: 900, sellPrice: 1200, requiredConstellation: 'eclipse', glowsAtNight: true, energy: 0, shape: 'lotus', leaf: '#3a3a6a', fruit: '#2a1a4a', fruit2: '#c08aff', desc: '개기월식 밤의 룬 위에서만 피는 전설의 꽃.' },
];

const byId = new Map(CROPS.map((c) => [c.id, c]));
export function cropDef(id: string): CropDef {
  const c = byId.get(id);
  if (!c) throw new Error(`알 수 없는 작물: ${id}`);
  return c;
}
export function cropBySeed(seedItemId: string): CropDef | undefined {
  if (!seedItemId.startsWith('seed_')) return undefined;
  return byId.get(seedItemId.slice(5));
}
export function cropGrowsIn(c: CropDef, season: Season): boolean {
  return c.seasons === 'any' || c.seasons.includes(season);
}
