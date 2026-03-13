import type {
  EventCreatePayload,
  EventItem,
  EventScheduleMode,
  EventType,
  EventUpdatePayload,
  RoadmapDirection,
  TargetRangeKind,
  User,
} from "../../types/models";
import { formatInputDateTime, fromInputDateTime } from "./date";
import { buildSchedulePayload, formatUserName, inferAcademicYear, ROADMAP_OPTIONS } from "./roadmap";

export type EventEditorForm = {
  organization_id: string;
  title: string;
  event_type: EventType;
  roadmap_direction: RoadmapDirection;
  academic_year: string;
  schedule_mode: EventScheduleMode;
  is_all_organizations: boolean;
  target_class_names: string[];
  target_range_kind: TargetRangeKind;
  target_range_start: string;
  target_range_end: string;
  target_audience: string;
  organizer: string;
  event_level: string;
  event_format: string;
  participants_count: string;
  description: string;
  notes: string;
  responsible_user_ids: number[];
  starts_at: string;
  ends_at: string;
};

export const getDefaultEventForm = (organizationId?: number | null): EventEditorForm => {
  const start = new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    organization_id: organizationId ? String(organizationId) : "",
    title: "",
    event_type: ROADMAP_OPTIONS[0].value,
    roadmap_direction: ROADMAP_OPTIONS[0].value,
    academic_year: inferAcademicYear(start.toISOString()),
    schedule_mode: "range",
    is_all_organizations: false,
    target_class_names: [],
    target_range_kind: "class",
    target_range_start: "1",
    target_range_end: "11",
    target_audience: "",
    organizer: "",
    event_level: "",
    event_format: "",
    participants_count: "",
    description: "",
    notes: "",
    responsible_user_ids: [],
    starts_at: formatInputDateTime(start.toISOString()),
    ends_at: formatInputDateTime(end.toISOString()),
  };
};

const EVENT_TYPE_SET = new Set(ROADMAP_OPTIONS.map((option) => option.value));

export const getEventFormFromItem = (event: EventItem): EventEditorForm => {
  const normalizedEventType = EVENT_TYPE_SET.has(event.event_type as EventType)
    ? (event.event_type as EventType)
    : event.roadmap_direction;

  return {
    organization_id: String(event.organization_id),
    title: event.title,
    event_type: normalizedEventType,
    roadmap_direction: event.roadmap_direction,
    academic_year: event.academic_year || inferAcademicYear(event.starts_at),
    schedule_mode: event.schedule_mode,
    is_all_organizations: event.is_all_organizations,
    target_class_names: event.target_class_names,
    target_range_kind: event.target_range_kind ?? "class",
    target_range_start: event.target_range_start ? String(event.target_range_start) : "",
    target_range_end: event.target_range_end ? String(event.target_range_end) : "",
    target_audience: event.target_audience ?? "",
    organizer: event.organizer ?? "",
    event_level: event.event_level ?? "",
    event_format: event.event_format ?? "",
    participants_count: event.participants_count ? String(event.participants_count) : "",
    description: event.description ?? "",
    notes: event.notes ?? "",
    responsible_user_ids: event.responsible_user_ids,
    starts_at: formatInputDateTime(event.starts_at),
    ends_at: formatInputDateTime(event.ends_at),
  };
};

export const buildEventPayload = (form: EventEditorForm): EventCreatePayload | EventUpdatePayload => {
  const timing = buildSchedulePayload(
    form.schedule_mode,
    form.academic_year.trim() || inferAcademicYear(),
    fromInputDateTime(form.starts_at),
    fromInputDateTime(form.ends_at),
  );

  const isGlobal = form.is_all_organizations;
  const targetRangeStart = form.target_range_start.trim() ? Number(form.target_range_start) : null;
  const targetRangeEnd = form.target_range_end.trim() ? Number(form.target_range_end) : null;

  return {
    title: form.title.trim(),
    event_type: form.event_type,
    roadmap_direction: form.roadmap_direction,
    academic_year: form.academic_year.trim() || null,
    schedule_mode: form.schedule_mode,
    is_all_organizations: isGlobal,
    ...(isGlobal
      ? {
          target_range_kind: form.target_range_kind,
          target_range_start: targetRangeStart,
          target_range_end: targetRangeEnd,
        }
      : {
          target_class_names: form.target_class_names,
          target_class_name: form.target_class_names[0] ?? null,
          target_audience: form.target_audience.trim() || null,
        }),
    organizer: form.organizer.trim() || null,
    event_level: form.event_level.trim() || null,
    event_format: form.event_format.trim() || null,
    participants_count: form.participants_count.trim() ? Number(form.participants_count) : null,
    description: form.description.trim() || null,
    notes: form.notes.trim() || null,
    responsible_user_ids: form.responsible_user_ids,
    starts_at: timing.starts_at,
    ends_at: timing.ends_at,
    schedule_dates: timing.schedule_dates,
    organization_id: form.organization_id ? Number(form.organization_id) : undefined,
  };
};

export const formatResponsibleOption = (user: User): string => {
  const parts = [formatUserName(user)];
  if (user.role === "admin") {
    parts.push("Администратор");
  } else if (user.organization_name) {
    parts.push(user.organization_name);
  }
  return parts.filter(Boolean).join(" • ");
};
