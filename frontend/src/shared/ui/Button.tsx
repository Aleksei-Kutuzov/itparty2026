import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    fullWidth?: boolean;
  }
>;

export const Button = ({ variant = "primary", size = "md", fullWidth = false, className, children, ...props }: ButtonProps) => (
  <button
    className={clsx("btn", `btn--${variant}`, `btn--${size}`, fullWidth && "btn--full", className)}
    {...props}
  >
    {children}
  </button>
);
