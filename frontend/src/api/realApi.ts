import type { ApiLayer } from "./contracts";
import { request } from "./client";
import type {
  EventCreatePayload,
  EventFeedback,
  EventItem,
  EventStudentLink,
  EventUpdatePayload,
  Organization,
  ReportSummary,
  StaffProfile,
  Student,
  StudentCreatePayload,
  StudentUpdatePayload,
  User,
} from "../types/models";

type StaffRegisterResponse = {
  user_id: number;
  email: string;
  organization_id: number;
  organization_name: string;
  position: string | null;
};

const sanitizeStudentCreate = (payload: StudentCreatePayload): Record<string, unknown> => ({
  full_name: payload.full_name,
  school_class: payload.school_class,
  rating: payload.rating ?? 0,
  contests: payload.contests ?? null,
  olympiads: payload.olympiads ?? null,
});

export const realApi: ApiLayer = {
  auth: {
    login: (payload) =>
      request("/auth/login", {
        method: "POST",
        asForm: true,
        body: {
          username: payload.email,
          password: payload.password,
        },
      }),
    register: async (payload) => {
      await request<StaffRegisterResponse>("/edu/staff/register", {
        method: "POST",
        body: payload,
      });
    },
    me: () => request<User>("/me"),
    staffProfile: () => request<StaffProfile>("/edu/staff/profile"),
    updateProfile: (payload) =>
      request<User>("/me", {
        method: "PUT",
        body: payload,
      }),
  },
  orgs: {
    list: () => request<Organization[]>("/edu/orgs"),
  },
  events: {
    list: () => request<EventItem[]>("/edu/events"),
    create: (payload: EventCreatePayload) =>
      request<EventItem>("/edu/events", {
        method: "POST",
        body: payload,
      }),
    update: (eventId: number, payload: EventUpdatePayload) =>
      request<EventItem>(`/edu/events/${eventId}`, {
        method: "PUT",
        body: payload,
      }),
    remove: (eventId: number) =>
      request(`/edu/events/${eventId}`, {
        method: "DELETE",
      }),
    cancel: (eventId: number) =>
      request<EventItem>(`/edu/events/${eventId}/cancel`, {
        method: "POST",
      }),
    reschedule: (eventId: number, payload: { starts_at: string; ends_at: string }) =>
      request<EventItem>(`/edu/events/${eventId}/reschedule`, {
        method: "POST",
        body: payload,
      }),
    reportSummary: (organizationId?: number | null) =>
      request<ReportSummary>(`/edu/events/report/summary${organizationId ? `?org_id=${organizationId}` : ""}`),
    listStudents: (eventId: number) => request<EventStudentLink[]>(`/edu/events/${eventId}/students`),
    assignStudent: (eventId: number, studentId: number) =>
      request<EventStudentLink>(`/edu/events/${eventId}/students/${studentId}`, {
        method: "POST",
      }),
    removeStudent: (eventId: number, studentId: number) =>
      request(`/edu/events/${eventId}/students/${studentId}`, {
        method: "DELETE",
      }),
    sendFeedback: (eventId: number, payload: { rating?: number; comment?: string }) =>
      request<EventFeedback>(`/edu/events/${eventId}/feedback`, {
        method: "POST",
        body: payload,
      }),
    listFeedback: (eventId: number) => request<EventFeedback[]>(`/edu/events/${eventId}/feedback`),
  },
  students: {
    list: () => request<Student[]>("/edu/students"),
    create: (payload: StudentCreatePayload) => {
      const query = payload.organization_id ? `?organization_id=${payload.organization_id}` : "";
      return request<Student>(`/edu/students${query}`, {
        method: "POST",
        body: sanitizeStudentCreate(payload),
      });
    },
    update: (studentId: number, payload: StudentUpdatePayload) =>
      request<Student>(`/edu/students/${studentId}`, {
        method: "PUT",
        body: payload,
      }),
    remove: (studentId: number) =>
      request(`/edu/students/${studentId}`, {
        method: "DELETE",
      }),
    exportCard: (studentId: number) =>
      request<Blob>(`/edu/students/${studentId}/export`, {
        responseType: "blob",
      }),
    listEvents: (studentId: number) => request<EventItem[]>(`/edu/students/${studentId}/events`),
  },
};
