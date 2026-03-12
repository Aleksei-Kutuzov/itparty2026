import type { ApiLayer } from "./contracts";
import { request } from "./client";
import type {
  ClassProfile,
  EventCreatePayload,
  EventItem,
  EventUpdatePayload,
  Organization,
  Participation,
  ParticipationCreatePayload,
  ParticipationUpdatePayload,
  PendingCuratorRegistration,
  PendingOrganizationRegistration,
  Student,
  StudentAdditionalEducation,
  StudentCreatePayload,
  StudentFirstProfession,
  StudentResearchWork,
  User,
} from "../types/models";

const withQuery = (path: string, params: Record<string, string | number | undefined | null>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
};

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
    registerOrganization: async (payload) => {
      await request("/auth/register/organization", {
        method: "POST",
        body: payload,
      });
    },
    registerCurator: async (payload) => {
      await request("/auth/register/curator", {
        method: "POST",
        body: payload,
      });
    },
    me: () => request<User>("/me"),
    updateProfile: (payload) =>
      request<User>("/me", {
        method: "PUT",
        body: payload,
      }),
  },
  orgs: {
    list: () => request<Organization[]>("/edu/organizations"),
    getMine: () => request<Organization>("/edu/organizations/me"),
    listClassProfiles: () => request<ClassProfile[]>("/edu/class-profiles"),
  },
  admin: {
    listPendingOrganizations: () => request<PendingOrganizationRegistration[]>("/admin/organizations/pending"),
    approveOrganization: async (organizationId: number) => {
      await request(`/admin/organizations/${organizationId}/approve`, { method: "POST" });
    },
    rejectOrganization: async (organizationId: number) => {
      await request(`/admin/organizations/${organizationId}/reject`, { method: "POST" });
    },
  },
  organization: {
    listPendingCurators: () =>
      request<PendingCuratorRegistration[]>("/edu/organizations/me/curators/pending"),
    approveCurator: async (curatorId: number) => {
      await request(`/edu/organizations/me/curators/${curatorId}/approve`, { method: "POST" });
    },
    rejectCurator: async (curatorId: number) => {
      await request(`/edu/organizations/me/curators/${curatorId}/reject`, { method: "POST" });
    },
  },
  events: {
    list: (organizationId?: number) =>
      request<EventItem[]>(withQuery("/edu/events", { organization_id: organizationId })),
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
  },
  students: {
    list: (params) => request<Student[]>(withQuery("/edu/students", params ?? {})),
    create: (payload: StudentCreatePayload) =>
      request<Student>("/edu/students", {
        method: "POST",
        body: payload,
      }),
    update: (studentId: number, payload) =>
      request<Student>(`/edu/students/${studentId}`, {
        method: "PUT",
        body: payload,
      }),
    remove: (studentId: number) =>
      request(`/edu/students/${studentId}`, {
        method: "DELETE",
      }),
    get: (studentId: number) => request<Student>(`/edu/students/${studentId}`),
    listResearchWorks: (studentId: number) =>
      request<StudentResearchWork[]>(`/edu/students/${studentId}/research-works`),
    listAdditionalEducation: (studentId: number) =>
      request<StudentAdditionalEducation[]>(`/edu/students/${studentId}/additional-education`),
    listFirstProfessions: (studentId: number) =>
      request<StudentFirstProfession[]>(`/edu/students/${studentId}/first-professions`),
  },
  participations: {
    list: (params) => request<Participation[]>(withQuery("/edu/participations", params ?? {})),
    create: (payload: ParticipationCreatePayload) =>
      request<Participation>("/edu/participations", {
        method: "POST",
        body: payload,
      }),
    update: (participationId: number, payload: ParticipationUpdatePayload) =>
      request<Participation>(`/edu/participations/${participationId}`, {
        method: "PUT",
        body: payload,
      }),
    remove: (participationId: number) =>
      request(`/edu/participations/${participationId}`, {
        method: "DELETE",
      }),
  },
};
