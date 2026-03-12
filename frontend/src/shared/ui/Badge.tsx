import clsx from "clsx";

export const StatusBadge = ({ status }: { status: string }) => (
  <span className={clsx("badge", `badge--${status}`)}>{status}</span>
);
