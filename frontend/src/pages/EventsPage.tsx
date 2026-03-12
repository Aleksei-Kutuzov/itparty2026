import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Input } from "../shared/ui/Input";
import { Modal } from "../shared/ui/Modal";
import { MonthCalendar } from "../shared/ui/MonthCalendar";
import { Notice } from "../shared/ui/Notice";
import { SegmentedControl } from "../shared/ui/SegmentedControl";
import { Select } from "../shared/ui/Select";
import { StatusView } from "../shared/ui/StatusView";
import { TextArea } from "../shared/ui/TextArea";
import { formatDateTime, formatInputDateTime, fromInputDateTime } from "../shared/utils/date";
import { downloadBlob } from "../shared/utils/download";
import type { EventItem, EventListParams, Organization, RoadmapDirection, User } from "../types/models";

type PageState = "loading" | "ready" | "error";

type EventForm = {
  title: string;
  event_type: string;
  roadmap_direction: RoadmapDirection;
  academic_year: string;
  target_class_name: string;
  organizer: string;
  event_level: string;
  event_format: string;
  participants_count: string;
  target_audience: string;
  description: string;
  notes: string;
  responsible_user_ids: string;
  starts_at: string;
  ends_at: string;
  organization_id: string;
};

type EventFilters = {
  organization_id: string;
  on_date: string;
  responsible_user_id: string;
  academic_year: string;
};

type EventModal = {
  mode: "create" | "edit";
  event?: EventItem;
};

const ROADMAP_OPTIONS: Array<{ value: RoadmapDirection; label: string }> = [
  { value: "Профессиональное просвещение", label: "Профессиональное просвещение" },
  { value: "Практико-ориентированное направление", label: "Практико-ориентированное направление" },
  { value: "Диагностическое направление", label: "Диагностическое направление" },
  { value: "Работа с родителями", label: "Работа с родителями" },
  { value: "Информационное направление", label: "Информационное направление" },
];

const inferAcademicYear = (iso?: string): string => {
  const date = iso ? new Date(iso) : new Date();
  const startYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
};

const parseResponsibleUserIds = (raw: string): number[] => {
  const ids = raw
    .split(/[,\s]+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
};

const formatUserName = (user: Pick<User, "last_name" | "first_name" | "patronymic">): string =>
  [user.last_name, user.first_name, user.patronymic].filter(Boolean).join(" ");

const getDefaultEventForm = (): EventForm => {
  const start = new Date();
  const end = new Date(start.getTime() + 3600000);
  return {
    title: "",
    event_type: "Олимпиада",
    roadmap_direction: ROADMAP_OPTIONS[0].value,
    academic_year: inferAcademicYear(start.toISOString()),
    target_class_name: "",
    organizer: "",
    event_level: "",
    event_format: "",
    participants_count: "",
    target_audience: "",
    description: "",
    notes: "",
    responsible_user_ids: "",
    starts_at: formatInputDateTime(start.toISOString()),
    ends_at: formatInputDateTime(end.toISOString()),
    organization_id: "",
  };
};

const fromEvent = (event: EventItem): EventForm => ({
  title: event.title,
  event_type: event.event_type,
  roadmap_direction: event.roadmap_direction,
  academic_year: event.academic_year || inferAcademicYear(event.starts_at),
  target_class_name: event.target_class_name ?? "",
  organizer: event.organizer ?? "",
  event_level: event.event_level ?? "",
  event_format: event.event_format ?? "",
  participants_count: event.participants_count ? String(event.participants_count) : "",
  target_audience: event.target_audience ?? "",
  description: event.description ?? "",
  notes: event.notes ?? "",
  responsible_user_ids: event.responsible_user_ids.join(", "),
  starts_at: formatInputDateTime(event.starts_at),
  ends_at: formatInputDateTime(event.ends_at),
  organization_id: String(event.organization_id),
});

const getDefaultFilters = (user: User | null): EventFilters => ({
  organization_id: user?.role === "admin" ? "" : user?.organization_id ? String(user.organization_id) : "",
  on_date: "",
  responsible_user_id: "",
  academic_year: "",
});

const formatEventResponsibles = (event: EventItem): string => {
  if (event.responsible_employees.length > 0) {
    return event.responsible_employees.map((item) => formatUserName(item)).join(", ");
  }
  return event.organizer || "-";
};

export const EventsPage = () => {
  const { user } = useAuth();
  const canManageEvents = user?.role === "admin" || user?.role === "organization";

  const [events, setEvents] = useState<EventItem[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [availableResponsibles, setAvailableResponsibles] = useState<User[]>([]);
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [filters, setFilters] = useState<EventFilters>(getDefaultFilters(user));
  const [roadmapAcademicYear, setRoadmapAcademicYear] = useState(inferAcademicYear());
  const [roadmapOrganizationId, setRoadmapOrganizationId] = useState(user?.organization_id ? String(user.organization_id) : "");
  const [exportingRoadmap, setExportingRoadmap] = useState(false);

  const [eventModal, setEventModal] = useState<EventModal | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(getDefaultEventForm());
  const [savingEvent, setSavingEvent] = useState(false);

  useEffect(() => {
    setFilters(getDefaultFilters(user));
    if (user?.organization_id && user.role !== "admin") {
      setRoadmapOrganizationId(String(user.organization_id));
    }
  }, [user]);

  const buildListParams = (source: EventFilters): EventListParams => ({
    organization_id: source.organization_id ? Number(source.organization_id) : undefined,
    on_date: source.on_date || undefined,
    responsible_user_id: source.responsible_user_id ? Number(source.responsible_user_id) : undefined,
    academic_year: source.academic_year.trim() || undefined,
  });

  const load = async (sourceFilters: EventFilters = filters) => {
    setState("loading");
    setError(null);
    try {
      const curatorsPromise =
        user?.role === "organization" ? api.organization.listCurators() : Promise.resolve<User[]>([]);
      const [eventsResult, orgsResult, curators] = await Promise.all([
        api.events.list(buildListParams(sourceFilters)),
        api.orgs.list(),
        curatorsPromise,
      ]);

      setEvents(eventsResult);
      setOrganizations(orgsResult);

      const mergedResponsibles = [...curators];
      if (
        user &&
        user.organization_id &&
        (user.role === "organization" || user.role === "curator") &&
        !mergedResponsibles.some((item) => item.id === user.id)
      ) {
        mergedResponsibles.push(user);
      }

      mergedResponsibles.sort((a, b) => formatUserName(a).localeCompare(formatUserName(b)));
      setAvailableResponsibles(mergedResponsibles);
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [events]);

  const eventOrgOptions = useMemo(
    () => [{ value: "", label: "Все организации" }, ...organizations.map((org) => ({ value: String(org.id), label: org.name }))],
    [organizations],
  );

  const roadmapOrgOptions = useMemo(
    () => organizations.map((org) => ({ value: String(org.id), label: org.name })),
    [organizations],
  );

  const responsibleFilterOptions = useMemo(
    () => [
      { value: "", label: "Все ответственные" },
      ...availableResponsibles.map((item) => ({ value: String(item.id), label: formatUserName(item) })),
    ],
    [availableResponsibles],
  );

  const eventResponsibleOptions = useMemo(
    () => availableResponsibles.map((item) => ({ value: String(item.id), label: formatUserName(item) })),
    [availableResponsibles],
  );

  const selectedResponsibleIds = useMemo(
    () => new Set(parseResponsibleUserIds(eventForm.responsible_user_ids)),
    [eventForm.responsible_user_ids],
  );

  const openCreate = () => {
    const defaultForm = getDefaultEventForm();
    setEventModal({ mode: "create" });
    setEventForm({
      ...defaultForm,
      organization_id: user?.organization_id
        ? String(user.organization_id)
        : filters.organization_id || (organizations[0] ? String(organizations[0].id) : ""),
    });
  };

  const openEdit = (event: EventItem) => {
    if (!canManageEvents) {
      return;
    }
    setEventModal({ mode: "edit", event });
    setEventForm(fromEvent(event));
  };

  const closeEventModal = () => {
    setEventModal(null);
    setSavingEvent(false);
  };

  const toggleResponsible = (responsibleId: number) => {
    const nextSet = new Set(parseResponsibleUserIds(eventForm.responsible_user_ids));
    if (nextSet.has(responsibleId)) {
      nextSet.delete(responsibleId);
    } else {
      nextSet.add(responsibleId);
    }
    const nextValue = Array.from(nextSet)
      .sort((a, b) => a - b)
      .join(", ");
    setEventForm((prev) => ({ ...prev, responsible_user_ids: nextValue }));
  };

  const submitEvent = async (event: FormEvent) => {
    event.preventDefault();
    setSavingEvent(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        title: eventForm.title.trim(),
        event_type: eventForm.event_type.trim(),
        roadmap_direction: eventForm.roadmap_direction,
        academic_year: eventForm.academic_year.trim() || null,
        target_class_name: eventForm.target_class_name.trim() || null,
        organizer: eventForm.organizer.trim() || null,
        event_level: eventForm.event_level.trim() || null,
        event_format: eventForm.event_format.trim() || null,
        participants_count: eventForm.participants_count.trim() ? Number(eventForm.participants_count) : null,
        target_audience: eventForm.target_audience.trim() || null,
        description: eventForm.description.trim() || null,
        notes: eventForm.notes.trim() || null,
        responsible_user_ids: parseResponsibleUserIds(eventForm.responsible_user_ids),
        starts_at: fromInputDateTime(eventForm.starts_at),
        ends_at: fromInputDateTime(eventForm.ends_at),
        organization_id: eventForm.organization_id ? Number(eventForm.organization_id) : undefined,
      };

      if (eventModal?.mode === "edit" && eventModal.event) {
        await api.events.update(eventModal.event.id, payload);
        setNotice("Мероприятие обновлено");
      } else {
        await api.events.create(payload);
        setNotice("Мероприятие добавлено");
      }
      closeEventModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить мероприятие");
    } finally {
      setSavingEvent(false);
    }
  };

  const doDelete = async (eventItem: EventItem) => {
    if (!window.confirm(`Удалить мероприятие «${eventItem.title}»?`)) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.events.remove(eventItem.id);
      setNotice("Мероприятие удалено");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить мероприятие");
    }
  };

  const applyFilters = async () => {
    await load(filters);
  };

  const resetFilters = async () => {
    const next = getDefaultFilters(user);
    setFilters(next);
    await load(next);
  };

  const exportRoadmap = async () => {
    setExportingRoadmap(true);
    setError(null);
    setNotice(null);
    try {
      const academicYear = roadmapAcademicYear.trim();
      if (!academicYear) {
        throw new Error("Укажите учебный год");
      }
      const organizationId =
        user?.role === "admin"
          ? roadmapOrganizationId
            ? Number(roadmapOrganizationId)
            : undefined
          : user?.organization_id ?? undefined;

      if (user?.role === "admin" && !organizationId) {
        throw new Error("Для выгрузки администратором нужно выбрать организацию");
      }

      const blob = await api.events.exportRoadmap({
        academic_year: academicYear,
        organization_id: organizationId,
      });

      const orgSuffix = organizationId ? `_org-${organizationId}` : "";
      const safeYear = academicYear.replace("/", "-");
      downloadBlob(blob, `roadmap${orgSuffix}_${safeYear}.docx`);
      setNotice("Дорожная карта выгружена");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выгрузить дорожную карту");
    } finally {
      setExportingRoadmap(false);
    }
  };

  if (state === "loading") {
    return <StatusView state="loading" title="Загружаем мероприятия" description="Подготавливаем список и календарь." />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка загрузки" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid events-page">
      <div className="events-page__alerts" aria-live="polite" aria-atomic="true">
        {error ? <Notice tone="error" text={error} /> : null}
        {notice ? <Notice tone="success" text={notice} /> : null}
      </div>

      <Card
        title="Дорожная карта"
        subtitle="Выгрузка DOCX для выбранного учебного года"
        actions={
          <div className="card-actions">
            {user?.role === "admin" ? (
              <Select
                label="Организация"
                value={roadmapOrganizationId}
                onChange={(event) => setRoadmapOrganizationId(event.target.value)}
                options={roadmapOrgOptions}
              />
            ) : null}
            <Input
              label="Учебный год"
              placeholder="2025/2026"
              value={roadmapAcademicYear}
              onChange={(event) => setRoadmapAcademicYear(event.target.value)}
            />
            <Button onClick={() => void exportRoadmap()} disabled={exportingRoadmap}>
              {exportingRoadmap ? "Выгружаем..." : "Выгрузить DOCX"}
            </Button>
          </div>
        }
      />

      <Card
        title="План мероприятий"
        subtitle="Добавление, фильтрация и редактирование событий"
        actions={
          <div className="card-actions">
            <SegmentedControl
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "table", label: "Таблица" },
                { value: "calendar", label: "Календарь" },
              ]}
            />
            {canManageEvents ? <Button onClick={openCreate}>Добавить мероприятие</Button> : null}
          </div>
        }
      >
        <div className="inline-controls">
          {user?.role === "admin" ? (
            <Select
              label="Организация"
              value={filters.organization_id}
              onChange={(event) => setFilters((prev) => ({ ...prev, organization_id: event.target.value }))}
              options={eventOrgOptions}
            />
          ) : null}
          <Input
            label="Дата"
            type="date"
            value={filters.on_date}
            onChange={(event) => setFilters((prev) => ({ ...prev, on_date: event.target.value }))}
          />
          <Input
            label="Учебный год"
            placeholder="2025/2026"
            value={filters.academic_year}
            onChange={(event) => setFilters((prev) => ({ ...prev, academic_year: event.target.value }))}
          />
          <Select
            label="Ответственный"
            value={filters.responsible_user_id}
            onChange={(event) => setFilters((prev) => ({ ...prev, responsible_user_id: event.target.value }))}
            options={responsibleFilterOptions}
          />
          <Button variant="secondary" onClick={() => void applyFilters()}>
            Применить
          </Button>
          <Button variant="ghost" onClick={() => void resetFilters()}>
            Сбросить
          </Button>
        </div>

        {sortedEvents.length === 0 ? (
          <StatusView state="empty" title="План пока пуст" description="Создайте первое мероприятие." />
        ) : viewMode === "table" ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Мероприятие</th>
                  <th>Направление</th>
                  <th>Период</th>
                  <th>Ответственные</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      <p className="table__meta">{event.description || "Без описания"}</p>
                      <p className="table__meta">Целевая аудитория: {event.target_audience || event.target_class_name || "-"}</p>
                    </td>
                    <td>{event.roadmap_direction}</td>
                    <td>
                      {formatDateTime(event.starts_at)} - {formatDateTime(event.ends_at)}
                    </td>
                    <td>{formatEventResponsibles(event)}</td>
                    <td>
                      {canManageEvents ? (
                        <div className="row-actions">
                          <Button size="sm" variant="secondary" onClick={() => openEdit(event)}>
                            Изменить
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => void doDelete(event)}>
                            Удалить
                          </Button>
                        </div>
                      ) : (
                        <span className="table__meta">Только просмотр</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <MonthCalendar
            month={calendarMonth}
            events={sortedEvents}
            onMonthShift={(delta) => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))}
            onEventClick={canManageEvents ? openEdit : undefined}
          />
        )}
      </Card>

      {eventModal ? (
        <Modal title={eventModal.mode === "create" ? "Новое мероприятие" : "Редактирование мероприятия"} onClose={closeEventModal} width="lg">
          <form className="form-grid form-grid--two" onSubmit={submitEvent}>
            <Input
              label="Название"
              required
              value={eventForm.title}
              onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <Input
              label="Тип"
              required
              value={eventForm.event_type}
              onChange={(event) => setEventForm((prev) => ({ ...prev, event_type: event.target.value }))}
            />
            <Select
              label="Направление дорожной карты"
              value={eventForm.roadmap_direction}
              onChange={(event) =>
                setEventForm((prev) => ({ ...prev, roadmap_direction: event.target.value as RoadmapDirection }))
              }
              options={ROADMAP_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
            />
            <Input
              label="Учебный год"
              placeholder="2025/2026"
              value={eventForm.academic_year}
              onChange={(event) => setEventForm((prev) => ({ ...prev, academic_year: event.target.value }))}
            />
            <Input
              label="Класс"
              value={eventForm.target_class_name}
              onChange={(event) => setEventForm((prev) => ({ ...prev, target_class_name: event.target.value }))}
            />
            <Input
              label="Целевая аудитория"
              value={eventForm.target_audience}
              onChange={(event) => setEventForm((prev) => ({ ...prev, target_audience: event.target.value }))}
            />
            <Input
              label="Организатор"
              value={eventForm.organizer}
              onChange={(event) => setEventForm((prev) => ({ ...prev, organizer: event.target.value }))}
            />
            <Input
              label="Уровень"
              value={eventForm.event_level}
              onChange={(event) => setEventForm((prev) => ({ ...prev, event_level: event.target.value }))}
            />
            <Input
              label="Формат"
              value={eventForm.event_format}
              onChange={(event) => setEventForm((prev) => ({ ...prev, event_format: event.target.value }))}
            />
            <Input
              label="Количество участников"
              type="number"
              min={0}
              value={eventForm.participants_count}
              onChange={(event) => setEventForm((prev) => ({ ...prev, participants_count: event.target.value }))}
            />
            <Input
              label="Ответственные (ID через запятую)"
              value={eventForm.responsible_user_ids}
              onChange={(event) => setEventForm((prev) => ({ ...prev, responsible_user_ids: event.target.value }))}
            />
            <Select
              label="Организация"
              value={eventForm.organization_id}
              onChange={(event) => setEventForm((prev) => ({ ...prev, organization_id: event.target.value }))}
              options={eventOrgOptions}
            />
            <Input
              label="Начало"
              type="datetime-local"
              required
              value={eventForm.starts_at}
              onChange={(event) => setEventForm((prev) => ({ ...prev, starts_at: event.target.value }))}
            />
            <Input
              label="Окончание"
              type="datetime-local"
              required
              value={eventForm.ends_at}
              onChange={(event) => setEventForm((prev) => ({ ...prev, ends_at: event.target.value }))}
            />
            {eventResponsibleOptions.length > 0 ? (
              <div className="form-grid__full">
                <p className="field__label">Быстрый выбор ответственных</p>
                <div className="row-actions">
                  {eventResponsibleOptions.map((item) => {
                    const id = Number(item.value);
                    return (
                      <Button
                        key={item.value}
                        type="button"
                        size="sm"
                        variant={selectedResponsibleIds.has(id) ? "primary" : "secondary"}
                        onClick={() => toggleResponsible(id)}
                      >
                        {item.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <TextArea
              label="Описание"
              className="form-grid__full"
              value={eventForm.description}
              onChange={(event) => setEventForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <TextArea
              label="Примечания"
              className="form-grid__full"
              value={eventForm.notes}
              onChange={(event) => setEventForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeEventModal}>
                Закрыть
              </Button>
              <Button type="submit" disabled={savingEvent}>
                {savingEvent ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
};
