import { Button } from "./Button";

type Props = {
  state: "loading" | "empty" | "error" | "success";
  title: string;
  description?: string;
  onRetry?: () => void;
};

export const StatusView = ({ state, title, description, onRetry }: Props) => (
  <div className={`status-view status-view--${state}`}>
    <div className="status-view__icon" aria-hidden>
      {state === "loading" ? "..." : null}
      {state === "empty" ? "0" : null}
      {state === "error" ? "!" : null}
      {state === "success" ? "+" : null}
    </div>
    <h4>{title}</h4>
    {description ? <p>{description}</p> : null}
    {state === "error" && onRetry ? (
      <Button variant="secondary" onClick={onRetry}>
        Повторить
      </Button>
    ) : null}
  </div>
);
