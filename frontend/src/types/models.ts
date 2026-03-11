export type EventStatus = "planned" | "cancelled" | "rescheduled" | "completed";

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  patronymic: string | null;
  is_admin: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface StaffProfile {
  user_id: number;
  organization_id: number;
  organization_name: string;
  position: string | null;
  created_at: string;
  is_admin?: boolean;
  message?: string;
}

export interface Organization {
  id: number;
  name: string;
  created_at: string;
}

export interface EventItem {
  id: number;
  title: string;
  description: string | null;
  status: EventStatus;
  starts_at: string;
  ends_at: string;
  organization_id: number | null;
  organization_name: string | null;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: number;
  organization_id: number;
  full_name: string;
  school_class: string;
  rating: number;
  contests: string | null;
  olympiads: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventStudentLink {
  event_id: number;
  student_id: number;
  student_full_name: string;
  school_class: string;
  rating: number;
  created_at: string;
}

export interface EventFeedback {
  id: number;
  event_id: number;
  user_id: number;
  rating: number | null;
  comment: string | null;
  created_at: string;
}

export interface ReportSummary {
  organization_id: number | null;
  total_events: number;
  status_counts: Record<EventStatus, number>;
  total_feedback: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  patronymic?: string | null;
  organization_name: string;
  position?: string | null;
}

export interface EventCreatePayload {
  title: string;
  description?: string | null;
  status?: EventStatus;
  starts_at: string;
  ends_at: string;
  organization_id?: number | null;
}

export interface EventUpdatePayload {
  title?: string;
  description?: string | null;
  status?: EventStatus;
  starts_at?: string;
  ends_at?: string;
  organization_id?: number | null;
}

export interface StudentCreatePayload {
  full_name: string;
  school_class: string;
  rating?: number;
  contests?: string | null;
  olympiads?: string | null;
  organization_id?: number;
}

export interface StudentUpdatePayload {
  full_name?: string;
  school_class?: string;
  rating?: number;
  contests?: string | null;
  olympiads?: string | null;
}
