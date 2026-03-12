import type { ApiLayer, LoginResult } from "./contracts";
import { AUTH_TOKEN_KEY } from "./client";
import type {
  EventCreatePayload,
  EventFeedback,
  EventItem,
  EventStatus,
  EventStudentLink,
  EventUpdatePayload,
  Organization,
  PendingUserRegistration,
  ReportSummary,
  OrgProfile,
  Student,
  StudentCreatePayload,
  StudentUpdatePayload,
  User,
} from "../types/models";
import { formatStudentClass } from "../shared/utils/studentClass";

const MOCK_DB_KEY = "apz_mock_db_v1";

type StoredUser = User & {
  password: string;
  organization_id: number | null;
  position: string | null;
};

type StoredEvent = Omit<EventItem, "organization_name">;

type Session = {
  token: string;
  userId: number;
};

type MockDb = {
  users: StoredUser[];
  organizations: Organization[];
  events: StoredEvent[];
  students: Student[];
  eventStudents: EventStudentLink[];
  feedback: EventFeedback[];
  sessions: Session[];
  seq: {
    user: number;
    org: number;
    event: number;
    student: number;
    feedback: number;
  };
};

const nowIso = (): string => new Date().toISOString();

const eventStatusList: EventStatus[] = ["planned", "cancelled", "rescheduled", "completed"];

const withDelay = async <T>(value: T, ms = 180): Promise<T> =>
  new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });

const createInitialDb = (): MockDb => {
  const createdAt = nowIso();
  return {
    organizations: [
      { id: 1, name: "МБОУ Школа №1", created_at: createdAt },
      { id: 2, name: "ГБПОУ IT-Куб Арзамас", created_at: createdAt },
    ],
    users: [
      {
        id: 1,
        email: "admin@apz.local",
        password: "Admin1234",
        first_name: "Админ",
        last_name: "АПЗ",
        patronymic: null,
        created_at: createdAt,
        is_admin: true,
        is_verified: true,
        organization_id: null,
        position: "Системный администратор",
      },
      {
        id: 2,
        email: "school1@apz.local",
        password: "School1234",
        first_name: "Мария",
        last_name: "Кузнецова",
        patronymic: "Игоревна",
        created_at: createdAt,
        is_admin: false,
        is_verified: true,
        organization_id: 1,
        position: "Методист",
      },
      {
        id: 3,
        email: "pending@apz.local",
        password: "Pending1234",
        first_name: "Илья",
        last_name: "Новиков",
        patronymic: null,
        created_at: createdAt,
        is_admin: false,
        is_verified: false,
        organization_id: 2,
        position: "Куратор",
      },
    ],
    events: [
      {
        id: 1,
        title: "Олимпиада по веб-разработке",
        description: "Подготовка участников к региональному этапу",
        status: "planned",
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        organization_id: 1,
        created_by_user_id: 2,
        created_at: createdAt,
        updated_at: createdAt,
      },
      {
        id: 2,
        title: "Общий вебинар АПЗ",
        description: "Методическая встреча для всех ОО",
        status: "planned",
        starts_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        ends_at: new Date(Date.now() + 3 * 86400000 + 7200000).toISOString(),
        organization_id: null,
        created_by_user_id: 1,
        created_at: createdAt,
        updated_at: createdAt,
      },
    ],
    students: [
      {
        id: 1,
        organization_id: 1,
        full_name: "Петров Андрей Николаевич",
        school_class: "10А::Группа 1",
        rating: 92,
        contests: "Веб-хакатон 2025",
        olympiads: "Муниципальная олимпиада по информатике",
        created_at: createdAt,
        updated_at: createdAt,
      },
      {
        id: 2,
        organization_id: 1,
        full_name: "Смирнова Алиса Сергеевна",
        school_class: "9Б::Группа 2",
        rating: 87,
        contests: "РобоКвест",
        olympiads: "Олимпиада НТИ Junior",
        created_at: createdAt,
        updated_at: createdAt,
      },
    ],
    eventStudents: [],
    feedback: [],
    sessions: [],
    seq: {
      user: 3,
      org: 2,
      event: 2,
      student: 2,
      feedback: 0,
    },
  };
};

const loadDb = (): MockDb => {
  const raw = localStorage.getItem(MOCK_DB_KEY);
  if (!raw) {
    const initial = createInitialDb();
    localStorage.setItem(MOCK_DB_KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    return JSON.parse(raw) as MockDb;
  } catch {
    const initial = createInitialDb();
    localStorage.setItem(MOCK_DB_KEY, JSON.stringify(initial));
    return initial;
  }
};

const saveDb = (db: MockDb): void => {
  localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
};

const pickUser = (db: MockDb, user: StoredUser): User => ({
  id: user.id,
  email: user.email,
  first_name: user.first_name,
  last_name: user.last_name,
  patronymic: user.patronymic,
  organization_id: user.organization_id,
  organization_name: getOrganizationName(db, user.organization_id),
  position: user.position,
  is_admin: user.is_admin,
  is_verified: user.is_verified,
  created_at: user.created_at,
});

const getOrganizationName = (db: MockDb, organizationId: number | null): string | null => {
  if (organizationId === null) {
    return null;
  }
  return db.organizations.find((org) => org.id === organizationId)?.name ?? null;
};

const toEventResponse = (db: MockDb, event: StoredEvent): EventItem => ({
  ...event,
  organization_name: getOrganizationName(db, event.organization_id),
});

const getCurrentUser = (db: MockDb): StoredUser => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    throw new Error("Не авторизован");
  }
  const session = db.sessions.find((it) => it.token === token);
  if (!session) {
    throw new Error("Сессия истекла");
  }
  const user = db.users.find((it) => it.id === session.userId);
  if (!user) {
    throw new Error("Пользователь не найден");
  }
  return user;
};

const ensureEventAccess = (user: StoredUser, event: StoredEvent): void => {
  if (user.is_admin) {
    return;
  }
  if (event.organization_id !== null && event.organization_id !== user.organization_id) {
    throw new Error("Нет доступа к мероприятию");
  }
};

const ensureStudentAccess = (user: StoredUser, student: Student): void => {
  if (user.is_admin) {
    return;
  }
  if (student.organization_id !== user.organization_id) {
    throw new Error("Нет доступа к ученику");
  }
};

const listVisibleEvents = (db: MockDb, user: StoredUser): StoredEvent[] => {
  if (user.is_admin) {
    return [...db.events];
  }
  return db.events.filter((event) => event.organization_id === null || event.organization_id === user.organization_id);
};

const createToken = (): string => `mock_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

export const mockApi: ApiLayer = {
  auth: {
    login: async ({ email, password }) => {
      const db = loadDb();
      const user = db.users.find((it) => it.email.toLowerCase() === email.toLowerCase() && it.password === password);
      if (!user) {
        throw new Error("Неверный логин или пароль");
      }
      if (!user.is_verified) {
        throw new Error("Аккаунт ожидает подтверждения администратором");
      }
      const token = createToken();
      db.sessions = db.sessions.filter((it) => it.userId !== user.id);
      db.sessions.push({ token, userId: user.id });
      saveDb(db);
      return withDelay<LoginResult>({ access_token: token, token_type: "bearer" });
    },
    register: async (payload) => {
      const db = loadDb();
      const hasEmail = db.users.some((it) => it.email.toLowerCase() === payload.email.toLowerCase());
      if (hasEmail) {
        throw new Error("Пользователь с таким email уже существует");
      }

      let organization = db.organizations.find(
        (it) => it.name.trim().toLowerCase() === payload.organization_name.trim().toLowerCase(),
      );
      if (!organization) {
        db.seq.org += 1;
        organization = {
          id: db.seq.org,
          name: payload.organization_name.trim(),
          created_at: nowIso(),
        };
        db.organizations.push(organization);
      }

      db.seq.user += 1;
      db.users.push({
        id: db.seq.user,
        email: payload.email,
        password: payload.password,
        first_name: payload.first_name,
        last_name: payload.last_name,
        patronymic: payload.patronymic ?? null,
        created_at: nowIso(),
        is_admin: false,
        is_verified: false,
        organization_id: organization.id,
        position: payload.position ?? null,
      });
      saveDb(db);
      await withDelay(undefined);
    },
    me: async () => {
      const db = loadDb();
      const user = getCurrentUser(db);
      return withDelay(pickUser(db, user));
    },
    orgProfile: async () => {
      const db = loadDb();
      const user = getCurrentUser(db);
      if (user.is_admin) {
        return withDelay({
          user_id: user.id,
          organization_id: 0,
          organization_name: "Все организации",
          position: user.position,
          created_at: user.created_at,
          is_admin: true,
          message: "Профиль администратора",
        } satisfies OrgProfile);
      }
      const orgName = getOrganizationName(db, user.organization_id) ?? "Не задана";
      return withDelay({
        user_id: user.id,
        organization_id: user.organization_id ?? 0,
        organization_name: orgName,
        position: user.position,
        created_at: user.created_at,
      });
    },
    updateProfile: async (payload) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      user.first_name = payload.first_name ?? user.first_name;
      user.last_name = payload.last_name ?? user.last_name;
      user.patronymic = payload.patronymic ?? user.patronymic;
      saveDb(db);
      return withDelay(pickUser(db, user));
    },
  },
  orgs: {
    list: async () => {
      const db = loadDb();
      getCurrentUser(db);
      return withDelay([...db.organizations]);
    },
  },
  admin: {
    listPendingUsers: async () => {
      const db = loadDb();
      const currentUser = getCurrentUser(db);
      if (!currentUser.is_admin) {
        throw new Error("Недостаточно прав");
      }
      const rows: PendingUserRegistration[] = db.users
        .filter((user) => !user.is_admin && !user.is_verified)
        .sort((left, right) => left.created_at.localeCompare(right.created_at))
        .map((user) => ({
          user_id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          patronymic: user.patronymic,
          created_at: user.created_at,
          organization_id: user.organization_id,
          organization_name: getOrganizationName(db, user.organization_id),
          position: user.position,
        }));

      return withDelay(rows);
    },
    approveUser: async (userId: number) => {
      const db = loadDb();
      const currentUser = getCurrentUser(db);
      if (!currentUser.is_admin) {
        throw new Error("Недостаточно прав");
      }
      const user = db.users.find((item) => item.id === userId);
      if (!user) {
        throw new Error("Пользователь не найден");
      }
      if (user.is_admin) {
        throw new Error("Администратор не требует подтверждения");
      }
      if (user.organization_id === null) {
        throw new Error("Нельзя подтвердить пользователя без привязки к организации");
      }
      user.is_verified = true;
      saveDb(db);
      return withDelay(pickUser(db, user));
    },
    rejectUser: async (userId: number) => {
      const db = loadDb();
      const currentUser = getCurrentUser(db);
      if (!currentUser.is_admin) {
        throw new Error("Недостаточно прав");
      }
      const user = db.users.find((item) => item.id === userId);
      if (!user) {
        throw new Error("Пользователь не найден");
      }
      if (user.is_admin) {
        throw new Error("Нельзя отклонить администратора");
      }
      if (user.is_verified) {
        throw new Error("Пользователь уже подтвержден");
      }
      db.users = db.users.filter((item) => item.id !== userId);
      db.sessions = db.sessions.filter((item) => item.userId !== userId);
      saveDb(db);
      await withDelay(undefined);
    },
  },
  events: {
    list: async () => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const rows = listVisibleEvents(db, user).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      return withDelay(rows.map((it) => toEventResponse(db, it)));
    },
    create: async (payload: EventCreatePayload) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const targetOrgId = payload.organization_id ?? null;
      if (!user.is_admin && targetOrgId !== null && targetOrgId !== user.organization_id) {
        throw new Error("Можно создавать мероприятия только для своей ОО или общие");
      }
      if (targetOrgId !== null && !db.organizations.some((it) => it.id === targetOrgId)) {
        throw new Error("Организация не найдена");
      }
      db.seq.event += 1;
      const created: StoredEvent = {
        id: db.seq.event,
        title: payload.title,
        description: payload.description ?? null,
        status: payload.status ?? "planned",
        starts_at: payload.starts_at,
        ends_at: payload.ends_at,
        organization_id: targetOrgId,
        created_by_user_id: user.id,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      db.events.push(created);
      saveDb(db);
      return withDelay(toEventResponse(db, created));
    },
    update: async (eventId: number, payload: EventUpdatePayload) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const event = db.events.find((it) => it.id === eventId);
      if (!event) {
        throw new Error("Мероприятие не найдено");
      }
      ensureEventAccess(user, event);
      if (!user.is_admin && payload.organization_id !== undefined && payload.organization_id !== user.organization_id) {
        throw new Error("Можно назначать только свою ОО или общий доступ");
      }
      if (payload.organization_id !== undefined && payload.organization_id !== null) {
        if (!db.organizations.some((org) => org.id === payload.organization_id)) {
          throw new Error("Организация не найдена");
        }
      }
      event.title = payload.title ?? event.title;
      event.description = payload.description ?? event.description;
      event.status = payload.status ?? event.status;
      event.starts_at = payload.starts_at ?? event.starts_at;
      event.ends_at = payload.ends_at ?? event.ends_at;
      event.organization_id = payload.organization_id === undefined ? event.organization_id : payload.organization_id;
      event.updated_at = nowIso();
      saveDb(db);
      return withDelay(toEventResponse(db, event));
    },
    remove: async (eventId: number) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const event = db.events.find((it) => it.id === eventId);
      if (!event) {
        throw new Error("Мероприятие не найдено");
      }
      ensureEventAccess(user, event);
      db.events = db.events.filter((it) => it.id !== eventId);
      db.eventStudents = db.eventStudents.filter((it) => it.event_id !== eventId);
      db.feedback = db.feedback.filter((it) => it.event_id !== eventId);
      saveDb(db);
      await withDelay(undefined);
    },
    cancel: async (eventId: number) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const event = db.events.find((it) => it.id === eventId);
      if (!event) {
        throw new Error("Мероприятие не найдено");
      }
      ensureEventAccess(user, event);
      event.status = "cancelled";
      event.updated_at = nowIso();
      saveDb(db);
      return withDelay(toEventResponse(db, event));
    },
    reschedule: async (eventId: number, payload: { starts_at: string; ends_at: string }) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const event = db.events.find((it) => it.id === eventId);
      if (!event) {
        throw new Error("Мероприятие не найдено");
      }
      ensureEventAccess(user, event);
      event.starts_at = payload.starts_at;
      event.ends_at = payload.ends_at;
      event.status = "rescheduled";
      event.updated_at = nowIso();
      saveDb(db);
      return withDelay(toEventResponse(db, event));
    },
    reportSummary: async (organizationId?: number | null) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const targetOrg = user.is_admin ? organizationId ?? null : user.organization_id;
      const rows = db.events.filter((event) => {
        if (targetOrg === null) {
          return true;
        }
        return event.organization_id === null || event.organization_id === targetOrg;
      });

      const statusCounts: Record<EventStatus, number> = {
        planned: 0,
        cancelled: 0,
        rescheduled: 0,
        completed: 0,
      };
      rows.forEach((event) => {
        statusCounts[event.status] += 1;
      });

      const eventIds = new Set(rows.map((it) => it.id));
      const totalFeedback = db.feedback.filter((row) => eventIds.has(row.event_id)).length;

      return withDelay<ReportSummary>({
        organization_id: targetOrg ?? null,
        total_events: rows.length,
        status_counts: statusCounts,
        total_feedback: totalFeedback,
      });
    },
    listStudents: async (eventId: number) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const event = db.events.find((it) => it.id === eventId);
      if (!event) {
        throw new Error("Мероприятие не найдено");
      }
      ensureEventAccess(user, event);
      const links = db.eventStudents.filter((it) => it.event_id === eventId);
      return withDelay(
        links.map((link) => {
          const student = db.students.find((it) => it.id === link.student_id);
          if (!student) {
            return link;
          }
          return {
            ...link,
            student_full_name: student.full_name,
            school_class: student.school_class,
            rating: student.rating,
          };
        }),
      );
    },
    assignStudent: async (eventId: number, studentId: number) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const event = db.events.find((it) => it.id === eventId);
      const student = db.students.find((it) => it.id === studentId);
      if (!event || !student) {
        throw new Error("Данные не найдены");
      }
      ensureEventAccess(user, event);
      ensureStudentAccess(user, student);
      if (event.organization_id !== null && event.organization_id !== student.organization_id) {
        throw new Error("Ученик и мероприятие должны относиться к одной ОО");
      }
      const exists = db.eventStudents.find((it) => it.event_id === eventId && it.student_id === studentId);
      if (exists) {
        return withDelay(exists);
      }
      const row: EventStudentLink = {
        event_id: eventId,
        student_id: studentId,
        student_full_name: student.full_name,
        school_class: student.school_class,
        rating: student.rating,
        created_at: nowIso(),
      };
      db.eventStudents.push(row);
      saveDb(db);
      return withDelay(row);
    },
    removeStudent: async (eventId: number, studentId: number) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const event = db.events.find((it) => it.id === eventId);
      const student = db.students.find((it) => it.id === studentId);
      if (!event || !student) {
        throw new Error("Данные не найдены");
      }
      ensureEventAccess(user, event);
      ensureStudentAccess(user, student);
      db.eventStudents = db.eventStudents.filter((it) => !(it.event_id === eventId && it.student_id === studentId));
      saveDb(db);
      await withDelay(undefined);
    },
    sendFeedback: async (eventId, payload) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const event = db.events.find((it) => it.id === eventId);
      if (!event) {
        throw new Error("Мероприятие не найдено");
      }
      ensureEventAccess(user, event);
      let row = db.feedback.find((it) => it.event_id === eventId && it.user_id === user.id);
      if (!row) {
        db.seq.feedback += 1;
        row = {
          id: db.seq.feedback,
          event_id: eventId,
          user_id: user.id,
          rating: payload.rating ?? null,
          comment: payload.comment ?? null,
          created_at: nowIso(),
        };
        db.feedback.push(row);
      } else {
        row.rating = payload.rating ?? row.rating;
        row.comment = payload.comment ?? row.comment;
      }
      saveDb(db);
      return withDelay(row);
    },
    listFeedback: async (eventId: number) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const event = db.events.find((it) => it.id === eventId);
      if (!event) {
        throw new Error("Мероприятие не найдено");
      }
      ensureEventAccess(user, event);
      return withDelay(db.feedback.filter((it) => it.event_id === eventId));
    },
  },
  students: {
    list: async () => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const rows = user.is_admin ? db.students : db.students.filter((it) => it.organization_id === user.organization_id);
      return withDelay([...rows].sort((a, b) => b.rating - a.rating));
    },
    create: async (payload: StudentCreatePayload) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const targetOrg = user.is_admin ? payload.organization_id : user.organization_id;
      if (!targetOrg) {
        throw new Error("Выберите организацию");
      }
      if (!db.organizations.some((it) => it.id === targetOrg)) {
        throw new Error("Организация не найдена");
      }
      db.seq.student += 1;
      const row: Student = {
        id: db.seq.student,
        organization_id: targetOrg,
        full_name: payload.full_name,
        school_class: payload.school_class,
        rating: payload.rating ?? 0,
        contests: payload.contests ?? null,
        olympiads: payload.olympiads ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      db.students.push(row);
      saveDb(db);
      return withDelay(row);
    },
    update: async (studentId: number, payload: StudentUpdatePayload) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const student = db.students.find((it) => it.id === studentId);
      if (!student) {
        throw new Error("Ученик не найден");
      }
      ensureStudentAccess(user, student);
      student.full_name = payload.full_name ?? student.full_name;
      student.school_class = payload.school_class ?? student.school_class;
      student.rating = payload.rating ?? student.rating;
      student.contests = payload.contests ?? student.contests;
      student.olympiads = payload.olympiads ?? student.olympiads;
      student.updated_at = nowIso();
      saveDb(db);
      return withDelay(student);
    },
    remove: async (studentId: number) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const student = db.students.find((it) => it.id === studentId);
      if (!student) {
        throw new Error("Ученик не найден");
      }
      ensureStudentAccess(user, student);
      db.students = db.students.filter((it) => it.id !== studentId);
      db.eventStudents = db.eventStudents.filter((it) => it.student_id !== studentId);
      saveDb(db);
      await withDelay(undefined);
    },
    exportCard: async (studentId: number) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const student = db.students.find((it) => it.id === studentId);
      if (!student) {
        throw new Error("Ученик не найден");
      }
      ensureStudentAccess(user, student);
      const content = [
        `ID ученика: ${student.id}`,
        `ID организации: ${student.organization_id}`,
        `ФИО: ${student.full_name}`,
        `Класс / группа: ${formatStudentClass(student.school_class)}`,
        `Рейтинг: ${student.rating}`,
        `Конкурсы: ${student.contests ?? "-"}`,
        `Олимпиады: ${student.olympiads ?? "-"}`,
        `Создан: ${student.created_at}`,
        `Обновлен: ${student.updated_at}`,
      ].join("\n");
      return withDelay(new Blob([content], { type: "text/plain;charset=utf-8" }));
    },
    listEvents: async (studentId: number) => {
      const db = loadDb();
      const user = getCurrentUser(db);
      const student = db.students.find((it) => it.id === studentId);
      if (!student) {
        throw new Error("Ученик не найден");
      }
      ensureStudentAccess(user, student);
      const eventIds = db.eventStudents.filter((it) => it.student_id === studentId).map((it) => it.event_id);
      const rows = db.events.filter((it) => eventIds.includes(it.id));
      const visibleRows = rows.filter((event) => user.is_admin || event.organization_id === null || event.organization_id === user.organization_id);
      return withDelay(visibleRows.map((event) => toEventResponse(db, event)));
    },
  },
};

export const resetMockDb = (): void => {
  localStorage.removeItem(MOCK_DB_KEY);
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
};

export const mockMeta = {
  demoAccounts: [
    { role: "Администратор", email: "admin@apz.local", password: "Admin1234" },
    { role: "Сотрудник ОО", email: "school1@apz.local", password: "School1234" },
    { role: "Новая заявка", email: "pending@apz.local", password: "Pending1234" },
  ],
  statuses: eventStatusList,
};
