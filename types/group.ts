import type { ReadingGroupRow, GroupMemberRow } from './database';

export type { ReadingGroupRow, GroupMemberRow };

export interface ReadingGroupWithLeader extends ReadingGroupRow {
  leader?: { id: string; email?: string };
}

export interface CreateGroupInput {
  title: string;
  leaderId: string;
  startBook: string;
  pagesPerDay: number;
  durationDays: number;
  /** 선택. 이 날부터 모임이 열림. ISO 날짜(YYYY-MM-DD). 없으면 오늘 기준 */
  startsAt?: string | null;
}
