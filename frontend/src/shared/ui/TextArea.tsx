import type { TextareaHTMLAttributes } from "react";
import clsx from "clsx";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  label: string;
  error?: string;
  className?: string;
  controlClassName?: string;
};

export const TextArea = ({ label, error, className, controlClassName, ...props }: Props) => (
  <label className={clsx("field", className)}>
    <span className="field__label">{label}</span>
    <textarea className={clsx("field__control", "field__control--textarea", error && "field__control--error", controlClassName)} {...props} />
    {error ? <span className="field__error">{error}</span> : null}
  </label>
);
