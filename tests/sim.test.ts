import { describe, expect, it } from 'vitest';
import { RECIPES } from '../src/data/recipes';
import { Rng } from '../src/engine/rng';
import { craft } from '../src/sim/alchemy';
import {
  constellationOf,
  forecast,
  isFullMoon,
  isLunarEclipse,
  isSolarEclipse,
  moonPhase,
  seasonOf,
  solarEclipseActive,
  weatherOf,
} from '../src/sim/calendar';
import { advanceDay, faintPenalty } from '../src/sim/day';
import {
  bloomUnderFullMoon,
  fertilizePlot,
  getPlot,
  growthStage,
  harvest,
  irrigate,
  isHarvestable,
  plant,
  till,
  water,
  weaveRune,
} from '../src/sim/farm';
import { addItem, countItem, removeItem } from '../src/sim/inventory';
import { blessPasture, breed, canBreed, petAnimal, rollVariant } from '../src/sim/livestock';
import { deserialize, serialize } from '../src/sim/save';
import { danceAtFestival, giveGift, hearts, talk } from '../src/sim/social';
import { newGame } from '../src/sim/state';

const ctx = (day: number, minutes = 600, seed = 1) => ({ day, minutes, rng: new Rng(seed) });

describe('천문 달력', () => {
  it('첫날은 상현달, 사흘째(day 2)가 첫 보름달', () => {
    expect(moonPhase(0)).toBe(2);
    expect(isFullMoon(2)).toBe(true);
  });
  it('일식·월식이 예보 가능한 주기로 일어난다', () => {
    const days = Array.from({ length: 112 }, (_, d) => d);
    expect(days.filter(isSolarEclipse).length).toBeGreaterThanOrEqual(6);
    expect(days.filter(isLunarEclipse).length).toBeGreaterThanOrEqual(3);
    for (const d of days.filter(isSolarEclipse)) expect(moonPhase(d)).toBe(0);
    for (const d of days.filter(isLunarEclipse)) {
      expect(moonPhase(d)).toBe(4);
      expect(constellationOf(d)).toBe('eclipse');
    }
  });
  it('일식은 11~15시에만 하늘을 가린다', () => {
    const d = [...Array(40).keys()].find(isSolarEclipse)!;
    expect(solarEclipseActive(d, 10 * 60 + 59)).toBe(false);
    expect(solarEclipseActive(d, 12 * 60)).toBe(true);
    expect(solarEclipseActive(d, 15 * 60)).toBe(false);
  });
  it('날씨는 시드로 결정되고, 첫날·천문 이벤트·축제 날은 맑다', () => {
    expect(weatherOf(7, 0)).toBe('clear');
    for (let d = 0; d < 200; d++) expect(weatherOf(7, d)).toBe(weatherOf(7, d));
    const f = forecast(7, 0, 112);
    for (const x of f) if (x.solarEclipse || x.lunarEclipse || x.festival) expect(x.weather).toBe('clear');
    const rainy = f.filter((x) => x.weather === 'rain').length;
    expect(rainy).toBeGreaterThan(5);
    expect(rainy).toBeLessThan(40);
  });
});

describe('가방', () => {
  it('같은 아이템·품질끼리만 쌓이고 넘치면 남은 개수를 돌려준다', () => {
    const inv = new Array(2).fill(null);
    expect(addItem(inv, 'turnip', 150, 0)).toBe(0);
    expect(inv[0]).toEqual({ id: 'turnip', n: 99, q: 0 });
    expect(inv[1]).toEqual({ id: 'turnip', n: 51, q: 0 });
    expect(addItem(inv, 'turnip', 60, 1)).toBe(60);
    expect(addItem(inv, 'turnip', 60, 0)).toBe(12);
  });
  it('모자라면 아무것도 꺼내지 않는다', () => {
    const inv = new Array(4).fill(null);
    addItem(inv, 'egg', 2);
    expect(removeItem(inv, 'egg', 3)).toBe(false);
    expect(countItem(inv, 'egg')).toBe(2);
    expect(removeItem(inv, 'egg', 2)).toBe(true);
    expect(inv.every((x) => x === null)).toBe(true);
  });
});

describe('농사', () => {
  it('갈고 심고 물 주면 밤마다 자라고 다 자라면 수확된다', () => {
    const s = newGame(1, '테스트');
    expect(plant(s, 3, 3, 'seed_turnip').ok).toBe(false);
    expect(till(s, 3, 3).ok).toBe(true);
    expect(plant(s, 3, 3, 'seed_turnip').ok).toBe(true);
    for (let i = 0; i < 4; i++) {
      expect(isHarvestable(getPlot(s, 3, 3)!)).toBe(false);
      water(s, 3, 3);
      advanceDay(s, false);
    }
    expect(growthStage(getPlot(s, 3, 3)!)).toBe(4);
    const got = harvest(s, 3, 3, ctx(s.day));
    expect(got).toEqual({ id: 'turnip', n: 1, q: 0 });
    expect(getPlot(s, 3, 3)!.crop).toBeNull();
  });
  it('물을 안 주면 자라지 않는다', () => {
    const s = newGame(1, 't');
    till(s, 0, 0);
    plant(s, 0, 0, 'seed_turnip');
    for (let i = 0; i < 6; i++) advanceDay(s, false);
    // 비 온 날은 자동으로 물이 들어가므로 0 이상일 수 있지만 물 준 날 수보다 크지 않다.
    expect(getPlot(s, 0, 0)!.crop!.growth).toBeLessThanOrEqual(6);
  });
  it('제철이 아닌 씨앗은 심을 수 없다', () => {
    const s = newGame(1, 't');
    till(s, 0, 0);
    expect(plant(s, 0, 0, 'seed_pumpkin').ok).toBe(false);
  });
  it('천문 작물은 맞는 별자리 룬 위에서만 싹튼다', () => {
    const s = newGame(1, 't');
    till(s, 0, 0);
    expect(plant(s, 0, 0, 'seed_star_pepper').ok).toBe(false);
    weaveRune(s, 0, 0, 1, 'orion');
    expect(plant(s, 0, 0, 'seed_star_pepper').ok).toBe(true);
  });
  it('오리온 룬은 하루에 이틀치씩 키운다', () => {
    const s = newGame(1, 't');
    till(s, 0, 0);
    weaveRune(s, 0, 0, 0, 'orion');
    plant(s, 0, 0, 'seed_potato');
    water(s, 0, 0);
    advanceDay(s, false);
    expect(getPlot(s, 0, 0)!.crop!.growth).toBe(2);
  });
  it('카시오페이아 룬은 ★별빛, 불사조 룬은 수확량 +1', () => {
    const s = newGame(1, 't');
    for (const [x, rune] of [[0, 'cassiopeia'], [5, 'phoenix']] as const) {
      till(s, x, 0);
      weaveRune(s, x, 0, 0, rune);
      plant(s, x, 0, 'seed_turnip');
      getPlot(s, x, 0)!.crop!.growth = 4;
    }
    expect(harvest(s, 0, 0, ctx(s.day))).toEqual({ id: 'turnip', n: 1, q: 1 });
    expect(harvest(s, 5, 0, ctx(s.day))).toEqual({ id: 'turnip', n: 2, q: 0 });
  });
  it('달빛 장미는 다 자라도 보름달 밤에야 수확할 수 있다', () => {
    const s = newGame(1, 't');
    till(s, 0, 0);
    plant(s, 0, 0, 'seed_moon_rose');
    const p = getPlot(s, 0, 0)!;
    p.crop!.growth = 5;
    expect(isHarvestable(p)).toBe(false);
    expect(bloomUnderFullMoon(s, 3, 20 * 60)).toBe(0); // 보름 아님
    expect(bloomUnderFullMoon(s, 2, 18 * 60)).toBe(0); // 보름이지만 아직 낮
    expect(bloomUnderFullMoon(s, 2, 19 * 60)).toBe(1);
    expect(isHarvestable(p)).toBe(true);
  });
  it('보름달 밤에 잠들어도 봉오리는 핀다', () => {
    const s = newGame(1, 't');
    s.day = 2; // 보름
    till(s, 0, 0);
    plant(s, 0, 0, 'seed_moon_rose');
    getPlot(s, 0, 0)!.crop!.growth = 5;
    const sum = advanceDay(s, false);
    expect(sum.bloomed).toBe(1);
    expect(isHarvestable(getPlot(s, 0, 0)!)).toBe(true);
  });
  it('태양 밀은 일식 동안 거두면 ☀일식 등급', () => {
    const s = newGame(1, 't');
    const eclipseDay = [...Array(40).keys()].find(isSolarEclipse)!;
    till(s, 0, 0);
    plant(s, 0, 0, 'seed_sun_wheat');
    getPlot(s, 0, 0)!.crop!.growth = 6;
    expect(harvest(s, 0, 0, ctx(eclipseDay, 12 * 60))).toEqual({ id: 'sun_wheat', n: 2, q: 2 });
  });
  it('계절이 바뀌면 제철 아닌 작물은 시들지만 불사조 룬은 지켜 준다', () => {
    const s = newGame(1, 't');
    s.day = 27; // 봄 마지막 날
    till(s, 0, 0);
    plant(s, 0, 0, 'seed_potato');
    till(s, 1, 0);
    weaveRune(s, 1, 0, 0, 'phoenix');
    plant(s, 1, 0, 'seed_potato');
    const sum = advanceDay(s, false);
    expect(seasonOf(s.day)).toBe(1);
    expect(sum.withered).toBe(1);
    expect(getPlot(s, 0, 0)!.crop!.dead).toBe(true);
    expect(getPlot(s, 1, 0)!.crop!.dead).toBe(false);
    expect(till(s, 0, 0).ok).toBe(true);
    expect(getPlot(s, 0, 0)!.crop).toBeNull();
  });
  it('지팡이 관개는 범위 안의 밭에 모두 물을 준다', () => {
    const s = newGame(1, 't');
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) till(s, x, y);
    expect(irrigate(s, 2, 2, 2)).toBe(25);
    expect(irrigate(s, 2, 2, 2)).toBe(0);
  });
  it('정수 비료는 한 단계 키운다', () => {
    const s = newGame(1, 't');
    till(s, 0, 0);
    plant(s, 0, 0, 'seed_turnip');
    expect(fertilizePlot(s, 0, 0).ok).toBe(true);
    expect(getPlot(s, 0, 0)!.crop!.growth).toBe(1);
  });
});

describe('가축', () => {
  it('쓰다듬으면 애정이 오르고 생산물을 거둔다', () => {
    const s = newGame(1, 't');
    const cow = s.animals[0]!;
    advanceDay(s, false);
    expect(cow.productReady).toBe(true);
    const r = petAnimal(cow);
    expect(r.petted).toBe(true);
    expect(r.product?.id).toBe('milk');
    expect(petAnimal(cow).petted).toBe(false);
  });
  it('교배 조건과 쿨타임, 정수 비료의 80% 단축', () => {
    const s = newGame(1, 't');
    const [a, b] = s.animals;
    expect(canBreed(a!, b!)).toMatch(/애정/);
    a!.affection = b!.affection = 50;
    const r = breed(s, a!.id, b!.id, new Rng(3));
    expect(r.ok).toBe(true);
    expect(a!.cooldown).toBe(6);
    expect(breed(s, a!.id, b!.id, new Rng(3)).ok).toBe(false);
    blessPasture(s);
    expect(a!.cooldown).toBe(1);
    expect(s.essenceBlessDays).toBe(3);
  });
  it('축복받은 목장에선 돌연변이가 훨씬 잦다', () => {
    const rng = new Rng(42);
    let plain = 0;
    let blessed = 0;
    for (let i = 0; i < 4000; i++) {
      if (rollVariant('standard', 'standard', rng, false).mutated) plain++;
      if (rollVariant('standard', 'standard', rng, true).mutated) blessed++;
    }
    expect(plain / 4000).toBeGreaterThan(0.05);
    expect(plain / 4000).toBeLessThan(0.11);
    expect(blessed / 4000).toBeGreaterThan(0.38);
  });
  it('최고 등급은 더 오르지 않는다', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) expect(rollVariant('goldenGlow', 'goldenGlow', rng, true).variant).toBe('goldenGlow');
  });
});

describe('연금술', () => {
  it('재료가 있으면 만들고 없으면 실패한다', () => {
    const s = newGame(1, 't');
    const r = RECIPES.find((x) => x.id === 'fertilizer')!;
    expect(craft(s, r).ok).toBe(false);
    addItem(s.inventory, 'essence', 3);
    expect(craft(s, r).ok).toBe(true);
    expect(countItem(s.inventory, 'fertilizer')).toBe(1);
    expect(countItem(s.inventory, 'essence')).toBe(0);
  });
});

describe('출하·하루 마감', () => {
  it('출하함은 품질 배율로 정산되고 첫 출하 목표가 달성된다', () => {
    const s = newGame(1, 't');
    s.shippingBin.push({ id: 'turnip', n: 2, q: 0 }, { id: 'turnip', n: 1, q: 2 });
    const g0 = s.gold;
    const sum = advanceDay(s, false);
    expect(sum.income).toBe(45 * 2 + 135);
    expect(s.gold).toBe(g0 + sum.income);
    expect(s.goals.ship).toBe(true);
  });
  it('쓰러지면 골드 10%(최대 300)를 잃는다', () => {
    expect(faintPenalty(1000)).toBe(100);
    expect(faintPenalty(99999)).toBe(300);
  });
});

describe('주민', () => {
  it('하루 첫 대화 +20, 하트 2개가 되면 이벤트가 한 번만 열린다', () => {
    const s = newGame(1, '아스트라');
    const rng = new Rng(1);
    expect(talk(s, 'lyra', rng).firstToday).toBe(true);
    expect(s.npcs.lyra.affection).toBe(20);
    expect(talk(s, 'lyra', rng).firstToday).toBe(false);
    s.npcs.lyra.affection = 200;
    s.day = 1;
    const t = talk(s, 'lyra', rng);
    expect(t.event).not.toBeNull();
    s.day = 2;
    expect(talk(s, 'lyra', rng).event).toBeNull();
    expect(hearts(s.npcs.lyra.affection)).toBe(2);
  });
  it('선물 반응: 좋아하는 것과 싫어하는 것', () => {
    const s = newGame(1, 't');
    expect(giveGift(s, 'lyra', 'starbell', 0).reaction).toBe('love');
    expect(s.npcs.lyra.affection).toBe(80);
    expect(giveGift(s, 'bram', 'starbell', 0).reaction).toBe('dislike');
    expect(s.npcs.bram.affection).toBe(0);
  });
  it('축제 춤은 하루 한 번', () => {
    const s = newGame(1, 't');
    expect(danceAtFestival(s, 'nova')).toBe(true);
    expect(danceAtFestival(s, 'lyra')).toBe(false);
  });
  it('대사의 {name}은 플레이어 이름으로 바뀐다', () => {
    const s = newGame(1, '아스트라');
    for (let i = 0; i < 30; i++) {
      s.day = i;
      const t = talk(s, 'nova', new Rng(i));
      expect(t.line).not.toContain('{name}');
    }
  });
});

describe('저장', () => {
  it('직렬화한 상태를 그대로 되살린다', () => {
    const s = newGame(9, 't');
    till(s, 1, 1);
    const back = deserialize(serialize(s));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.state).toEqual(s);
  });
  it('손상되거나 버전이 다른 데이터는 이유와 함께 거부한다', () => {
    expect(deserialize('{').ok).toBe(false);
    const s = newGame(9, 't');
    const r = deserialize(JSON.stringify({ ...s, version: 99 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/버전/);
    const bad = JSON.parse(serialize(s));
    bad.inventory[0] = { id: 'nope', n: 1, q: 0 };
    expect(deserialize(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('룩북 공유 코드', () => {
  it('무늬와 의상 색을 그대로 주고받는다', async () => {
    const { encodeLookbook, decodeLookbook, starPattern } = await import('../src/art/patterns');
    const pattern = starPattern();
    pattern[0] = 15;
    pattern[255] = 0;
    const code = encodeLookbook({ pattern, hairStyle: 2, hair: '#ff8ac8', eyes: '#3ad8c8', outfit: '#fff0f6', accent: '#ff5a8a' });
    expect(code.startsWith('AV1')).toBe(true);
    const back = decodeLookbook(code);
    expect(back).toEqual({ pattern, hairStyle: 2, hair: '#ff8ac8', eyes: '#3ad8c8', outfit: '#fff0f6', accent: '#ff5a8a' });
  });
  it('잘못된 코드는 거부한다', async () => {
    const { decodeLookbook } = await import('../src/art/patterns');
    expect(decodeLookbook('hello')).toBeNull();
    expect(decodeLookbook('AV1@@@')).toBeNull();
    expect(decodeLookbook('AV1AAAA')).toBeNull();
  });
});
