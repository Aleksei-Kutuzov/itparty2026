import type { EventItem, EventScheduleMode, RoadmapDirection, User } from "../../types/models";
import { formatDate } from "./date";

export const ROADMAP_OPTIONS: Array<{ value: RoadmapDirection; label: string }> = [
  { value: "Профессиональное просвещение", label: "Профессиональное просвещение" },
  { value: "Практико-ориентированное направление", label: "Практико-ориентированное направление" },
  { value: "Диагностическое направление", label: "Диагностическое направление" },
  { value: "Работа с родителями", label: "Работа с родителями" },
  { value: "Информационное направление", label: "Информационное направление" },
];

export const SCHEDULE_MODE_OPTIONS: Array<{ value: EventScheduleMode; label: string }> = [
  { value: "range", label: "Диапазон дат" },
  { value: "quarterly", label: "Ежеквартально" },
  { value: "whole_year", label: "В течение года" },
];

export const inferAcademicYear = (iso?: string): string => {
  const date = iso ? new Date(iso) : new Date();
  const startYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
};

export const inferRoadmapYear = (iso?: string): number => Number(inferAcademicYear(iso).split("/")[0]);

export const roadmapYearToAcademicYear = (roadmapYear: number): string => `${roadmapYear}/${roadmapYear + 1}`;

export const getRoadmapYearOptions = (selectedYear?: number): Array<{ value: string; label: string }> => {
  const currentYear = inferRoadmapYear();
  const years = new Set<number>();
  for (let year = currentYear - 1; year <= currentYear + 4; year += 1) {
    years.add(year);
  }
  if (selectedYear) {
    years.add(selectedYear);
  }
  return Array.from(years)
    .sort((left, right) => left - right)
    .map((year) => ({ value: String(year), label: String(year) }));
};

export const getAcademicYearBounds = (academicYear: string): { start: Date; end: Date } => {
  const [startYearRaw, endYearRaw] = academicYear.split("/");
  const startYear = Number(startYearRaw);
  const endYear = Number(endYearRaw);

  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) {
    const fallbackYear = inferAcademicYear();
    return getAcademicYearBounds(fallbackYear);
  }

  return {
    start: new Date(Date.UTC(startYear, 8, 1, 0, 0, 0)),
    end: new Date(Date.UTC(endYear, 7, 31, 23, 59, 59)),
  };
};

export const buildSchedulePayload = (
  scheduleMode: EventScheduleMode,
  academicYear: string,
  startsAt?: string,
  endsAt?: string,
) => {
  if (scheduleMode === "range") {
    return {
      starts_at: startsAt ?? new Date().toISOString(),
      ends_at: endsAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      schedule_dates: [] as Array<{ starts_at: string; ends_at?: string | null }>,
    };
  }

  const { start, end } = getAcademicYearBounds(academicYear);
  return {
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    schedule_dates: [] as Array<{ starts_at: string; ends_at?: string | null }>,
  };
};

export const formatUserName = (user: Pick<User, "last_name" | "first_name" | "patronymic">): string =>
  [user.last_name, user.first_name, user.patronymic].filter(Boolean).join(" ");

export const getEventAudienceLabel = (event: Pick<EventItem, "target_audience" | "target_class_names" | "target_class_name">): string =>
  event.target_audience || event.target_class_names.join(", ") || event.target_class_name || "-";

export const getEventExecutionLabel = (event: Pick<EventItem, "schedule_mode" | "starts_at" | "ends_at">): string => {
  if (event.schedule_mode === "quarterly") {
    return "Ежеквартально";
  }
  if (event.schedule_mode === "whole_year") {
    return "В течение года";
  }
  return `${formatDate(event.starts_at)} - ${formatDate(event.ends_at)}`;
};

export const matchesUserSearch = (user: User, query: string): boolean => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return formatUserName(user).toLowerCase().includes(normalizedQuery);
};
