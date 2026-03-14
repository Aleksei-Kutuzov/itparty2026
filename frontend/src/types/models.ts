export type UserRole = "admin" | "organization" | "curator";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type RoadmapDirection =
  | "Профессиональное просвещение"
  | "Практико-ориентированное направление"
  | "Диагностическое направление"
  | "Работа с родителями"
  | "Информационное направление";
export type EventType = RoadmapDirection;
export type EventEnvironmentType = "real" | "roadmap";
export type EventScheduleMode = "range" | "quarterly" | "whole_year";
export type TargetRangeKind = "class" | "course";
export type ProjectAnalysisExportType =
  | "general"
  | "class-info"
  | "profile-performance"
  | "olympiad"
  | "olympiad-participants"
  | "olympiad-winners"
  | "apz-participation"
  | "research-works"
  | "additional-education"
  | "first-profession"
  | "external-career";

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  patronymic: string | null;
  position: string | null;
  responsible_class: string | null;
  role: UserRole;
  approval_status: ApprovalStatus;
  organization_id: number | null;
  organization_name: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface Organization {
  id: number;
  name: string;
  owner_user_id: number;
  approval_status: ApprovalStatus;
  approved_at: string | null;
  created_at: string;
}

export interface RegistrationOrganizationOption {
  id: number;
  name: string;
}

export interface PendingOrganizationRegistration {
  organization_id: number;
  organization_name: string;
  owner_user_id: number;
  owner_email: string;
  owner_full_name: string;
  created_at: string;
}

export interface PendingCuratorRegistration {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  patronymic: string | null;
  position: string | null;
  responsible_class: string | null;
  organization_id: number;
  created_at: string;
}

export interface ClassProfile {
  id: number;
  organization_id: number;
  class_name: string;
  formation_year: number;
  created_at: string;
  updated_at: string;
}

export interface ResponsibleEmployee {
  id: number;
  first_name: string;
  last_name: string;
  patronymic: string | null;
  position: string | null;
}

export interface EventScheduleDate {
  starts_at: string;
  ends_at: string | null;
}

export interface EventItem {
  id: number;
  organization_id: number;
  title: string;
  event_type: EventType | string;
  environment_type: EventEnvironmentType;
  roadmap_direction: RoadmapDirection;
  roadmap_year: number | null;
  academic_year: string;
  schedule_mode: EventScheduleMode;
  is_all_organizations: boolean;
  target_class_name: string | null;
  target_class_names: string[];
  target_range_kind: TargetRangeKind | null;
  target_range_start: number | null;
  target_range_end: number | null;
  organizer: string | null;
  event_level: string | null;
  event_format: string | null;
  participants_count: number | null;
  target_audience: string | null;
  description: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
  responsible_user_ids: number[];
  responsible_employees: ResponsibleEmployee[];
  schedule_dates: EventScheduleDate[];
  source_roadmap_event_id: number | null;
}

export interface Student {
  id: number;
  organization_id: number;
  curator_id: number;
  class_profile_id: number | null;
  full_name: string;
  school_class: string;
  average_percent: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Participation {
  id: number;
  student_id: number;
  event_id: number;
  recorded_by_user_id: number;
  participation_type: string;
  status: string | null;
  result: string | null;
  score: number | null;
  award_place: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentResearchWork {
  id: number;
  student_id: number;
  work_title: string;
  publication_or_presentation_place: string;
  created_at: string;
  updated_at: string;
}

export interface StudentAdditionalEducation {
  id: number;
  student_id: number;
  program_name: string;
  provider_organization: string;
  created_at: string;
  updated_at: string;
}

export interface StudentFirstProfession {
  id: number;
  student_id: number;
  educational_organization: string;
  training_program: string;
  study_period: string;
  document: string;
  created_at: string;
  updated_at: string;
}

export interface StudentAchievement {
  id: number;
  student_id: number;
  event_id: number | null;
  event_name: string;
  event_type: string;
  achievement: string;
  achievement_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterOrganizationPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  patronymic?: string | null;
  position?: string | null;
  organization_name: string;
}

export interface RegisterCuratorPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  patronymic?: string | null;
  position?: string | null;
  organization_id: number;
}

export interface EventListParams {
  offset?: number;
  limit?: number;
  organization_id?: number;
  on_date?: string;
  responsible_user_id?: number;
  academic_year?: string;
  environment_type?: EventEnvironmentType;
  roadmap_year?: number;
}

export interface EventCreatePayload {
  title: string;
  event_type: EventType;
  environment_type: EventEnvironmentType;
  roadmap_direction?: RoadmapDirection;
  roadmap_year?: number | null;
  academic_year?: string | null;
  schedule_mode?: EventScheduleMode;
  is_all_organizations?: boolean;
  target_class_name?: string | null;
  target_class_names?: string[];
  target_range_kind?: TargetRangeKind | null;
  target_range_start?: number | null;
  target_range_end?: number | null;
  organizer?: string | null;
  event_level?: string | null;
  event_format?: string | null;
  participants_count?: number | null;
  target_audience?: string | null;
  description?: string | null;
  notes?: string | null;
  starts_at: string;
  ends_at: string;
  responsible_user_ids?: number[];
  schedule_dates?: Array<{
    starts_at: string;
    ends_at?: string | null;
  }>;
  organization_id?: number;
}

export interface EventUpdatePayload {
  title?: string;
  event_type?: EventType;
  environment_type?: EventEnvironmentType;
  roadmap_direction?: RoadmapDirection;
  roadmap_year?: number | null;
  academic_year?: string | null;
  schedule_mode?: EventScheduleMode;
  target_class_name?: string | null;
  target_class_names?: string[];
  target_range_kind?: TargetRangeKind | null;
  target_range_start?: number | null;
  target_range_end?: number | null;
  organizer?: string | null;
  event_level?: string | null;
  event_format?: string | null;
  participants_count?: number | null;
  target_audience?: string | null;
  description?: string | null;
  notes?: string | null;
  starts_at?: string;
  ends_at?: string;
  responsible_user_ids?: number[];
  schedule_dates?: Array<{
    starts_at: string;
    ends_at?: string | null;
  }>;
}

export interface StudentCreatePayload {
  full_name: string;
  school_class?: string | null;
  class_profile_id?: number | null;
  average_percent?: number | null;
  notes?: string | null;
  curator_id?: number;
}

export interface StudentListParams {
  organization_id?: number;
  curator_id?: number;
  offset?: number;
  limit?: number;
}

export interface StudentUpdatePayload {
  full_name?: string;
  school_class?: string;
  class_profile_id?: number | null;
  average_percent?: number | null;
  notes?: string | null;
}

export interface ParticipationListParams {
  student_id?: number;
  event_id?: number;
  offset?: number;
  limit?: number;
}

export interface ParticipationCreatePayload {
  student_id: number;
  event_id: number;
  participation_type: string;
  status?: string | null;
  result?: string | null;
  score?: number | null;
  award_place?: number | null;
  notes?: string | null;
}

export interface ParticipationUpdatePayload {
  participation_type?: string;
  status?: string | null;
  result?: string | null;
  score?: number | null;
  award_place?: number | null;
  notes?: string | null;
}

export interface StudentAchievementCreatePayload {
  event_id?: number | null;
  event_name?: string | null;
  event_type?: string | null;
  achievement: string;
  achievement_date: string;
  notes?: string | null;
}

export interface StudentAchievementUpdatePayload {
  event_id?: number | null;
  event_name?: string | null;
  event_type?: string | null;
  achievement?: string;
  achievement_date?: string;
  notes?: string | null;
}

export interface StudentResearchWorkCreatePayload {
  work_title: string;
  publication_or_presentation_place: string;
}

export interface StudentResearchWorkUpdatePayload {
  work_title?: string;
  publication_or_presentation_place?: string;
}

export interface StudentAdditionalEducationCreatePayload {
  program_name: string;
  provider_organization: string;
}

export interface StudentAdditionalEducationUpdatePayload {
  program_name?: string;
  provider_organization?: string;
}

export interface StudentFirstProfessionCreatePayload {
  educational_organization: string;
  training_program: string;
  study_period: string;
  document: string;
}

export interface StudentFirstProfessionUpdatePayload {
  educational_organization?: string;
  training_program?: string;
  study_period?: string;
  document?: string;
}

export interface ReportSummary {
  total_events: number;
  total_students: number;
  total_participations: number;
  event_type_counts: Record<string, number>;
}

export interface RoadmapPublishPayload {
  roadmap_year: number;
  organization_id?: number;
}

export interface RoadmapPublishResult {
  created_count: number;
  skipped_count: number;
}
