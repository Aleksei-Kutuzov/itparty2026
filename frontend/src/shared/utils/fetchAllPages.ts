const DEFAULT_PAGE_SIZE = 200;

type PagingParams = {
  offset: number;
  limit: number;
};

export const fetchAllPages = async <T>(
  loader: (params: PagingParams) => Promise<T[]>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> => {
  const items: T[] = [];
  let offset = 0;

  while (true) {
    const page = await loader({ offset, limit: pageSize });
    items.push(...page);

    if (page.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return items;
};
