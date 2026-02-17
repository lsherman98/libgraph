export function groupByPage<T>(
    items: T[],
    getPageNumber: (item: T) => number | undefined | null,
): { pageNumber: number; items: T[] }[] {
    const grouped = new Map<number, T[]>();

    for (const item of items) {
        const pageNum = getPageNumber(item) ?? 0;
        const existing = grouped.get(pageNum);
        if (existing) {
            existing.push(item);
        } else {
            grouped.set(pageNum, [item]);
        }
    }

    return Array.from(grouped.entries())
        .sort(([a], [b]) => a - b)
        .map(([pageNumber, items]) => ({ pageNumber, items }));
}
