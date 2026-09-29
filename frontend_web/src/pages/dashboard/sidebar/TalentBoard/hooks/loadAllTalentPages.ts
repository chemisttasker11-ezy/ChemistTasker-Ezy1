type TalentPage<T> = T[] | { count?: number; results?: T[] };

// The board filters candidates in the browser, so every API page must be loaded.
export async function loadAllTalentPages<T>(fetchPage: (page: number) => Promise<TalentPage<T>>): Promise<T[]> {
  const first = await fetchPage(1);
  if (Array.isArray(first)) return first;
  const rows = Array.isArray(first?.results) ? [...first.results] : [];
  if (!rows.length) return rows;
  const count = Number(first.count ?? rows.length);
  const pageCount = Math.ceil(count / rows.length);
  for (let start = 2; start <= pageCount; start += 4) {
    const pages = await Promise.all(
      Array.from({ length: Math.min(4, pageCount - start + 1) }, (_, index) => fetchPage(start + index))
    );
    for (const page of pages) rows.push(...(Array.isArray(page) ? page : page.results ?? []));
  }
  return rows;
}
