export type NpcId = 'lyra' | 'bram' | 'sol' | 'nova';
export type NpcService = 'shop' | 'forge' | 'staff' | 'festival';

export interface CharLook {
  skin: string;
  hair: string;
  hairShade: string;
  eyes: string;
  outfit: string;
  outfitShade: string;
  accent: string;
  pants: string;
  /** 0 짧은 머리, 1 긴 생머리, 2 트윈테일, 3 포니테일, 4 뾰족 머리 */
  hairStyle: number;
  accessory?: 'glasses' | 'headband' | 'starpin' | 'ribbon';
}

export interface ScheduleStop {
  /** 이 시각(분)부터 */
  from: number;
  /** 마을 타일 좌표. null이면 집에 들어가 보이지 않음 */
  at: { x: number; y: number } | null;
}

export interface HeartEvent {
  hearts: number;
  lines: readonly string[];
  reward?: { item?: string; n?: number; gold?: number };
}

export interface NpcDef {
  id: NpcId;
  name: string;
  title: string;
  look: CharLook;
  loves: readonly string[];
  likes: readonly string[];
  dislikes: readonly string[];
  services: readonly NpcService[];
  schedule: readonly ScheduleStop[];
  lines: {
    morning: readonly string[];
    afternoon: readonly string[];
    evening: readonly string[];
    night: readonly string[];
    rain: readonly string[];
    fullMoon: readonly string[];
    eclipse: readonly string[];
    festival: readonly string[];
    close: readonly string[];
    boss: readonly string[];
  };
  gift: { love: string; like: string; neutral: string; dislike: string };
  events: readonly HeartEvent[];
}

const H = (h: number, m = 0) => h * 60 + m;

export const NPCS: readonly NpcDef[] = [
  {
    id: 'lyra',
    name: '리라',
    title: '별지기',
    look: { skin: '#ffe0cc', hair: '#c8a8ff', hairShade: '#8a6ad8', eyes: '#ffc84a', outfit: '#3a3a8a', outfitShade: '#262668', accent: '#ffe27a', pants: '#2a2a5a', hairStyle: 1, accessory: 'starpin' },
    loves: ['starbell', 'moon_rose', 'star_crystal'],
    likes: ['blueberry', 'egg_navy', 'milk_navy', 'astral'],
    dislikes: ['essence', 'copper'],
    services: ['staff'],
    schedule: [
      { from: H(6), at: null },
      { from: H(10), at: { x: 18, y: 14 } },
      { from: H(14), at: { x: 25, y: 17 } },
      { from: H(18), at: { x: 22, y: 7 } },
      { from: H(25), at: null },
    ],
    lines: {
      morning: ['아침의 별은 해에 가려도 사라진 게 아니에요. 그냥… 조용히 기다리는 거죠.', '{name}님, 밤새 관측하느라 눈이 퉁퉁 부었어요. 비밀이에요?'],
      afternoon: ['낮에는 지팡이로 비를 부르면 밭이 한결 편할 거예요. 마력은 하룻밤 자면 차오르니까요.', '할머님도 이 시간엔 늘 밭에 계셨어요. 별을 키우는 사람은 해도 잘 알아야 한다면서.'],
      evening: ['곧 별이 떠요. 오늘 밤 하늘엔 어떤 별자리가 걸릴지, 관측소에서 확인했어요?', '노을이 지면 골짜기가 숨을 고르는 소리가 들려요.'],
      night: ['밭 위에 별자리를 엮을 땐 별을 하나하나 순서대로 이어 주세요. 별들도 차례를 좋아하거든요.', '오늘 밤 별빛, 정말 예쁘죠? …{name}님이랑 보니까 더요.'],
      rain: ['비 오는 밤엔 별자리를 엮을 수 없어요. 대신 별들이 내려와 밭에 물을 준다고 생각하면 덜 서운하죠.'],
      fullMoon: ['보름달이에요! 달빛 장미 봉오리가 있다면 오늘 밤 꼭 피어날 거예요.'],
      eclipse: ['일식… 검은 일식 이후로 하늘이 이렇게 어두워지면 아직도 손이 떨려요. 그래도 태양 밀을 거둘 기회예요.', '개기월식 밤에만 일식의 그림자 별자리가 떠요. 그 룬 위에서만 그림자 연꽃이 핀대요.'],
      festival: ['별빛 수확제예요! 노바가 반년을 준비했대요. 같이… 춤, 출래요?'],
      close: ['{name}님이 엮은 별자리를 보면 할머님 생각이 나요. 아니, 이제는 {name}님 생각만 나요.', '언젠가 골짜기 하늘이 완전히 맑아지면, 제일 먼저 {name}님한테 보여 주고 싶은 별이 있어요.'],
      boss: ['광산 깊은 곳의 비룡을 쓰러뜨렸다고요? …하늘이 조금 가벼워진 걸 느꼈어요. 고마워요.'],
    },
    gift: {
      love: '이걸… 저한테요? 별을 손에 쥔 기분이에요!',
      like: '고마워요. 관측소 창가에 놓아 둘게요.',
      neutral: '마음 써 줘서 고마워요.',
      dislike: '음… 이건 하늘보다는 땅에 가까운 물건이네요.',
    },
    events: [
      { hearts: 2, lines: ['저기, {name}님. 할머님이 남긴 별지도가 있는데요…', '이 골짜기의 별자리는 다른 곳과 조금 달라요. 땅의 마력과 공명하거든요.', '혹시 관측소에서 이상한 빛을 보면 꼭 알려 주세요. 약속이에요!'], reward: { item: 'seed_starbell', n: 3 } },
      { hearts: 5, lines: ['저, 사실 별을 무서워했어요. 검은 일식 날 밤 하늘이 찢어지는 걸 봤거든요.', '그런데 {name}님이 밭에 별자리를 엮는 걸 보고… 하늘이 다시 다정해 보이기 시작했어요.', '이거, 제가 처음 주운 별 결정이에요. 받아 줄래요?'], reward: { item: 'star_crystal', n: 2 } },
      { hearts: 8, lines: ['오늘은 관측 대신 {name}님 얼굴만 봤네요. …방금 그 말, 못 들은 걸로 해 주세요!', '골짜기가 되살아나면, 그날 밤엔 망원경 말고 {name}님 옆에서 별을 보고 싶어요.'], reward: { item: 'aegis', n: 2 } },
    ],
  },
  {
    id: 'bram',
    name: '브람',
    title: '대장장이',
    look: { skin: '#f0c8a0', hair: '#e8503a', hairShade: '#a8302a', eyes: '#5ad86a', outfit: '#5a4a3a', outfitShade: '#3a2e24', accent: '#e8a03a', pants: '#3a3a4a', hairStyle: 4, accessory: 'headband' },
    loves: ['moonsilver', 'relic', 'pumpkin'],
    likes: ['corn', 'potato', 'copper', 'milk'],
    dislikes: ['starbell', 'moon_rose'],
    services: ['forge'],
    schedule: [
      { from: H(6), at: null },
      { from: H(8), at: { x: 39, y: 9 } },
      { from: H(17), at: { x: 20, y: 18 } },
      { from: H(22), at: null },
    ],
    lines: {
      morning: ['오, 일찍 일어났군! 풀무질은 해 뜨기 전에 시작해야 제맛이지.', '광산에 내려간다고? 검 날 좀 보여 줘. …음, 아직 쓸 만하네.'],
      afternoon: ['광석 가져오면 검을 벼려 주지. 구리면 구리 검, 월은이면 월은 검! 간단하잖아?', '괴물이 공격하기 직전엔 몸이 번쩍이거나 바닥에 붉은 표시가 생겨. 그때 대시로 빠져.'],
      evening: ['하루 일 끝! 광장 분수 소리 들으면서 쉬는 게 최고야.', '대시 직후에 휘두르면 돌진 베기가 나가. 그거 맞으면 아프다고, 진짜로.'],
      night: ['밤에 광산 가는 건 말리진 않겠는데, 새벽 두 시 넘기면 쓰러진다? 진심이야.'],
      rain: ['비 오는 날엔 화로 불이 잘 안 붙어. 그래도 광산 속은 날씨랑 상관없지!'],
      fullMoon: ['보름달 뜬 밤엔 광산 괴물들도 들뜨는지 시끄럽더라.'],
      eclipse: ['일식이라니… 그날 생각나네. 광산 입구가 무너지고 괴물들이 쏟아져 나왔지. 이번엔 우리가 막는다.'],
      festival: ['축제 날엔 망치 내려놓는 거야! 노바 빵 먹었어? 안 먹었으면 손해다!'],
      close: ['너랑 광산 얘기하는 게 요즘 제일 재밌어. 다음엔 나도 데려가라, 망치 하나면 충분해!', '네 검 소리만 들어도 이제 컨디션을 알겠어. 이게 대장장이의 감이라는 거지.'],
      boss: ['비룡을 잡았다고?! 하하! 내가 벼린 검이 해냈구나! …아니, 네가 해낸 거지. 자랑스럽다!'],
    },
    gift: {
      love: '이야, 이거 진짜 귀한 건데! 고맙다, 친구!',
      like: '오, 좋은데? 잘 받을게!',
      neutral: '어, 고마워.',
      dislike: '꽃은… 화로 옆에 두면 금방 시들어서 말이야.',
    },
    events: [
      { hearts: 2, lines: ['야, 잠깐. 너 대시 쓸 때 너무 일찍 눌러.', '적이 번쩍이는 걸 보고, 반 박자 쉬고, 그때 빠지는 거야. 그래야 무적 시간이 공격이랑 딱 겹치지.', '이거 가져가. 광산에서 주운 건데 나보다 네가 잘 쓰겠다.'], reward: { item: 'tonic', n: 3 } },
      { hearts: 5, lines: ['우리 아버지가 이 대장간을 했어. 검은 일식 날, 광산에서 사람들을 대피시키다가…', '…그래서 난 광산 깊은 곳에 내려가는 사람한텐 최고의 검을 쥐여 주고 싶어.', '월은 광석 몇 개 챙겨 놨어. 강화할 때 써.'], reward: { item: 'moonsilver', n: 4 } },
      { hearts: 8, lines: ['너 덕분에 광산 소리가 달라졌어. 예전엔 비명 같았는데 요즘은 그냥… 돌 소리야.', '고맙다는 말, 잘 못하는데. 고맙다. 진짜로.'], reward: { gold: 2000 } },
    ],
  },
  {
    id: 'sol',
    name: '솔',
    title: '잡화점 주인',
    look: { skin: '#ffe6d0', hair: '#a8c8e8', hairShade: '#6a8ab0', eyes: '#3a8ad8', outfit: '#3a8a6a', outfitShade: '#286a4e', accent: '#ffffff', pants: '#4a4a5a', hairStyle: 0, accessory: 'glasses' },
    loves: ['strawberry', 'milk_pink', 'blueberry'],
    likes: ['tomato', 'eggplant', 'egg', 'tonic'],
    dislikes: ['essence'],
    services: ['shop'],
    schedule: [
      { from: H(6), at: null },
      { from: H(9), at: { x: 6, y: 9 } },
      { from: H(18), at: { x: 24, y: 13 } },
      { from: H(21), at: null },
    ],
    lines: {
      morning: ['어서 와. 오늘 들어온 씨앗 목록은 계절마다 바뀌니까 잘 봐 둬.', '천문 작물 씨앗은 비싸지만 그만한 값을 해. 장사꾼으로서 보장하지.'],
      afternoon: ['가마솥은 써 봤어? 수확물이랑 몬스터 정수를 섞으면 꽤 쓸 만한 물약이 나와.', '팔 물건은 집 옆 출하함에 넣어. 밤사이에 내가 수거해서 값을 쳐 줄게.'],
      evening: ['가게 문 닫을 시간이야. 장사는 내일 하자고.', '노을 질 때 딸기 우유 한 잔. 이게 내 사치야.'],
      night: ['이 시간엔 장사 안 해. …그래도 얘기 상대 정도는 해 주지.'],
      rain: ['비 오는 날엔 손님이 적어서 장부 정리하기 좋아. 너도 밭에 물 줄 필요 없겠네?'],
      fullMoon: ['보름달 뜨는 날엔 달빛 장미 모종이 잘 팔려. 너도 하나?'],
      eclipse: ['일식 날엔 태양 밀 시세가 세 배로 뛰지. 장사꾼에겐 축제야, 축제.'],
      festival: ['축제 때는 장사 쉬어. 대신 내 딸기 타르트 대회 출품작을 보라고.'],
      close: ['너한테는 단골 가격 말고 친구 가격으로 줄게. …아, 그게 더 비싸다는 건 아니야.', '처음엔 이 골짜기에 오래 있을 생각 없었는데. 요즘은 네 밭 구경하는 게 낙이야.'],
      boss: ['비룡을 잡았다며? 광산 광석 시세가 벌써 안정되기 시작했어. 덕분에 장부가 예뻐졌다고.'],
    },
    gift: {
      love: '딸기잖아! …큼, 아니 뭐. 고맙게 받을게. 정말로.',
      like: '오, 안목 있네. 고마워.',
      neutral: '고마워. 잘 쓸게.',
      dislike: '정수는 가게에 두면 손님들이 무서워해서…',
    },
    events: [
      { hearts: 2, lines: ['너, 장부 볼 줄 알아? 출하 가격은 품질에 따라 달라져.', '★별빛 등급은 1.5배, ☀일식 등급은 3배. 카시오페이아 룬이랑 일식을 노려 봐.', '이건 단골 선물. 다음에도 잘 부탁해.'], reward: { item: 'seed_moon_rose', n: 2 } },
      { hearts: 5, lines: ['사실 난 연금술사가 되고 싶었어. 근데 재능이 없더라고. 그래서 재료 파는 쪽이 됐지.', '네가 가마솥으로 물약 만드는 걸 보면… 좀 부럽기도 해.', '내가 쓰다 남은 재료야. 너라면 잘 쓰겠지.'], reward: { item: 'essence', n: 8 } },
      { hearts: 8, lines: ['다음 장 볼 때 같이 가자. 바깥 도시에서 좋은 씨앗을 고르는 법, 너한테만 알려 줄게.', '…데이트 신청 아니야. 아마도.'], reward: { item: 'seed_umbral_lotus', n: 1 } },
    ],
  },
  {
    id: 'nova',
    name: '노바',
    title: '빵집 & 축제 담당',
    look: { skin: '#ffe8d8', hair: '#ff8ac8', hairShade: '#d85a9a', eyes: '#3ad8c8', outfit: '#fff0f6', outfitShade: '#f0c8d8', accent: '#ff5a8a', pants: '#ff8ac8', hairStyle: 2, accessory: 'ribbon' },
    loves: ['pumpkin', 'sun_wheat', 'milk_gold', 'egg_gold'],
    likes: ['strawberry', 'milk', 'egg', 'corn', 'carrot'],
    dislikes: ['copper', 'essence'],
    services: ['festival'],
    schedule: [
      { from: H(6), at: null },
      { from: H(7), at: { x: 34, y: 25 } },
      { from: H(16), at: { x: 19, y: 12 } },
      { from: H(21), at: null },
    ],
    lines: {
      morning: ['좋은 아침! 갓 구운 빵 냄새 맡았지? 그건 바로 나의 승리의 향기야!', '{name}! 오늘도 반짝반짝하네! 아, 그거 내가 하려던 대사였는데!'],
      afternoon: ['계절마다 19일 저녁엔 별빛 수확제야! 제일 멋진 작물을 출품하면 상금이 있다구!', '마을이 점점 예뻐지고 있어. {name} 덕분이야. 진짜야!'],
      evening: ['오늘 남은 빵은 내일 아침 할인! …은 없어. 다 내가 먹을 거니까!'],
      night: ['밤에는 내일 반죽을 꿈꾸는 시간이야. 쿨…'],
      rain: ['비 오는 날엔 빵이 촉촉하게 구워져! 우울할 틈이 없다구!'],
      fullMoon: ['보름달이 꼭 커다란 크림빵 같지 않아? 나만 그래?'],
      eclipse: ['일식은 무서워… 그래도 태양 밀을 3배로 거두는 날이라며? 그 밀로 만든 빵, 상상만 해도 행복해!'],
      festival: ['드디어 별빛 수확제! {name}, 출품할 작물 가져왔어? 춤 상대는 정했고?'],
      close: ['{name}이랑 있으면 축제가 매일 열리는 기분이야!', '언젠가 {name} 밭에서 난 밀로 골짜기 제일의 빵을 굽는 게 내 꿈이야.'],
      boss: ['비룡을 물리쳤다고?! 이건 축제야! 아니, 축제를 열어야 해! 지금 당장!'],
    },
    gift: {
      love: '꺄아! 이걸로 뭘 구울지 벌써 다섯 가지 떠올랐어!',
      like: '우와, 고마워! 빵 반죽에 넣어 볼게!',
      neutral: '헤헤, 고마워!',
      dislike: '이건… 반죽에 넣으면 큰일 날 것 같아…',
    },
    events: [
      { hearts: 2, lines: ['{name}, 비밀 하나 알려 줄까? 축제 출품은 값비싼 작물일수록 점수가 높아!', '★별빛이나 ☀일식 등급이면 심사위원(=나)이 감동해 버릴지도?', '응원 선물! 다 먹으면 안 돼!'], reward: { item: 'seed_pumpkin', n: 4 } },
      { hearts: 5, lines: ['축제를 처음 다시 연 건 검은 일식 다음 해였어. 아무도 안 올 줄 알았는데…', '다들 조금씩 나와서, 같이 등불을 올렸어. 그때 알았지. 사람들은 웃을 이유를 기다리고 있었구나.', '그러니까 {name}도, 힘들면 언제든 빵집에 와!'], reward: { item: 'gale', n: 2 } },
      { hearts: 8, lines: ['다음 축제 때… 마지막 춤은 나랑 춰 줄래?', '대답은 축제 날 들을게! 도망가면 안 돼!'], reward: { item: 'egg_gold', n: 3 } },
    ],
  },
];

export function npcDef(id: string): NpcDef {
  const n = NPCS.find((x) => x.id === id);
  if (!n) throw new Error(`알 수 없는 주민: ${id}`);
  return n;
}
