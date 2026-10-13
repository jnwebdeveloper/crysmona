export function moveRecord<T extends { id: number }>(
  rows: T[],
  from: number,
  to: number,
): T[] {
  const next = [...rows],
    start = next.findIndex((row) => row.id === from),
    end = next.findIndex((row) => row.id === to);
  if (start < 0 || end < 0 || start === end) return next;
  next.splice(end, 0, next.splice(start, 1)[0]);
  return next;
}
export function validOrder(ids: unknown): ids is number[] {
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= 10000 &&
    ids.every((id) => Number.isSafeInteger(id) && id > 0) &&
    new Set(ids).size === ids.length
  );
}
export function listRecords(
  rows: any[],
  query: string,
  field: string,
  value: string,
  sort: string,
  direction: string,
) {
  return rows
    .filter(
      (row) =>
        JSON.stringify(row).toLowerCase().includes(query.toLowerCase()) &&
        (!field || value === "" || String(row[field] ?? "") === value),
    )
    .sort((a, b) => {
      const x = a[sort] ?? "",
        y = b[sort] ?? "";
      const result =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true });
      return (direction === "desc" ? -result : result) || a.id - b.id;
    });
}
