/** 성경 책 순서 및 장 수 (읽기 진척 계산용) */
export const BIBLE_BOOKS: { id: string; nameKo: string; chapters: number }[] = [
  { id: 'gen', nameKo: '창세기', chapters: 50 },
  { id: 'exo', nameKo: '출애굽기', chapters: 40 },
  { id: 'lev', nameKo: '레위기', chapters: 27 },
  { id: 'num', nameKo: '민수기', chapters: 36 },
  { id: 'deu', nameKo: '신명기', chapters: 34 },
  { id: 'jos', nameKo: '여호수아', chapters: 24 },
  { id: 'jdg', nameKo: '사사기', chapters: 21 },
  { id: 'rut', nameKo: '룻기', chapters: 4 },
  { id: '1sa', nameKo: '사무엘상', chapters: 31 },
  { id: '2sa', nameKo: '사무엘하', chapters: 24 },
  { id: '1ki', nameKo: '열왕기상', chapters: 22 },
  { id: '2ki', nameKo: '열왕기하', chapters: 25 },
  { id: '1ch', nameKo: '역대상', chapters: 29 },
  { id: '2ch', nameKo: '역대하', chapters: 36 },
  { id: 'ezr', nameKo: '에스라', chapters: 10 },
  { id: 'neh', nameKo: '느헤미야', chapters: 13 },
  { id: 'est', nameKo: '에스더', chapters: 10 },
  { id: 'job', nameKo: '욥기', chapters: 42 },
  { id: 'psa', nameKo: '시편', chapters: 150 },
  { id: 'pro', nameKo: '잠언', chapters: 31 },
  { id: 'ecc', nameKo: '전도서', chapters: 12 },
  { id: 'sng', nameKo: '아가', chapters: 8 },
  { id: 'isa', nameKo: '이사야', chapters: 66 },
  { id: 'jer', nameKo: '예레미야', chapters: 52 },
  { id: 'lam', nameKo: '예레미야애가', chapters: 5 },
  { id: 'ezk', nameKo: '에스겔', chapters: 48 },
  { id: 'dan', nameKo: '다니엘', chapters: 12 },
  { id: 'hos', nameKo: '호세아', chapters: 14 },
  { id: 'jol', nameKo: '요엘', chapters: 3 },
  { id: 'amo', nameKo: '아모스', chapters: 9 },
  { id: 'oba', nameKo: '오바댜', chapters: 1 },
  { id: 'jon', nameKo: '요나', chapters: 4 },
  { id: 'mic', nameKo: '미가', chapters: 7 },
  { id: 'nah', nameKo: '나훔', chapters: 3 },
  { id: 'hab', nameKo: '하박국', chapters: 3 },
  { id: 'zep', nameKo: '스바냐', chapters: 3 },
  { id: 'hag', nameKo: '학개', chapters: 2 },
  { id: 'zec', nameKo: '스가랴', chapters: 14 },
  { id: 'mal', nameKo: '말라기', chapters: 4 },
  { id: 'mat', nameKo: '마태복음', chapters: 28 },
  { id: 'mar', nameKo: '마가복음', chapters: 16 },
  { id: 'luk', nameKo: '누가복음', chapters: 24 },
  { id: 'joh', nameKo: '요한복음', chapters: 21 },
  { id: 'act', nameKo: '사도행전', chapters: 28 },
  { id: 'rom', nameKo: '로마서', chapters: 16 },
  { id: '1co', nameKo: '고린도전서', chapters: 16 },
  { id: '2co', nameKo: '고린도후서', chapters: 13 },
  { id: 'gal', nameKo: '갈라디아서', chapters: 6 },
  { id: 'eph', nameKo: '에베소서', chapters: 6 },
  { id: 'php', nameKo: '빌립보서', chapters: 4 },
  { id: 'col', nameKo: '골로새서', chapters: 4 },
  { id: '1th', nameKo: '데살로니가전서', chapters: 5 },
  { id: '2th', nameKo: '데살로니가후서', chapters: 3 },
  { id: '1ti', nameKo: '디모데전서', chapters: 6 },
  { id: '2ti', nameKo: '디모데후서', chapters: 4 },
  { id: 'tit', nameKo: '디도서', chapters: 3 },
  { id: 'phm', nameKo: '빌레몬서', chapters: 1 },
  { id: 'heb', nameKo: '히브리서', chapters: 13 },
  { id: 'jas', nameKo: '야고보서', chapters: 5 },
  { id: '1pe', nameKo: '베드로전서', chapters: 5 },
  { id: '2pe', nameKo: '베드로후서', chapters: 3 },
  { id: '1jn', nameKo: '요한일서', chapters: 5 },
  { id: '2jn', nameKo: '요한이서', chapters: 1 },
  { id: '3jn', nameKo: '요한삼서', chapters: 1 },
  { id: 'jud', nameKo: '유다서', chapters: 1 },
  { id: 'rev', nameKo: '요한계시록', chapters: 22 },
];

/** 구약 (창세기 ~ 말라기) */
export const OLD_TESTAMENT_BOOKS = BIBLE_BOOKS.slice(0, 39);
/** 신약 (마태복음 ~ 요한계시록) */
export const NEW_TESTAMENT_BOOKS = BIBLE_BOOKS.slice(39);

export function findBookByName(nameKo: string): { id: string; nameKo: string; chapters: number } | undefined {
  return BIBLE_BOOKS.find((b) => b.nameKo === nameKo || b.id === nameKo);
}

export function getBooksFrom(startBookName: string, count: number): { book: string; fromChapter: number; toChapter: number }[] {
  const idx = BIBLE_BOOKS.findIndex((b) => b.nameKo === startBookName || b.id === startBookName);
  if (idx < 0) return [];
  const result: { book: string; fromChapter: number; toChapter: number }[] = [];
  let remaining = count;
  for (let i = idx; i < BIBLE_BOOKS.length && remaining > 0; i++) {
    const b = BIBLE_BOOKS[i];
    const take = Math.min(remaining, b.chapters);
    result.push({ book: b.nameKo, fromChapter: 1, toChapter: take });
    remaining -= take;
  }
  return result;
}

/** 모임 기준 1일차 날짜 (starts_at 있으면 그날, 없으면 created_at) */
export function getGroupStartDate(group: { starts_at?: string | null; created_at: string }): string {
  return group.starts_at ?? group.created_at;
}

/** 오늘이 모임 기준 몇 일차인지 (0-based). 미래면 -1 */
export function getDayIndex(startDate: string): number {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start.getTime() > today.getTime()) return -1;
  const diff = Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}

/** 모임의 "오늘 읽는 구절" 라벨 (나눔 글 저장용). 일차가 유효할 때만 반환 */
export function getPassageLabelForGroup(group: {
  start_book: string;
  pages_per_day: number;
  starts_at?: string | null;
  created_at: string;
}): { dayIndex: number; passageLabel: string } | null {
  const startDate = getGroupStartDate(group);
  const dayIndex = getDayIndex(startDate);
  if (dayIndex < 0) return null;
  const chapters = getTodayChapters(group.start_book, group.pages_per_day, dayIndex);
  if (chapters.length === 0) return { dayIndex, passageLabel: '' };
  const passageLabel = chapters
    .map((r) => (r.fromChapter === r.toChapter ? `${r.book} ${r.fromChapter}장` : `${r.book} ${r.fromChapter}~${r.toChapter}장`))
    .join(', ');
  return { dayIndex, passageLabel };
}

/** N일차(0-based)일 때 오늘 읽을 구간. 1일차 = dayIndex 0 → start_book 1~pages_per_day장 */
export function getTodayChapters(
  startBookName: string,
  pagesPerDay: number,
  dayIndex: number
): { book: string; fromChapter: number; toChapter: number }[] {
  const idx = BIBLE_BOOKS.findIndex((b) => b.nameKo === startBookName || b.id === startBookName);
  if (idx < 0 || pagesPerDay < 1) return [];
  const startOffset = dayIndex * pagesPerDay;
  let offset = 0;
  let curBookIdx = idx;
  let curChapter = 1;
  while (curBookIdx < BIBLE_BOOKS.length && offset + BIBLE_BOOKS[curBookIdx].chapters <= startOffset) {
    offset += BIBLE_BOOKS[curBookIdx].chapters;
    curBookIdx++;
    curChapter = 1;
  }
  if (curBookIdx >= BIBLE_BOOKS.length) return [];
  curChapter = startOffset - offset + 1;
  const result: { book: string; fromChapter: number; toChapter: number }[] = [];
  let remaining = pagesPerDay;
  while (remaining > 0 && curBookIdx < BIBLE_BOOKS.length) {
    const b = BIBLE_BOOKS[curBookIdx];
    const fromCh = curChapter;
    const toCh = Math.min(curChapter + remaining - 1, b.chapters);
    result.push({ book: b.nameKo, fromChapter: fromCh, toChapter: toCh });
    remaining -= toCh - fromCh + 1;
    if (toCh >= b.chapters) {
      curBookIdx++;
      curChapter = 1;
    } else {
      curChapter = toCh + 1;
    }
  }
  return result;
}
