import { Button } from "./Button";

type Props = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
};

export const Pagination = ({ page, totalPages, totalItems, pageSize, itemLabel, onPageChange }: Props) => {
  if (totalItems === 0 || totalPages <= 1) {
    return null;
  }

  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, totalItems);

  return (
    <div className="pagination">
      <p className="pagination__summary">
        Показаны {startIndex}-{endIndex} из {totalItems} {itemLabel}
      </p>
      <div className="pagination__controls">
        <Button size="sm" variant="secondary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Назад
        </Button>
        <span className="pagination__status">
          Страница {page} из {totalPages}
        </span>
        <Button size="sm" variant="secondary" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Вперед
        </Button>
      </div>
    </div>
  );
};
