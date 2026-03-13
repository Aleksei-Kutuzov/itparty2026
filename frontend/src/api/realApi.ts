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
  ProjectAnalysisExportType,
  RoadmapPublishPayload,
  RoadmapPublishResult,
  Student,
  StudentAchievement,
  StudentAchievementCreatePayload,
  StudentAchievementUpdatePayload,
  StudentAdditionalEducation,
  StudentAdditionalEducationCreatePayload,
  StudentAdditionalEducationUpdatePayload,
  StudentCreatePayload,
  StudentFirstProfession,
  StudentFirstProfessionCreatePayload,
  StudentFirstProfessionUpdatePayload,
  StudentResearchWork,
  StudentResearchWorkCreatePayload,
  StudentResearchWorkUpdatePayload,
  User,
} from "../types/models";

const withQuery = <T extends object>(path: string, params: T): string => {
  const search = new URLSearchParams();
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
};

export const realApi: ApiLayer = {
  auth: {
    listRegistrationOrganizations: () =>
      request("/public/organizations", {
        withAuth: false,
        allowBaseFallback: true,
      }),
    login: (payload) =>
      request("/auth/login", {
        method: "POST",
        asForm: true,
        withAuth: false,
        allowBaseFallback: true,
        body: {
          username: payload.email,
          password: payload.password,
        },
      }),
    registerOrganization: async (payload) => {
      await request("/auth/register/organization", {
        method: "POST",
        withAuth: false,
        allowBaseFallback: true,
        body: payload,
      });
    },
    registerCurator: async (payload) => {
      await request("/auth/register/curator", {
        method: "POST",
        withAuth: false,
        allowBaseFallback: true,
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
    listClassProfiles: (organizationId?: number) =>
      request<ClassProfile[]>(withQuery("/edu/class-profiles", organizationId ? { organization_id: organizationId } : {})),
  },
  admin: {
    listPendingOrganizations: () => request<PendingOrganizationRegistration[]>("/admin/organizations/pending"),
    approveOrganization: async (organizationId: number) => {
      await request(`/admin/organizations/${organizationId}/approve`, { method: "POST" });
    },
    rejectOrganization: async (organizationId: number) => {
      await request(`/admin/organizations/${organizationId}/reject`, { method: "POST" });
    },
    exportProjectAnalysis: (params: {
      export_type: ProjectAnalysisExportType;
      organization_id: number;
      class_name: string;
      period: string;
    }) =>
      request<Blob>(withQuery("/edu/project-analysis/export", params), {
        responseType: "blob",
      }),
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
    listCurators: () => request<User[]>("/edu/organizations/me/curators"),
    updateCuratorClass: (curatorId: number, payload: { responsible_class: string }) =>
      request<User>(`/edu/organizations/me/curators/${curatorId}/class`, {
        method: "PUT",
        body: payload,
      }),
  },
  events: {
    list: (params) => request<EventItem[]>(withQuery("/edu/events", params ?? {})),
    listResponsibleUsers: (organizationId?: number) =>
      request<User[]>(withQuery("/edu/responsible-users", organizationId ? { organization_id: organizationId } : {})),
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
    exportRoadmap: (params) =>
      request<Blob>(withQuery("/edu/roadmap/export", params), {
        responseType: "blob",
      }),
    publishRoadmap: (payload: RoadmapPublishPayload) =>
      request<RoadmapPublishResult>("/edu/roadmap/publish", {
        method: "POST",
        body: payload,
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
    createResearchWork: (studentId: number, payload: StudentResearchWorkCreatePayload) =>
      request<StudentResearchWork>(`/edu/students/${studentId}/research-works`, {
        method: "POST",
        body: payload,
      }),
    updateResearchWork: (studentId: number, workId: number, payload: StudentResearchWorkUpdatePayload) =>
      request<StudentResearchWork>(`/edu/students/${studentId}/research-works/${workId}`, {
        method: "PUT",
        body: payload,
      }),
    removeResearchWork: (studentId: number, workId: number) =>
      request(`/edu/students/${studentId}/research-works/${workId}`, {
        method: "DELETE",
      }),
    listAdditionalEducation: (studentId: number) =>
      request<StudentAdditionalEducation[]>(`/edu/students/${studentId}/additional-education`),
    createAdditionalEducation: (studentId: number, payload: StudentAdditionalEducationCreatePayload) =>
      request<StudentAdditionalEducation>(`/edu/students/${studentId}/additional-education`, {
        method: "POST",
        body: payload,
      }),
    updateAdditionalEducation: (studentId: number, entryId: number, payload: StudentAdditionalEducationUpdatePayload) =>
      request<StudentAdditionalEducation>(`/edu/students/${studentId}/additional-education/${entryId}`, {
        method: "PUT",
        body: payload,
      }),
    removeAdditionalEducation: (studentId: number, entryId: number) =>
      request(`/edu/students/${studentId}/additional-education/${entryId}`, {
        method: "DELETE",
      }),
    listFirstProfessions: (studentId: number) =>
      request<StudentFirstProfession[]>(`/edu/students/${studentId}/first-professions`),
    createFirstProfession: (studentId: number, payload: StudentFirstProfessionCreatePayload) =>
      request<StudentFirstProfession>(`/edu/students/${studentId}/first-professions`, {
        method: "POST",
        body: payload,
      }),
    updateFirstProfession: (studentId: number, entryId: number, payload: StudentFirstProfessionUpdatePayload) =>
      request<StudentFirstProfession>(`/edu/students/${studentId}/first-professions/${entryId}`, {
        method: "PUT",
        body: payload,
      }),
    removeFirstProfession: (studentId: number, entryId: number) =>
      request(`/edu/students/${studentId}/first-professions/${entryId}`, {
        method: "DELETE",
      }),
    listAchievements: (studentId: number) =>
      request<StudentAchievement[]>(`/edu/students/${studentId}/achievements`),
    createAchievement: (studentId: number, payload: StudentAchievementCreatePayload) =>
      request<StudentAchievement>(`/edu/students/${studentId}/achievements`, {
        method: "POST",
        body: payload,
      }),
    updateAchievement: (studentId: number, achievementId: number, payload: StudentAchievementUpdatePayload) =>
      request<StudentAchievement>(`/edu/students/${studentId}/achievements/${achievementId}`, {
        method: "PUT",
        body: payload,
      }),
    removeAchievement: (studentId: number, achievementId: number) =>
      request(`/edu/students/${studentId}/achievements/${achievementId}`, {
        method: "DELETE",
      }),
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
