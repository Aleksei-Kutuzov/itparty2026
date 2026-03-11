const locale = "ru-RU";

export const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export const formatDate = (value: string): string =>
  new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));

export const formatInputDateTime = (value: string): string => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

export const fromInputDateTime = (value: string): string => new Date(value).toISOString();

export const isSameDay = (left: string, right: Date): boolean => {
  const date = new Date(left);
  return (
    date.getFullYear() === right.getFullYear() &&
    date.getMonth() === right.getMonth() &&
    date.getDate() === right.getDate()
  );
};

export const startOfMonthGrid = (source: Date): Date => {
  const first = new Date(source.getFullYear(), source.getMonth(), 1);
  const weekday = (first.getDay() + 6) % 7;
  return new Date(source.getFullYear(), source.getMonth(), 1 - weekday);
};

export const addDays = (source: Date, days: number): Date =>
  new Date(source.getFullYear(), source.getMonth(), source.getDate() + days);

export const monthTitle = (source: Date): string =>
  source.toLocaleDateString(locale, { month: "long", year: "numeric" });
