import type { PropsWithChildren } from "react";
import { useEffect } from "react";

type Props = PropsWithChildren<{
  title: string;
  onClose: () => void;
  width?: "sm" | "md" | "lg";
}>;

export const Modal = ({ title, onClose, width = "md", children }: Props) => {
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  return (
    <div className="modal__backdrop" onMouseDown={onClose}>
      <div className={`modal modal--${width}`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <h3>{title}</h3>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="modal__content">{children}</div>
      </div>
    </div>
  );
};
