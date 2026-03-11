import type {
  EventCreatePayload,
  EventFeedback,
  EventItem,
  EventStudentLink,
  EventUpdatePayload,
  LoginPayload,
  Organization,
  RegisterPayload,
  ReportSummary,
  StaffProfile,
  Student,
  StudentCreatePayload,
  StudentUpdatePayload,
  User,
} from "../types/models";

export interface LoginResult {
  access_token: string;
  token_type: string;
}

export interface ApiLayer {
  auth: {
    login: (payload: LoginPayload) => Promise<LoginResult>;
    register: (payload: RegisterPayload) => Promise<void>;
    me: () => Promise<User>;
    staffProfile: () => Promise<StaffProfile>;
    updateProfile: (payload: Partial<Pick<User, "first_name" | "last_name" | "patronymic">>) => Promise<User>;
  };
  orgs: {
    list: () => Promise<Organization[]>;
  };
  events: {
    list: () => Promise<EventItem[]>;
    create: (payload: EventCreatePayload) => Promise<EventItem>;
    update: (eventId: number, payload: EventUpdatePayload) => Promise<EventItem>;
    remove: (eventId: number) => Promise<void>;
    cancel: (eventId: number) => Promise<EventItem>;
    reschedule: (eventId: number, payload: { starts_at: string; ends_at: string }) => Promise<EventItem>;
    reportSummary: (organizationId?: number | null) => Promise<ReportSummary>;
    listStudents: (eventId: number) => Promise<EventStudentLink[]>;
    assignStudent: (eventId: number, studentId: number) => Promise<EventStudentLink>;
    removeStudent: (eventId: number, studentId: number) => Promise<void>;
    sendFeedback: (eventId: number, payload: { rating?: number; comment?: string }) => Promise<EventFeedback>;
    listFeedback: (eventId: number) => Promise<EventFeedback[]>;
  };
  students: {
    list: () => Promise<Student[]>;
    create: (payload: StudentCreatePayload) => Promise<Student>;
    update: (studentId: number, payload: StudentUpdatePayload) => Promise<Student>;
    remove: (studentId: number) => Promise<void>;
    exportCard: (studentId: number) => Promise<Blob>;
    listEvents: (studentId: number) => Promise<EventItem[]>;
  };
}
