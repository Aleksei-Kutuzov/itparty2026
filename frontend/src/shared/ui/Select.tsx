import type { SelectHTMLAttributes } from "react";
import clsx from "clsx";

type Option = {
  value: string;
  label: string;
};

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  label: string;
  options: Option[];
  error?: string;
  className?: string;
  controlClassName?: string;
};

export const Select = ({ label, options, error, className, controlClassName, ...props }: Props) => (
  <label className={clsx("field", className)}>
    <span className="field__label">{label}</span>
    <select className={clsx("field__control", error && "field__control--error", controlClassName)} {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    {error ? <span className="field__error">{error}</span> : null}
  </label>
);
