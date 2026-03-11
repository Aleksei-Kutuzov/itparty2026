import clsx from "clsx";
import type { EventStatus } from "../../types/models";

const labels: Record<EventStatus, string> = {
  planned: "Запланировано",
  cancelled: "Отменено",
  rescheduled: "Перенесено",
  completed: "Завершено",
};

export const StatusBadge = ({ status }: { status: EventStatus }) => (
  <span className={clsx("badge", `badge--${status}`)}>{labels[status]}</span>
);
