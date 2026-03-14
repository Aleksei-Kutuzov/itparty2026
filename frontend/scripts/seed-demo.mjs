#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_PASSWORD = "12345678";
const DEFAULT_OUTPUT_FILE = ".seed-demo-last.json";
const API_PREFIX = "/api/v1";
const LOW_AVERAGE_VALUES = [0.3, 1.1, 1.9, 2.8, 3.7, 4.8];
const RU = Object.freeze({
  olympiad: "\u041e\u043b\u0438\u043c\u043f\u0438\u0430\u0434\u0430",
  participant: "\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a",
  winner: "\u041f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044c",
  prize: "\u041f\u0440\u0438\u0437\u0435\u0440",
  fullTime: "\u043e\u0447\u043d\u043e",
  remote: "\u0437\u0430\u043e\u0447\u043d\u043e",
  directions: {
    professional: "\u041f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u043e\u0435 \u043f\u0440\u043e\u0441\u0432\u0435\u0449\u0435\u043d\u0438\u0435",
    practice: "\u041f\u0440\u0430\u043a\u0442\u0438\u043a\u043e-\u043e\u0440\u0438\u0435\u043d\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u043e\u0435 \u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435",
    diagnostic: "\u0414\u0438\u0430\u0433\u043d\u043e\u0441\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0435 \u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435",
    parents: "\u0420\u0430\u0431\u043e\u0442\u0430 \u0441 \u0440\u043e\u0434\u0438\u0442\u0435\u043b\u044f\u043c\u0438",
    informational: "\u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u043e\u043d\u043d\u043e\u0435 \u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435",
  },
});

const ORG_BLUEPRINTS = [
  {
    key: "school1",
    title: "Средняя школа N1",
    owner: {
      email: "test1@test.com",
      first_name: "Ирина",
      last_name: "Иванова",
      patronymic: "Петровна",
      position: "Директор",
    },
    approvedCurators: [
      {
        key: "school1-curator-a",
        email: "test2@test.com",
        first_name: "Марина",
        last_name: "Соколова",
        patronymic: "Игоревна",
        position: "Классный руководитель",
        responsible_class: "7А",
        students: [
          "Алексеев Иван Сергеевич",
          "Смирнова Полина Андреевна",
          "Кузнецов Артем Игоревич",
          "Морозова Дарья Павловна",
          "Соловьев Максим Олегович",
          "Федорова Алина Романовна",
        ],
      },
      {
        key: "school1-curator-b",
        email: "test3@test.com",
        first_name: "Ольга",
        last_name: "Кузнецова",
        patronymic: "Викторовна",
        position: "Классный руководитель",
        responsible_class: "8А",
        students: [
          "Павлов Егор Дмитриевич",
          "Орлова Софья Николаевна",
          "Васильев Кирилл Денисович",
          "Никитина Мария Сергеевна",
          "Захаров Тимофей Алексеевич",
          "Беляева Виктория Ильинична",
        ],
      },
    ],
    pendingCurator: {
      key: "school1-curator-pending",
      email: "test4@test.com",
      first_name: "Татьяна",
      last_name: "Волкова",
      patronymic: "Андреевна",
      position: "Классный руководитель",
      responsible_class: "9А",
    },
  },
  {
    key: "school2",
    title: "Гимназия N7",
    owner: {
      email: "test5@test.com",
      first_name: "Светлана",
      last_name: "Павлова",
      patronymic: "Алексеевна",
      position: "Директор",
    },
    approvedCurators: [
      {
        key: "school2-curator-a",
        email: "test6@test.com",
        first_name: "Елена",
        last_name: "Морозова",
        patronymic: "Павловна",
        position: "Классный руководитель",
        responsible_class: "7Б",
        students: [
          "Григорьев Даниил Андреевич",
          "Комарова Елизавета Сергеевна",
          "Титов Матвей Алексеевич",
          "Киселева Варвара Игоревна",
          "Максимов Никита Павлович",
          "Давыдова Ксения Викторовна",
        ],
      },
      {
        key: "school2-curator-b",
        email: "test7@test.com",
        first_name: "Наталья",
        last_name: "Романова",
        patronymic: "Игоревна",
        position: "Классный руководитель",
        responsible_class: "8Б",
        students: [
          "Семенов Роман Евгеньевич",
          "Попова Анна Владиславовна",
          "Гаврилов Илья Михайлович",
          "Крылова Ульяна Олеговна",
          "Егоров Лев Сергеевич",
          "Виноградова Полина Артемовна",
        ],
      },
    ],
    pendingCurator: {
      key: "school2-curator-pending",
      email: "test8@test.com",
      first_name: "Людмила",
      last_name: "Макарова",
      patronymic: "Олеговна",
      position: "Классный руководитель",
      responsible_class: "9Б",
    },
  },
];

const PENDING_ORG_BLUEPRINT = {
  key: "pending-org",
  title: "Лицей N12",
  owner: {
    email: "test9@test.com",
    first_name: "Сергей",
    last_name: "Воронин",
    patronymic: "Александрович",
    position: "Директор",
  },
};

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

class SeedApi {
  constructor({ baseUrl, token = null, timeoutMs = REQUEST_TIMEOUT_MS }) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  withToken(token) {
    return new SeedApi({
      baseUrl: this.baseUrl,
      token,
      timeoutMs: this.timeoutMs,
    });
  }

  async request(pathname, options = {}) {
    const {
      method = "GET",
      body,
      auth = true,
      asForm = false,
      responseType = "json",
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers();

    if (auth && this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    let payload;
    if (body !== undefined) {
      if (asForm) {
        const form = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
          if (value !== undefined && value !== null) {
            form.set(key, String(value));
          }
        }
        payload = form;
        headers.set("Content-Type", "application/x-www-form-urlencoded");
      } else {
        payload = JSON.stringify(body);
        headers.set("Content-Type", "application/json");
      }
    }

    try {
      const url = new URL(pathname.replace(/^\//, ""), `${this.baseUrl}/`);
      const response = await fetch(url, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });

      if (!response.ok) {
        const bodyText = await response.text();
        let message = bodyText || `HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(bodyText);
          if (parsed && typeof parsed.detail === "string" && parsed.detail.trim()) {
            message = parsed.detail;
          }
        } catch {
          // Keep raw text as error message.
        }
        throw new ApiError(message, response.status, bodyText);
      }

      if (responseType === "text") {
        return await response.text();
      }

      if (response.status === 204) {
        return undefined;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError(`Request timeout after ${Math.round(this.timeoutMs / 1000)}s`, 408, null);
      }
      throw new ApiError(error instanceof Error ? error.message : "Unknown network error", 0, null);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async login(email, password) {
    const result = await this.request("/auth/login", {
      method: "POST",
      body: {
        username: email,
        password,
      },
      auth: false,
      asForm: true,
    });
    return this.withToken(result.access_token);
  }
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const withoutPrefix = current.slice(2);
    const [rawKey, inlineValue] = withoutPrefix.split("=", 2);
    if (!rawKey) {
      continue;
    }

    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[rawKey] = true;
      continue;
    }

    args[rawKey] = next;
    index += 1;
  }

  return args;
}

function printHelp() {
  const lines = [
    "Usage:",
    "  node ./scripts/seed-demo.mjs [options]",
    "",
    "Options:",
    "  --base-url <url>        Full backend API URL, with or without /api/v1",
    "  --host <url>            Backend host, for example https://192.168.77.149",
    "  --backend-port <port>   Backend port, default: 8000",
    "  --admin-email <email>   Admin login, default from backend config",
    "  --admin-password <pwd>  Admin password, default from backend config",
    "  --password <pwd>        Password for generated demo accounts",
    "  --batch <id>            Batch suffix for names/emails",
    "  --seed-date <date>      Reference date in YYYY-MM-DD, default: today",
    "  --output <path>         Summary JSON path, default: ./.seed-demo-last.json",
    "  --insecure              Disable TLS certificate validation for local/self-signed HTTPS",
    "  --help                  Show this help",
  ];
  console.log(lines.join("\n"));
}

function ensureNodeFetch() {
  if (typeof fetch !== "function") {
    throw new Error("This script requires Node.js 18+ with global fetch support.");
  }
}

function readOption(args, name, fallback) {
  const cliValue = args[name];
  if (typeof cliValue === "string" && cliValue.trim()) {
    return cliValue.trim();
  }
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback.trim();
  }
  return fallback;
}

function readFlag(args, name, fallback = false) {
  if (args[name] === true) {
    return true;
  }
  if (typeof args[name] === "string") {
    const normalized = args[name].trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "n", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizeBaseUrl(rawBaseUrl) {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith(API_PREFIX)) {
    return trimmed;
  }
  return `${trimmed}${API_PREFIX}`;
}

function ensureProtocol(value) {
  return /^[a-z]+:\/\//i.test(value) ? value : `http://${value}`;
}

function buildBaseUrl({ baseUrl, host, backendPort }) {
  if (baseUrl) {
    return normalizeBaseUrl(baseUrl);
  }

  const preparedHost = ensureProtocol(host || "http://localhost");
  const parsed = new URL(preparedHost);

  if (parsed.pathname && parsed.pathname !== "/") {
    return normalizeBaseUrl(parsed.toString());
  }

  if (!parsed.port) {
    parsed.port = String(backendPort);
  }
  parsed.pathname = API_PREFIX;
  parsed.search = "";
  parsed.hash = "";

  return normalizeBaseUrl(parsed.toString());
}

function sanitizeForEmail(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48);
}

function sanitizeForLabel(value) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-");
}

function formatDatePart(value) {
  return String(value).padStart(2, "0");
}

function buildDefaultBatch(now = new Date()) {
  return [
    "demo",
    now.getUTCFullYear(),
    formatDatePart(now.getUTCMonth() + 1),
    formatDatePart(now.getUTCDate()),
    `${formatDatePart(now.getUTCHours())}${formatDatePart(now.getUTCMinutes())}${formatDatePart(now.getUTCSeconds())}`,
  ].join("-");
}

function parseSeedDate(value) {
  if (!value) {
    return new Date();
  }

  const normalized = value.trim();
  const parsed = new Date(`${normalized}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --seed-date value: ${value}`);
  }
  return parsed;
}

function inferAcademicYear(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
}

function inferRoadmapYear(date) {
  return Number(inferAcademicYear(date).split("/")[0]);
}

function isoUtc(year, month, day, hours = 9, minutes = 0) {
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0)).toISOString();
}

function addHours(isoString, hours) {
  return new Date(new Date(isoString).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function withQuery(pathname, params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildAccountEmail(key, batch) {
  if (key.includes("@")) {
    const [localPart, domainPart] = key.split("@");
    if (!batch) {
      return key;
    }
    return `${sanitizeForEmail(localPart)}.${sanitizeForEmail(batch)}@${domainPart}`;
  }
  return batch
    ? `${sanitizeForEmail(key)}.${sanitizeForEmail(batch)}@test.com`
    : `${sanitizeForEmail(key)}@test.com`;
}

function buildOrganizationPayload(blueprint, batch, password) {
  const titleSuffix = batch ? ` (тест ${batch})` : "";
  return {
    email: buildAccountEmail(blueprint.owner.email ?? `${blueprint.key}.owner`, batch),
    password,
    first_name: blueprint.owner.first_name,
    last_name: blueprint.owner.last_name,
    patronymic: blueprint.owner.patronymic,
    position: blueprint.owner.position,
    organization_name: `${blueprint.title}${titleSuffix}`,
  };
}

function buildCuratorPayload(blueprint, batch, password, organizationId) {
  return {
    email: buildAccountEmail(blueprint.email ?? blueprint.key, batch),
    password,
    first_name: blueprint.first_name,
    last_name: blueprint.last_name,
    patronymic: blueprint.patronymic,
    position: blueprint.position,
    organization_id: organizationId,
  };
}

function createWindowDates(roadmapYear) {
  const springYear = roadmapYear + 1;
  return {
    marchKickoff: isoUtc(springYear, 3, 12, 9, 0),
    marchOlympiad: isoUtc(springYear, 3, 21, 10, 0),
    aprilVisit: isoUtc(springYear, 4, 11, 8, 30),
    aprilWorkshop: isoUtc(springYear, 4, 25, 11, 0),
    mayShowcase: isoUtc(springYear, 5, 16, 10, 30),
    mayFinal: isoUtc(springYear, 5, 23, 12, 0),
  };
}

function buildClassEventPayload({
  title,
  direction,
  academicYear,
  roadmapYear,
  environmentType,
  scheduleMode,
  classNames,
  responsibleUserIds,
  organizer,
  eventLevel,
  eventFormat,
  participantsCount,
  description,
  notes,
  startsAt,
  endsAt,
}) {
  return {
    title,
    event_type: direction,
    environment_type: environmentType,
    roadmap_direction: direction,
    roadmap_year: environmentType === "roadmap" ? roadmapYear : null,
    academic_year: academicYear,
    schedule_mode: scheduleMode,
    is_all_organizations: false,
    target_class_name: classNames[0] ?? null,
    target_class_names: classNames,
    organizer,
    event_level: eventLevel,
    event_format: eventFormat,
    participants_count: participantsCount,
    target_audience: null,
    description,
    notes,
    starts_at: startsAt,
    ends_at: endsAt,
    responsible_user_ids: responsibleUserIds,
  };
}

function buildGlobalEventPayload({
  title,
  direction,
  academicYear,
  roadmapYear,
  environmentType,
  scheduleMode,
  responsibleUserIds,
  organizer,
  eventLevel,
  eventFormat,
  participantsCount,
  description,
  notes,
  startsAt,
  endsAt,
}) {
  return {
    title,
    event_type: direction,
    environment_type: environmentType,
    roadmap_direction: direction,
    roadmap_year: environmentType === "roadmap" ? roadmapYear : null,
    academic_year: academicYear,
    schedule_mode: scheduleMode,
    is_all_organizations: true,
    target_range_kind: "class",
    target_range_start: 7,
    target_range_end: 11,
    organizer,
    event_level: eventLevel,
    event_format: eventFormat,
    participants_count: participantsCount,
    description,
    notes,
    starts_at: startsAt,
    ends_at: endsAt,
    responsible_user_ids: responsibleUserIds,
  };
}

function buildStudentPayload(fullName, studentIndex, className) {
  return {
    full_name: fullName,
    average_percent: LOW_AVERAGE_VALUES[studentIndex % LOW_AVERAGE_VALUES.length],
    notes: `Ученик класса ${className}.`,
  };
}

async function loginAndReadProfile(api, email, password, label) {
  console.log(`- login: ${label}`);
  const client = await api.login(email, password);
  const user = await client.request("/me");
  return { client, user };
}

async function createApprovedOrganizations(publicApi, adminApi, batch, password, summary) {
  const organizations = [];

  for (const blueprint of ORG_BLUEPRINTS) {
    const payload = buildOrganizationPayload(blueprint, batch, password);
    console.log(`- register organization: ${payload.organization_name}`);
    const registration = await publicApi.request("/auth/register/organization", {
      method: "POST",
      auth: false,
      body: payload,
    });
    await adminApi.request(`/admin/organizations/${registration.organization_id}/approve`, {
      method: "POST",
    });

    const ownerSession = await loginAndReadProfile(publicApi, payload.email, password, payload.organization_name);

    organizations.push({
      blueprint,
      organization: {
        id: registration.organization_id,
        name: payload.organization_name,
      },
      owner: {
        id: registration.user_id,
        email: payload.email,
        password,
        first_name: payload.first_name,
        last_name: payload.last_name,
      },
      ownerSession,
      approvedCurators: [],
      pendingCurators: [],
      studentsByClass: new Map(),
      showcaseStudents: [],
      roadmapEvents: [],
      realEvents: [],
    });

    summary.approvedOrganizations.push({
      id: registration.organization_id,
      name: payload.organization_name,
      owner_email: payload.email,
      owner_password: password,
      approved_curators: [],
      pending_curators: [],
    });
  }

  return organizations;
}

async function createPendingOrganization(publicApi, batch, password, summary) {
  const payload = buildOrganizationPayload(PENDING_ORG_BLUEPRINT, batch, password);
  console.log(`- register pending organization: ${payload.organization_name}`);
  const registration = await publicApi.request("/auth/register/organization", {
    method: "POST",
    auth: false,
    body: payload,
  });

  summary.pendingOrganization = {
    id: registration.organization_id,
    name: payload.organization_name,
    owner_email: payload.email,
    owner_password: password,
  };
}

async function createCurators(publicApi, orgContext, batch, password, summaryEntry) {
  const { ownerSession, organization, blueprint } = orgContext;
  const orgClient = ownerSession.client;

  for (const curatorBlueprint of blueprint.approvedCurators) {
    const payload = buildCuratorPayload(curatorBlueprint, batch, password, organization.id);
    console.log(`- register curator: ${payload.email}`);
    const registration = await publicApi.request("/auth/register/curator", {
      method: "POST",
      auth: false,
      body: payload,
    });

    await orgClient.request(`/edu/organizations/me/curators/${registration.user_id}/class`, {
      method: "PUT",
      body: {
        responsible_class: curatorBlueprint.responsible_class,
      },
    });
    await orgClient.request(`/edu/organizations/me/curators/${registration.user_id}/approve`, {
      method: "POST",
    });

    const curatorSession = await loginAndReadProfile(publicApi, payload.email, password, payload.email);

    orgContext.approvedCurators.push({
      blueprint: curatorBlueprint,
      user: curatorSession.user,
      email: payload.email,
      password,
      session: curatorSession,
    });

    summaryEntry.approved_curators.push({
      email: payload.email,
      password,
      responsible_class: curatorBlueprint.responsible_class,
    });
  }

  const pendingPayload = buildCuratorPayload(blueprint.pendingCurator, batch, password, organization.id);
  console.log(`- register pending curator: ${pendingPayload.email}`);
  const pendingRegistration = await publicApi.request("/auth/register/curator", {
    method: "POST",
    auth: false,
    body: pendingPayload,
  });

  await orgClient.request(`/edu/organizations/me/curators/${pendingRegistration.user_id}/class`, {
    method: "PUT",
    body: {
      responsible_class: blueprint.pendingCurator.responsible_class,
    },
  });

  orgContext.pendingCurators.push({
    id: pendingRegistration.user_id,
    email: pendingPayload.email,
    password,
    responsible_class: blueprint.pendingCurator.responsible_class,
  });

  summaryEntry.pending_curators.push({
    email: pendingPayload.email,
    password,
    responsible_class: blueprint.pendingCurator.responsible_class,
  });
}

async function createStudentsForCurators(orgContext, batch, summary) {
  for (const curator of orgContext.approvedCurators) {
    const className = curator.blueprint.responsible_class;
    const createdStudents = [];
    const studentNames = curator.blueprint.students ?? [];

    console.log(`- create students for ${curator.email} (${className})`);
    for (let studentIndex = 0; studentIndex < studentNames.length; studentIndex += 1) {
      const student = await curator.session.client.request("/edu/students", {
        method: "POST",
        body: buildStudentPayload(studentNames[studentIndex], studentIndex, className),
      });
      createdStudents.push(student);
      summary.counts.students += 1;
    }

    orgContext.studentsByClass.set(className, {
      curator,
      students: createdStudents,
    });
    orgContext.showcaseStudents.push({
      curator,
      student: createdStudents[0],
    });
  }
}

async function createGlobalRoadmapEvents(adminApi, adminUser, orgContexts, academicYear, roadmapYear, dates, batch, summary) {
  const responsibleUserIds = [adminUser.id, ...orgContexts.map((item) => item.ownerSession.user.id)];
  const globalDefinitions = [
    buildGlobalEventPayload({
      title: "Областной конкурс профессий",
      direction: RU.directions.informational,
      academicYear,
      roadmapYear,
      environmentType: "roadmap",
      scheduleMode: "range",
      responsibleUserIds,
      organizer: "Областной центр профориентации",
      eventLevel: "Областной",
      eventFormat: RU.remote,
      participantsCount: 180,
      description: "Общий конкурс по знакомству с профессиями для всех школ.",
      notes: "Тестовые данные",
      startsAt: dates.marchKickoff,
      endsAt: addHours(dates.marchKickoff, 2),
    }),
    buildGlobalEventPayload({
      title: "Областная родительская неделя",
      direction: RU.directions.parents,
      academicYear,
      roadmapYear,
      environmentType: "roadmap",
      scheduleMode: "quarterly",
      responsibleUserIds,
      organizer: "Областной методический центр",
      eventLevel: "Областной",
      eventFormat: RU.remote,
      participantsCount: 90,
      description: "Цикл встреч для родителей по профориентации школьников.",
      notes: "Тестовые данные",
      startsAt: dates.aprilVisit,
      endsAt: addHours(dates.aprilVisit, 1),
    }),
  ];

  for (const payload of globalDefinitions) {
    console.log(`- create global roadmap event: ${payload.title}`);
    await adminApi.request("/edu/events", {
      method: "POST",
      body: payload,
    });
    summary.counts.roadmap_events += orgContexts.length;
  }
}

async function createOrgEvents(orgContext, academicYear, roadmapYear, dates, batch, summary) {
  const orgClient = orgContext.ownerSession.client;
  const ownerUser = orgContext.ownerSession.user;
  const [curatorA, curatorB] = orgContext.approvedCurators;
  const classA = curatorA.blueprint.responsible_class;
  const classB = curatorB.blueprint.responsible_class;
  const schoolName = orgContext.blueprint.title;

  const roadmapDefinitions = [
    buildClassEventPayload({
      title: `Олимпиада по информатике ${classA}`,
      direction: RU.directions.professional,
      academicYear,
      roadmapYear,
      environmentType: "roadmap",
      scheduleMode: "range",
      classNames: [classA],
      responsibleUserIds: [ownerUser.id, curatorA.user.id],
      organizer: "Городской IT-центр",
      eventLevel: "Муниципальный",
      eventFormat: RU.fullTime,
      participantsCount: 24,
      description: `Школьный этап олимпиады по информатике для класса ${classA}.`,
      notes: `Тестовые данные ${schoolName}`,
      startsAt: dates.marchOlympiad,
      endsAt: addHours(dates.marchOlympiad, 3),
    }),
    buildClassEventPayload({
      title: "Конкурс проектов и профессий",
      direction: RU.directions.practice,
      academicYear,
      roadmapYear,
      environmentType: "roadmap",
      scheduleMode: "range",
      classNames: [classA, classB],
      responsibleUserIds: [ownerUser.id, curatorA.user.id, curatorB.user.id],
      organizer: "Технический колледж",
      eventLevel: "Городской",
      eventFormat: RU.fullTime,
      participantsCount: 60,
      description: "Очный конкурс проектов с защитой и знакомством с профессиями.",
      notes: `Тестовые данные ${schoolName}`,
      startsAt: dates.aprilVisit,
      endsAt: addHours(dates.aprilVisit, 4),
    }),
    buildClassEventPayload({
      title: `Профориентационное тестирование ${classB}`,
      direction: RU.directions.diagnostic,
      academicYear,
      roadmapYear,
      environmentType: "roadmap",
      scheduleMode: "quarterly",
      classNames: [classB],
      responsibleUserIds: [curatorB.user.id],
      organizer: "Педагог-психолог",
      eventLevel: "Школьный",
      eventFormat: RU.remote,
      participantsCount: 20,
      description: "Квартальный цикл профориентационной диагностики.",
      notes: `Тестовые данные ${schoolName}`,
      startsAt: dates.aprilWorkshop,
      endsAt: addHours(dates.aprilWorkshop, 2),
    }),
    buildClassEventPayload({
      title: "Родительский клуб профессий",
      direction: RU.directions.parents,
      academicYear,
      roadmapYear,
      environmentType: "roadmap",
      scheduleMode: "whole_year",
      classNames: [classA, classB],
      responsibleUserIds: [ownerUser.id],
      organizer: "Администрация школы",
      eventLevel: "Школьный",
      eventFormat: RU.remote,
      participantsCount: 60,
      description: "Цикл встреч с родителями по вопросам выбора профессии.",
      notes: `Тестовые данные ${schoolName}`,
      startsAt: dates.mayShowcase,
      endsAt: addHours(dates.mayShowcase, 1),
    }),
  ];

  for (const payload of roadmapDefinitions) {
    console.log(`- create roadmap event: ${payload.title}`);
    const created = await orgClient.request("/edu/events", {
      method: "POST",
      body: payload,
    });
    orgContext.roadmapEvents.push(created);
    summary.counts.roadmap_events += 1;
  }

  console.log(`- publish roadmap for ${orgContext.organization.name}`);
  await orgClient.request("/edu/roadmap/publish", {
    method: "POST",
    body: {
      roadmap_year: roadmapYear,
    },
  });

  const manualRealEvents = [
    buildClassEventPayload({
      title: `Олимпиада по математике ${classB}`,
      direction: RU.directions.professional,
      academicYear,
      roadmapYear,
      environmentType: "real",
      scheduleMode: "range",
      classNames: [classB],
      responsibleUserIds: [ownerUser.id, curatorB.user.id],
      organizer: "Муниципальный центр развития",
      eventLevel: "Муниципальный",
      eventFormat: RU.fullTime,
      participantsCount: 21,
      description: `Очная олимпиада по математике для класса ${classB}.`,
      notes: `Тестовые данные ${schoolName}`,
      startsAt: dates.aprilWorkshop,
      endsAt: addHours(dates.aprilWorkshop, 3),
    }),
    buildClassEventPayload({
      title: "Конкурс портфолио достижений",
      direction: RU.directions.informational,
      academicYear,
      roadmapYear,
      environmentType: "real",
      scheduleMode: "range",
      classNames: [classA, classB],
      responsibleUserIds: [ownerUser.id, curatorA.user.id, curatorB.user.id],
      organizer: "Школьный центр карьеры",
      eventLevel: "Школьный",
      eventFormat: RU.remote,
      participantsCount: 40,
      description: "Конкурс ученических портфолио и личных достижений.",
      notes: `Тестовые данные ${schoolName}`,
      startsAt: dates.mayFinal,
      endsAt: addHours(dates.mayFinal, 2),
    }),
  ];

  for (const payload of manualRealEvents) {
    console.log(`- create real event: ${payload.title}`);
    const created = await orgClient.request("/edu/events", {
      method: "POST",
      body: payload,
    });
    orgContext.realEvents.push(created);
    summary.counts.real_events += 1;
  }

  const realEvents = await orgClient.request(
    withQuery("/edu/events", {
      environment_type: "real",
      academic_year: academicYear,
      limit: 200,
    }),
  );

  const publishedBySource = new Map(
    realEvents
      .filter((item) => item.source_roadmap_event_id !== null)
      .map((item) => [item.source_roadmap_event_id, item]),
  );

  for (const roadmapEvent of orgContext.roadmapEvents) {
    const published = publishedBySource.get(roadmapEvent.id);
    if (published) {
      orgContext.realEvents.push(published);
      summary.counts.real_events += 1;
    }
  }
}

function findEventByTitle(events, titlePart) {
  return events.find((item) => item.title.includes(titlePart)) ?? null;
}

async function createParticipation(client, studentId, eventId, mark, notes) {
  const payloadByMark = {
    winner: {
      participation_type: RU.winner,
      status: RU.winner,
      result: RU.winner,
      award_place: 1,
    },
    prize: {
      participation_type: RU.prize,
      status: RU.prize,
      result: RU.prize,
      award_place: 2,
    },
    participant: {
      participation_type: RU.participant,
      status: RU.participant,
      result: RU.participant,
      award_place: null,
    },
  };

  return client.request("/edu/participations", {
    method: "POST",
    body: {
      student_id: studentId,
      event_id: eventId,
      notes,
      ...payloadByMark[mark],
    },
  });
}

async function enrichStudentRecords(orgContext, roadmapYear, dates, summary) {
  const academicYear = `${roadmapYear}/${roadmapYear + 1}`;
  const realEvents = await orgContext.ownerSession.client.request(
    withQuery("/edu/events", {
      environment_type: "real",
      academic_year: academicYear,
      limit: 200,
    }),
  );

  for (const [className, classContext] of orgContext.studentsByClass.entries()) {
    const curatorClient = classContext.curator.session.client;
    const students = classContext.students;
    const [studentOne, studentTwo, studentThree, studentFour, studentFive, studentSix] = students;

    const olympiadEvent =
      findEventByTitle(realEvents, `Олимпиада по информатике ${className}`) ??
      findEventByTitle(realEvents, `Олимпиада по математике ${className}`) ??
      realEvents.find((item) => item.title.includes("Олимпиада"));
    const projectEvent =
      findEventByTitle(realEvents, "Конкурс проектов и профессий") ??
      realEvents.find((item) => item.title.includes("Конкурс проектов"));
    const portfolioEvent =
      findEventByTitle(realEvents, "Конкурс портфолио достижений") ??
      realEvents.find((item) => item.title.includes("Конкурс портфолио"));
    const globalContestEvent =
      findEventByTitle(realEvents, "Областной конкурс профессий") ??
      realEvents.find((item) => item.title.includes("конкурс профессий"));

    if (!olympiadEvent || !projectEvent || !portfolioEvent || !globalContestEvent) {
      throw new Error(`Не удалось подобрать мероприятия для класса ${className}`);
    }

    console.log(`- seed student details for ${className}`);

    const participationPlan = [
      { student: studentOne, event: olympiadEvent, mark: "winner", notes: "Победитель олимпиады" },
      { student: studentTwo, event: olympiadEvent, mark: "prize", notes: "Призер олимпиады" },
      { student: studentThree, event: olympiadEvent, mark: "participant", notes: "Участник олимпиады" },
      { student: studentFour, event: olympiadEvent, mark: "participant", notes: "Участник олимпиады" },
      { student: studentFive, event: olympiadEvent, mark: "participant", notes: "Участник олимпиады" },
      { student: studentSix, event: olympiadEvent, mark: "participant", notes: "Участник олимпиады" },
      { student: studentOne, event: projectEvent, mark: "winner", notes: "Лучшая защита проекта" },
      { student: studentTwo, event: projectEvent, mark: "prize", notes: "Призер конкурса проектов" },
      { student: studentThree, event: projectEvent, mark: "participant", notes: "Участник конкурса проектов" },
      { student: studentFour, event: projectEvent, mark: "participant", notes: "Участник конкурса проектов" },
      { student: studentFive, event: projectEvent, mark: "participant", notes: "Участник конкурса проектов" },
      { student: studentSix, event: projectEvent, mark: "participant", notes: "Участник конкурса проектов" },
      { student: studentOne, event: portfolioEvent, mark: "participant", notes: "Портфолио принято на конкурс" },
      { student: studentTwo, event: portfolioEvent, mark: "participant", notes: "Портфолио принято на конкурс" },
      { student: studentThree, event: portfolioEvent, mark: "participant", notes: "Портфолио принято на конкурс" },
      { student: studentFour, event: portfolioEvent, mark: "participant", notes: "Портфолио принято на конкурс" },
      { student: studentFive, event: portfolioEvent, mark: "prize", notes: "Призер конкурса портфолио" },
      { student: studentSix, event: portfolioEvent, mark: "participant", notes: "Портфолио принято на конкурс" },
      { student: studentOne, event: globalContestEvent, mark: "participant", notes: "Участник областного конкурса" },
      { student: studentTwo, event: globalContestEvent, mark: "participant", notes: "Участник областного конкурса" },
      { student: studentThree, event: globalContestEvent, mark: "participant", notes: "Участник областного конкурса" },
      { student: studentFour, event: globalContestEvent, mark: "participant", notes: "Участник областного конкурса" },
    ];

    for (const item of participationPlan) {
      await createParticipation(curatorClient, item.student.id, item.event.id, item.mark, item.notes);
    }
    summary.counts.participations += participationPlan.length;

    const achievementDates = [
      dates.marchOlympiad.slice(0, 10),
      dates.aprilWorkshop.slice(0, 10),
      dates.mayFinal.slice(0, 10),
    ];

    const achievements = [
      {
        studentId: studentOne.id,
        event_id: olympiadEvent.id,
        event_name: olympiadEvent.title,
        event_type: "Олимпиада",
        achievement: RU.winner,
        achievement_date: achievementDates[0],
        notes: "Победа в олимпиаде.",
      },
      {
        studentId: studentTwo.id,
        event_name: `Олимпиада по информатике ${className}`,
        event_type: RU.olympiad,
        achievement: RU.participant,
        achievement_date: achievementDates[1],
        notes: "Участие в олимпиаде.",
      },
      {
        studentId: studentThree.id,
        event_id: projectEvent.id,
        event_name: projectEvent.title,
        event_type: "Конкурс",
        achievement: "Финалист",
        achievement_date: achievementDates[2],
        notes: "Выход в финал конкурса проектов.",
      },
      {
        studentId: studentFour.id,
        event_id: portfolioEvent.id,
        event_name: portfolioEvent.title,
        event_type: "Конкурс",
        achievement: "Участник",
        achievement_date: achievementDates[2],
        notes: "Участие в конкурсе портфолио.",
      },
      {
        studentId: studentFive.id,
        event_name: `Муниципальный конкурс исследовательских работ ${roadmapYear + 1}`,
        event_type: "Конкурс",
        achievement: "Призер",
        achievement_date: achievementDates[1],
        notes: "Призовое место на муниципальном конкурсе.",
      },
    ];

    for (const achievement of achievements) {
      const { studentId, ...payload } = achievement;
      await curatorClient.request(`/edu/students/${studentId}/achievements`, {
        method: "POST",
        body: payload,
      });
      summary.counts.achievements += 1;
    }

    const researchWorks = [
      {
        studentId: studentOne.id,
        work_title: `Исследовательская работа по информатике ${className}`,
        publication_or_presentation_place: "Школьная научная конференция",
      },
      {
        studentId: studentOne.id,
        work_title: `Проект по математике ${className}`,
        publication_or_presentation_place: "Муниципальный форум школьников",
      },
      {
        studentId: studentTwo.id,
        work_title: `Социальный проект ${className}`,
        publication_or_presentation_place: "Городская выставка проектов",
      },
    ];
    for (const item of researchWorks) {
      const { studentId, ...payload } = item;
      await curatorClient.request(`/edu/students/${studentId}/research-works`, {
        method: "POST",
        body: payload,
      });
      summary.counts.research_works += 1;
    }

    const additionalEducation = [
      {
        studentId: studentOne.id,
        program_name: `Робототехника ${className}`,
        provider_organization: "Дом детского творчества",
      },
      {
        studentId: studentOne.id,
        program_name: `Программирование ${className}`,
        provider_organization: "Центр цифрового образования",
      },
      {
        studentId: studentTwo.id,
        program_name: `3D-моделирование ${className}`,
        provider_organization: "Технопарк школьников",
      },
    ];
    for (const item of additionalEducation) {
      const { studentId, ...payload } = item;
      await curatorClient.request(`/edu/students/${studentId}/additional-education`, {
        method: "POST",
        body: payload,
      });
      summary.counts.additional_education += 1;
    }

    const firstProfessions = [
      {
        studentId: studentOne.id,
        educational_organization: "Политехнический колледж",
        training_program: `Оператор ЭВМ ${className}`,
        study_period: "2025/2026",
        document: `Свидетельство ${className}-01`,
      },
      {
        studentId: studentOne.id,
        educational_organization: "Центр профессионального обучения",
        training_program: `Основы веб-разработки ${className}`,
        study_period: "2025/2026",
        document: `Свидетельство ${className}-02`,
      },
      {
        studentId: studentTwo.id,
        educational_organization: "Колледж сервиса",
        training_program: `Офисное делопроизводство ${className}`,
        study_period: "2025/2026",
        document: `Свидетельство ${className}-03`,
      },
    ];
    for (const item of firstProfessions) {
      const { studentId, ...payload } = item;
      await curatorClient.request(`/edu/students/${studentId}/first-professions`, {
        method: "POST",
        body: payload,
      });
      summary.counts.first_professions += 1;
    }
  }
}

async function writeSummaryFile(outputPath, payload) {
  const absolutePath = path.resolve(process.cwd(), outputPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return absolutePath;
}

function buildSummary({ batch, baseUrl, adminEmail, adminPassword, password, seedDate, academicYear, roadmapYear }) {
  return {
    batch,
    base_url: baseUrl,
    seed_date: seedDate,
    academic_year: academicYear,
    roadmap_year: roadmapYear,
    admin: {
      email: adminEmail,
      password: adminPassword,
    },
    generated_password: password,
    approvedOrganizations: [],
    pendingOrganization: null,
    counts: {
      students: 0,
      roadmap_events: 0,
      real_events: 0,
      participations: 0,
      achievements: 0,
      research_works: 0,
      additional_education: 0,
      first_professions: 0,
    },
  };
}

async function main() {
  ensureNodeFetch();

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const adminEmail = readOption(args, "admin-email", process.env.SEED_ADMIN_EMAIL ?? "admin@admin.com");
  const adminPassword = readOption(args, "admin-password", process.env.SEED_ADMIN_PASSWORD ?? "12345678");
  const password = readOption(args, "password", process.env.SEED_DEFAULT_PASSWORD ?? DEFAULT_PASSWORD);
  const seedDate = parseSeedDate(readOption(args, "seed-date", process.env.SEED_DATE ?? ""));
  const batch = sanitizeForLabel(readOption(args, "batch", process.env.SEED_BATCH ?? buildDefaultBatch(seedDate)));
  const baseUrl = buildBaseUrl({
    baseUrl: readOption(args, "base-url", process.env.SEED_BASE_URL ?? ""),
    host: readOption(args, "host", process.env.SEED_HOST ?? "http://localhost"),
    backendPort: Number(readOption(args, "backend-port", process.env.SEED_BACKEND_PORT ?? "8000")),
  });
  const outputFile = readOption(args, "output", process.env.SEED_OUTPUT_FILE ?? DEFAULT_OUTPUT_FILE);
  const insecure = readFlag(args, "insecure", readFlag(process.env, "SEED_INSECURE_TLS", false));

  if (insecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const academicYear = inferAcademicYear(seedDate);
  const roadmapYear = inferRoadmapYear(seedDate);
  const dates = createWindowDates(roadmapYear);

  console.log(`Seeding demo data against ${baseUrl}`);
  console.log(`Batch: ${batch}`);
  console.log(`Academic year: ${academicYear}`);

  const summary = buildSummary({
    batch,
    baseUrl,
    adminEmail,
    adminPassword,
    password,
    seedDate: seedDate.toISOString().slice(0, 10),
    academicYear,
    roadmapYear,
  });

  const publicApi = new SeedApi({ baseUrl });
  const adminSession = await loginAndReadProfile(publicApi, adminEmail, adminPassword, "admin");

  const orgContexts = await createApprovedOrganizations(publicApi, adminSession.client, batch, password, summary);
  await createPendingOrganization(publicApi, batch, password, summary);

  for (const orgContext of orgContexts) {
    const summaryEntry = summary.approvedOrganizations.find((item) => item.id === orgContext.organization.id);
    await createCurators(publicApi, orgContext, batch, password, summaryEntry);
    await createStudentsForCurators(orgContext, batch, summary);
  }

  await createGlobalRoadmapEvents(
    adminSession.client,
    adminSession.user,
    orgContexts,
    academicYear,
    roadmapYear,
    dates,
    batch,
    summary,
  );

  for (const orgContext of orgContexts) {
    await createOrgEvents(orgContext, academicYear, roadmapYear, dates, batch, summary);
    await enrichStudentRecords(orgContext, roadmapYear, dates, summary);
  }

  const summaryPath = await writeSummaryFile(outputFile, summary);
  console.log(`Seed complete. Summary written to ${summaryPath}`);
}

main().catch((error) => {
  const message =
    error instanceof ApiError
      ? `API error (${error.status}): ${error.message}`
      : error instanceof Error
        ? error.message
        : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
