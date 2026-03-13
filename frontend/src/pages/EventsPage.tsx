import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { EventEditorModal } from "../features/events/EventEditorModal";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Input } from "../shared/ui/Input";
import { MonthCalendar } from "../shared/ui/MonthCalendar";
import { Notice } from "../shared/ui/Notice";
import { SegmentedControl } from "../shared/ui/SegmentedControl";
import { Select } from "../shared/ui/Select";
import { StatusView } from "../shared/ui/StatusView";
import { buildEventPayload, EventEditorForm, formatResponsibleOption, getDefaultEventForm, getEventFormFromItem } from "../shared/utils/events";
import { getEventAudienceLabel, getEventExecutionLabel, inferAcademicYear } from "../shared/utils/roadmap";
import type {
  ClassProfile,
  EventCreatePayload,
  EventItem,
  EventListParams,
  EventUpdatePayload,
  Organization,
  User,
} from "../types/models";

type PageState = "loading" | "ready" | "error";
type EventModal = { mode: "create" | "edit"; event?: EventItem } | null;
type EventFilters = {
  organization_id: string;
  on_date: string;
  responsible_user_id: string;
  academic_year: string;
};

const getDefaultFilters = (user: User | null): EventFilters => ({
  organization_id: user?.role === "admin" ? "" : user?.organization_id ? String(user.organization_id) : "",
  on_date: "",
  responsible_user_id: "",
  academic_year: "",
});

export const EventsPage = () => {
  const { user } = useAuth();
  const canManageEvents = user?.role === "admin" || user?.role === "organization";

  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [filters, setFilters] = useState<EventFilters>(getDefaultFilters(user));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [filterResponsibles, setFilterResponsibles] = useState<User[]>([]);

  const [eventModal, setEventModal] = useState<EventModal>(null);
  const [eventForm, setEventForm] = useState<EventEditorForm>(getDefaultEventForm(user?.organization_id));
  const [classProfiles, setClassProfiles] = useState<ClassProfile[]>([]);
  const [editorResponsibles, setEditorResponsibles] = useState<User[]>([]);
  const [savingEvent, setSavingEvent] = useState(false);

  useEffect(() => {
    setFilters(getDefaultFilters(user));
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
      const organizationId = sourceFilters.organization_id ? Number(sourceFilters.organization_id) : undefined;
      const [eventsResult, orgsResult, responsiblesResult] = await Promise.all([
        api.events.list(buildListParams(sourceFilters)),
        api.orgs.list(),
        api.events.listResponsibleUsers(organizationId),
      ]);
      setEvents(eventsResult);
      setOrganizations(orgsResult);
      setFilterResponsibles(responsiblesResult);
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить мероприятия");
    }
  };

  const loadEditorOptions = async (targetOrgId: string, isAllOrganizations: boolean) => {
    try {
      const numericOrgId = targetOrgId ? Number(targetOrgId) : undefined;
      const [profilesResult, responsiblesResult] = await Promise.all([
        isAllOrganizations || !numericOrgId ? Promise.resolve<ClassProfile[]>([]) : api.orgs.listClassProfiles(numericOrgId),
        api.events.listResponsibleUsers(isAllOrganizations ? undefined : numericOrgId),
      ]);
      setClassProfiles(profilesResult);
      setEditorResponsibles(responsiblesResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные формы");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const organizationId = filters.organization_id ? Number(filters.organization_id) : undefined;
    void api.events
      .listResponsibleUsers(organizationId)
      .then((result) => setFilterResponsibles(result))
      .catch(() => undefined);
  }, [filters.organization_id]);

  useEffect(() => {
    if (!eventModal) {
      return;
    }
    void loadEditorOptions(eventForm.organization_id, eventForm.is_all_organizations);
  }, [eventModal, eventForm.organization_id, eventForm.is_all_organizations]);

  const sortedEvents = useMemo(
    () => events.slice().sort((left, right) => left.starts_at.localeCompare(right.starts_at)),
    [events],
  );

  const organizationOptions = useMemo(
    () => [{ value: "", label: "Все организации" }, ...organizations.map((organization) => ({ value: String(organization.id), label: organization.name }))],
    [organizations],
  );

  const responsibleOptions = useMemo(
    () => [
      { value: "", label: "Все ответственные" },
      ...filterResponsibles.map((user) => ({ value: String(user.id), label: formatResponsibleOption(user) })),
    ],
    [filterResponsibles],
  );

  const organizationNameById = useMemo(
    () => Object.fromEntries(organizations.map((organization) => [organization.id, organization.name])),
    [organizations],
  );

  const openCreate = () => {
    const nextForm = getDefaultEventForm(
      user?.role === "admin" ? (filters.organization_id ? Number(filters.organization_id) : organizations[0]?.id ?? null) : user?.organization_id,
    );
    nextForm.academic_year = inferAcademicYear();
    setEventForm(nextForm);
    setEventModal({ mode: "create" });
  };

  const openEdit = (event: EventItem) => {
    if (!canManageEvents) {
      return;
    }
    setEventForm(getEventFormFromItem(event));
    setEventModal({ mode: "edit", event });
  };

  const closeModal = () => {
    setEventModal(null);
    setSavingEvent(false);
  };

  const submitEvent = async (event: FormEvent) => {
    event.preventDefault();
    setSavingEvent(true);
    setError(null);
    setNotice(null);

    try {
      const payload = buildEventPayload(eventForm) as EventCreatePayload;

      if (eventModal?.mode === "edit" && eventModal.event) {
        const { organization_id: _organizationId, is_all_organizations: _isAll, ...updatePayload } = payload;
        await api.events.update(eventModal.event.id, updatePayload as EventUpdatePayload);
        setNotice("Мероприятие обновлено");
      } else {
        await api.events.create(payload);
        setNotice(eventForm.is_all_organizations ? "Мероприятие добавлено для всех ОО" : "Мероприятие добавлено");
      }

      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить мероприятие");
    } finally {
      setSavingEvent(false);
    }
  };

  const removeEvent = async (eventItem: EventItem) => {
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

  const resetFilters = async () => {
    const next = getDefaultFilters(user);
    setFilters(next);
    await load(next);
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
        title="Мероприятия"
        subtitle="Список и календарь мероприятий с редактированием"
        actions={
          <div className="card-actions">
            <SegmentedControl
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "table", label: "Список" },
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
              onChange={(event) => setFilters((prev) => ({ ...prev, organization_id: event.target.value, responsible_user_id: "" }))}
              options={organizationOptions}
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
            options={responsibleOptions}
          />
          <Button variant="secondary" onClick={() => void load(filters)}>
            Применить
          </Button>
          <Button variant="ghost" onClick={() => void resetFilters()}>
            Сбросить
          </Button>
        </div>

        {sortedEvents.length === 0 ? (
          <StatusView state="empty" title="Мероприятий пока нет" description="Создайте первое мероприятие или снимите часть фильтров." />
        ) : viewMode === "table" ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Мероприятие</th>
                  <th>Направление</th>
                  <th>Сроки</th>
                  <th>Ответственные</th>
                  <th>Целевая аудитория</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      {user?.role === "admin" && !filters.organization_id ? (
                        <span className="table__meta">{organizationNameById[event.organization_id] ?? `ОО #${event.organization_id}`}</span>
                      ) : null}
                      <span className="table__meta">{event.event_type}</span>
                      {event.description ? <span className="table__meta">{event.description}</span> : null}
                    </td>
                    <td>{event.roadmap_direction}</td>
                    <td>{getEventExecutionLabel(event)}</td>
                    <td>
                      {event.responsible_employees.length > 0
                        ? event.responsible_employees.map((employee) => `${employee.last_name} ${employee.first_name}`).join(", ")
                        : event.organizer || "-"}
                    </td>
                    <td>{getEventAudienceLabel(event)}</td>
                    <td>
                      {canManageEvents ? (
                        <div className="row-actions">
                          <Button size="sm" variant="secondary" onClick={() => openEdit(event)}>
                            Изменить
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => void removeEvent(event)}>
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
        <EventEditorModal
          mode={eventModal.mode}
          form={eventForm}
          organizations={organizations}
          classProfiles={classProfiles}
          responsibleUsers={editorResponsibles}
          saving={savingEvent}
          showOrganizationSelect={user?.role === "admin" && eventModal.mode === "create" && !eventForm.is_all_organizations}
          canSetGlobal={user?.role === "admin" && eventModal.mode === "create"}
          onChange={(patch) => setEventForm((prev) => ({ ...prev, ...patch }))}
          onClose={closeModal}
          onSubmit={submitEvent}
        />
      ) : null}
    </div>
  );
};
