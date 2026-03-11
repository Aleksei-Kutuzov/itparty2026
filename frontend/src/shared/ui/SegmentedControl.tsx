import clsx from "clsx";

type Option<T extends string> = {
  label: string;
  value: T;
};

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

export const SegmentedControl = <T extends string>({ options, value, onChange }: Props<T>) => (
  <div className="segmented">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className={clsx("segmented__item", value === option.value && "segmented__item--active")}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);
