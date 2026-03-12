export type UserRole = "admin" | "organization" | "curator";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  patronymic: string | null;
  position: string | null;
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

export interface EventItem {
  id: number;
  organization_id: number;
  title: string;
  event_type: string;
  target_class_name: string | null;
  organizer: string | null;
  event_level: string | null;
  event_format: string | null;
  participants_count: number | null;
  description: string | null;
  starts_at: string;
  ends_at: string;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: number;
  organization_id: number;
  curator_id: number;
  class_profile_id: number | null;
  full_name: string;
  school_class: string;
  informatics_avg_score: number | null;
  physics_avg_score: number | null;
  mathematics_avg_score: number | null;
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

export interface EventCreatePayload {
  title: string;
  event_type: string;
  target_class_name?: string | null;
  organizer?: string | null;
  event_level?: string | null;
  event_format?: string | null;
  participants_count?: number | null;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  organization_id?: number;
}

export interface EventUpdatePayload {
  title?: string;
  event_type?: string;
  target_class_name?: string | null;
  organizer?: string | null;
  event_level?: string | null;
  event_format?: string | null;
  participants_count?: number | null;
  description?: string | null;
  starts_at?: string;
  ends_at?: string;
}

export interface StudentCreatePayload {
  full_name: string;
  school_class: string;
  class_profile_id?: number | null;
  informatics_avg_score?: number | null;
  physics_avg_score?: number | null;
  mathematics_avg_score?: number | null;
  notes?: string | null;
  curator_id?: number;
}

export interface StudentUpdatePayload {
  full_name?: string;
  school_class?: string;
  class_profile_id?: number | null;
  informatics_avg_score?: number | null;
  physics_avg_score?: number | null;
  mathematics_avg_score?: number | null;
  notes?: string | null;
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

export interface ReportSummary {
  total_events: number;
  total_students: number;
  total_participations: number;
  event_type_counts: Record<string, number>;
}
