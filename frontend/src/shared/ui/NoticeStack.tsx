import { Children, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export const NoticeStack = ({ children }: Props) => {
  const notices = Children.toArray(children).filter(Boolean);

  if (notices.length === 0) {
    return null;
  }

  return (
    <div className="notice-stack" aria-live="polite" aria-atomic="true">
      {notices}
    </div>
  );
};
