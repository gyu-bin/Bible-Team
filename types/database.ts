export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      reading_groups: {
        Row: {
          id: string;
          title: string;
          leader_id: string;
          start_book: string;
          pages_per_day: number;
          duration_days: number;
          invite_code: string;
          description?: string | null;
          created_at: string;
          updated_at: string;
          /** 선택. 이 날부터 모임이 열림. 없으면 created_at 기준 */
          starts_at?: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          leader_id: string;
          start_book: string;
          pages_per_day: number;
          duration_days: number;
          invite_code: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
          starts_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['reading_groups']['Insert']>;
      };
      profiles: {
        Row: {
          user_id: string;
          nickname: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          nickname?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: Partial<Database['public']['Tables']['group_members']['Insert']>;
      };
      reading_logs: {
        Row: {
          id: string;
          user_id: string;
          group_id: string;
          book: string;
          chapter: number;
          is_completed: boolean;
          logged_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          group_id: string;
          book: string;
          chapter: number;
          is_completed?: boolean;
          logged_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reading_logs']['Insert']>;
      };
    };
  };
}

export type ReadingGroupRow = Database['public']['Tables']['reading_groups']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type GroupMemberRow = Database['public']['Tables']['group_members']['Row'];
export type ReadingLogRow = Database['public']['Tables']['reading_logs']['Row'];
