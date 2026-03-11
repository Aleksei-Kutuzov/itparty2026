import clsx from "clsx";

type Props = {
  tone: "info" | "error" | "success";
  text: string;
};

export const Notice = ({ tone, text }: Props) => <div className={clsx("notice", `notice--${tone}`)}>{text}</div>;
