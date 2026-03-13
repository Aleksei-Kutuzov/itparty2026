import type {
  ClassProfile,
  EventCreatePayload,
  EventItem,
  EventListParams,
  EventUpdatePayload,
  LoginPayload,
  Organization,
  Participation,
  ParticipationCreatePayload,
  ParticipationUpdatePayload,
  PendingCuratorRegistration,
  PendingOrganizationRegistration,
  ProjectAnalysisExportType,
  RegistrationOrganizationOption,
  RegisterCuratorPayload,
  RegisterOrganizationPayload,
  Student,
  StudentAchievement,
  StudentAchievementCreatePayload,
  StudentAchievementUpdatePayload,
  StudentAdditionalEducation,
  StudentCreatePayload,
  StudentFirstProfession,
  StudentResearchWork,
  StudentUpdatePayload,
  User,
} from "../types/models";

export interface LoginResult {
  access_token: string;
  token_type: string;
}

export interface ApiLayer {
  auth: {
    listRegistrationOrganizations: () => Promise<RegistrationOrganizationOption[]>;
    login: (payload: LoginPayload) => Promise<LoginResult>;
    registerOrganization: (payload: RegisterOrganizationPayload) => Promise<void>;
    registerCurator: (payload: RegisterCuratorPayload) => Promise<void>;
    me: () => Promise<User>;
    updateProfile: (
      payload: Partial<Pick<User, "first_name" | "last_name" | "patronymic" | "position" | "responsible_class">>,
    ) => Promise<User>;
  };
  orgs: {
    list: () => Promise<Organization[]>;
    getMine: () => Promise<Organization>;
    listClassProfiles: (organizationId?: number) => Promise<ClassProfile[]>;
  };
  admin: {
    listPendingOrganizations: () => Promise<PendingOrganizationRegistration[]>;
    approveOrganization: (organizationId: number) => Promise<void>;
    rejectOrganization: (organizationId: number) => Promise<void>;
    exportProjectAnalysis: (params: {
      export_type: ProjectAnalysisExportType;
      organization_id: number;
      class_name: string;
      period: string;
    }) => Promise<Blob>;
  };
  organization: {
    listPendingCurators: () => Promise<PendingCuratorRegistration[]>;
    approveCurator: (curatorId: number) => Promise<void>;
    rejectCurator: (curatorId: number) => Promise<void>;
    listCurators: () => Promise<User[]>;
  };
  events: {
    list: (params?: EventListParams) => Promise<EventItem[]>;
    listResponsibleUsers: (organizationId?: number) => Promise<User[]>;
    create: (payload: EventCreatePayload) => Promise<EventItem>;
    update: (eventId: number, payload: EventUpdatePayload) => Promise<EventItem>;
    remove: (eventId: number) => Promise<void>;
    exportRoadmap: (params: { academic_year: string; organization_id?: number }) => Promise<Blob>;
  };
  students: {
    list: (params?: { organization_id?: number; curator_id?: number }) => Promise<Student[]>;
    create: (payload: StudentCreatePayload) => Promise<Student>;
    update: (studentId: number, payload: StudentUpdatePayload) => Promise<Student>;
    remove: (studentId: number) => Promise<void>;
    get: (studentId: number) => Promise<Student>;
    listResearchWorks: (studentId: number) => Promise<StudentResearchWork[]>;
    listAdditionalEducation: (studentId: number) => Promise<StudentAdditionalEducation[]>;
    listFirstProfessions: (studentId: number) => Promise<StudentFirstProfession[]>;
    listAchievements: (studentId: number) => Promise<StudentAchievement[]>;
    createAchievement: (studentId: number, payload: StudentAchievementCreatePayload) => Promise<StudentAchievement>;
    updateAchievement: (
      studentId: number,
      achievementId: number,
      payload: StudentAchievementUpdatePayload,
    ) => Promise<StudentAchievement>;
    removeAchievement: (studentId: number, achievementId: number) => Promise<void>;
  };
  participations: {
    list: (params?: { student_id?: number; event_id?: number }) => Promise<Participation[]>;
    create: (payload: ParticipationCreatePayload) => Promise<Participation>;
    update: (participationId: number, payload: ParticipationUpdatePayload) => Promise<Participation>;
    remove: (participationId: number) => Promise<void>;
  };
}
