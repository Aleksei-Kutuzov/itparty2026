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
  ParticipationListParams,
  ProjectAnalysisExportType,
  RegistrationOrganizationOption,
  RegisterCuratorPayload,
  RegisterOrganizationPayload,
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
  StudentListParams,
  StudentResearchWork,
  StudentResearchWorkCreatePayload,
  StudentResearchWorkUpdatePayload,
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
    updateCuratorClass: (curatorId: number, payload: { responsible_class: string }) => Promise<User>;
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
    list: (params?: StudentListParams) => Promise<Student[]>;
    create: (payload: StudentCreatePayload) => Promise<Student>;
    update: (studentId: number, payload: StudentUpdatePayload) => Promise<Student>;
    remove: (studentId: number) => Promise<void>;
    get: (studentId: number) => Promise<Student>;
    listResearchWorks: (studentId: number) => Promise<StudentResearchWork[]>;
    createResearchWork: (studentId: number, payload: StudentResearchWorkCreatePayload) => Promise<StudentResearchWork>;
    updateResearchWork: (
      studentId: number,
      workId: number,
      payload: StudentResearchWorkUpdatePayload,
    ) => Promise<StudentResearchWork>;
    removeResearchWork: (studentId: number, workId: number) => Promise<void>;
    listAdditionalEducation: (studentId: number) => Promise<StudentAdditionalEducation[]>;
    createAdditionalEducation: (
      studentId: number,
      payload: StudentAdditionalEducationCreatePayload,
    ) => Promise<StudentAdditionalEducation>;
    updateAdditionalEducation: (
      studentId: number,
      entryId: number,
      payload: StudentAdditionalEducationUpdatePayload,
    ) => Promise<StudentAdditionalEducation>;
    removeAdditionalEducation: (studentId: number, entryId: number) => Promise<void>;
    listFirstProfessions: (studentId: number) => Promise<StudentFirstProfession[]>;
    createFirstProfession: (studentId: number, payload: StudentFirstProfessionCreatePayload) => Promise<StudentFirstProfession>;
    updateFirstProfession: (
      studentId: number,
      entryId: number,
      payload: StudentFirstProfessionUpdatePayload,
    ) => Promise<StudentFirstProfession>;
    removeFirstProfession: (studentId: number, entryId: number) => Promise<void>;
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
    list: (params?: ParticipationListParams) => Promise<Participation[]>;
    create: (payload: ParticipationCreatePayload) => Promise<Participation>;
    update: (participationId: number, payload: ParticipationUpdatePayload) => Promise<Participation>;
    remove: (participationId: number) => Promise<void>;
  };
}
