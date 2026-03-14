import { useEffect, useMemo, useState } from "react";

export const usePagination = <T,>(items: T[], pageSize: number, resetDeps: readonly unknown[] = []) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, resetDeps);

  useEffect(() => {
    setPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const startIndex = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, items.length);

  return {
    page,
    setPage,
    pageItems,
    pageSize,
    totalItems: items.length,
    totalPages,
    startIndex,
    endIndex,
  };
};
