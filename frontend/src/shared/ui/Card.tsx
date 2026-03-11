import type { PropsWithChildren, ReactNode } from "react";
import clsx from "clsx";

type Props = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  className?: string;
  actions?: ReactNode;
}>;

export const Card = ({ title, subtitle, className, actions, children }: Props) => (
  <section className={clsx("card", className)}>
    {(title || subtitle || actions) && (
      <header className="card__header">
        <div>
          {title ? <h3 className="card__title">{title}</h3> : null}
          {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="card__actions">{actions}</div> : null}
      </header>
    )}
    <div className="card__content">{children}</div>
  </section>
);
