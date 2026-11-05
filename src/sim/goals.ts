import { GOALS, type GoalId } from '../data/goals';
import type { GameState } from './state';

/** 목표를 달성 처리한다. 새로 달성했으면 true. */
export function completeGoal(s: GameState, id: GoalId): boolean {
  if (s.goals[id]) return false;
  s.goals[id] = true;
  return true;
}

export function goalsDone(s: GameState): number {
  return GOALS.filter((g) => s.goals[g.id]).length;
}

/** 마을 등급 0~5: 목표 둘마다 한 등급 */
export function villageRank(s: GameState): number {
  return Math.min(5, Math.floor(goalsDone(s) / 2));
}
