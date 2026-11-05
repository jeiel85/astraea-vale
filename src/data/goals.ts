export type GoalId =
  | 'till' | 'ship' | 'observatory' | 'weave' | 'mine1'
  | 'fertilizer' | 'mutation' | 'matriarch' | 'festival' | 'wyrm';

export interface GoalDef {
  id: GoalId;
  name: string;
  hint: string;
}

/** 마을 재건 목표. 둘을 이룰 때마다 마을 등급이 오르고 광장이 꾸며진다. */
export const GOALS: readonly GoalDef[] = [
  { id: 'till', name: '첫 씨앗', hint: '괭이로 밭을 갈고 씨앗을 심는다.' },
  { id: 'ship', name: '첫 출하', hint: '수확물을 집 옆 출하함에 넣고 하루를 마친다.' },
  { id: 'observatory', name: '별의 예보', hint: '농장 북쪽 관측소에서 밤하늘 예보를 본다.' },
  { id: 'weave', name: '별자리 엮기', hint: '맑은 밤, 별빛 지팡이로 밭 위에 별자리 룬을 엮는다.' },
  { id: 'mine1', name: '광산 정화', hint: '남동쪽 광산 1층의 괴물을 모두 물리친다.' },
  { id: 'fertilizer', name: '정수의 순환', hint: '몬스터 정수로 정수 비료를 만들어 쓴다.' },
  { id: 'mutation', name: '별빛 혈통', hint: '교배로 변종 가축을 탄생시킨다.' },
  { id: 'matriarch', name: '수정 동굴의 수호자', hint: '광산 5층의 정동석 여왕을 쓰러뜨린다.' },
  { id: 'festival', name: '별빛 수확제', hint: '계절 19일 저녁 광장 축제에 작물을 출품한다.' },
  { id: 'wyrm', name: '검은 일식의 끝', hint: '광산 10층 일식의 비룡을 쓰러뜨린다.' },
];

export const VILLAGE_RANK_NAMES = ['폐허', '새싹', '등불', '깃발', '별가루', '별빛 골짜기'] as const;
