/**
 * 성경 데이터 기초 인터페이스 (Mock / 오픈소스 JSON 확장용)
 */

/** 성경 책(권) 메타정보 */
export interface BibleBook {
  id: string;
  name: string;
  nameKo: string;
  testament: 'old' | 'new';
  chapterCount: number;
  /** 장별 절 개수 [장 인덱스] = 절 수 */
  versesPerChapter?: number[];
}

/** 성경 장/절 위치 */
export interface BibleReference {
  book: string;
  bookId?: string;
  chapter: number;
  verse?: number;
}

/** 읽기 구간 (시작 ~ 끝) */
export interface ReadingRange {
  start: BibleReference;
  end: BibleReference;
}

/** 오픈소스 JSON 구조 예: { bookId, chapters: { [chapter]: { [verse]: text } } } */
export interface BibleVersePayload {
  bookId: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleChapterPayload {
  bookId: string;
  chapter: number;
  verses: Record<number, string>;
}
