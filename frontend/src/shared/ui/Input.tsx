import type { InputHTMLAttributes } from "react";
import clsx from "clsx";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  error?: string;
  className?: string;
  controlClassName?: string;
};

export const Input = ({ label, error, className, controlClassName, ...props }: Props) => (
  <label className={clsx("field", className)}>
    <span className="field__label">{label}</span>
    <input className={clsx("field__control", error && "field__control--error", controlClassName)} {...props} />
    {error ? <span className="field__error">{error}</span> : null}
  </label>
);
