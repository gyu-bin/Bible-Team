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
}
