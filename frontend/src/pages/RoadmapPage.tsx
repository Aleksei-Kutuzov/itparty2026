import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { EventEditorModal } from "../features/events/EventEditorModal";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Notice } from "../shared/ui/Notice";
import { SegmentedControl } from "../shared/ui/SegmentedControl";
import { Select } from "../shared/ui/Select";
import { StatusView } from "../shared/ui/StatusView";
import { downloadBlob } from "../shared/utils/download";
import { buildEventPayload, EventEditorForm, getDefaultEventForm, getEventFormFromItem } from "../shared/utils/events";
import {
  getRoadmapYearOptions,
  getEventAudienceLabel,
  getEventExecutionLabel,
  inferRoadmapYear,
  roadmapYearToAcademicYear,
  ROADMAP_OPTIONS,
} from "../shared/utils/roadmap";
import type { ClassProfile, EventCreatePayload, EventItem, EventUpdatePayload, Organization, User } from "../types/models";

type PageState = "loading" | "ready" | "error";
type EventModal = { mode: "create" | "edit"; event?: EventItem } | null;
type SectionMode = "general" | "organization";

const canManageRoadmap = (role?: string | null) => role === "admin" || role === "organization";

export const RoadmapPage = () => {
  const { user } = useAuth();
  const editable = canManageRoadmap(user?.role);

  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [classProfiles, setClassProfiles] = useState<ClassProfile[]>([]);
  const [responsibleUsers, setResponsibleUsers] = useState<User[]>([]);

  const [organizationId, setOrganizationId] = useState(user?.organization_id ? String(user.organization_id) : "");
  const [roadmapYear, setRoadmapYear] = useState(String(inferRoadmapYear()));
  const [sectionMode, setSectionMode] = useState<SectionMode>("general");
  const [eventModal, setEventModal] = useState<EventModal>(null);
  const [eventForm, setEventForm] = useState<EventEditorForm>(
    getDefaultEventForm({
      organizationId: user?.organization_id,
      environmentType: "roadmap",
      roadmapYear: inferRoadmapYear(),
    }),
  );
  const [savingEvent, setSavingEvent] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (user?.organization_id && user.role !== "admin") {
      setOrganizationId(String(user.organization_id));
    }
  }, [user]);

  const loadRoadmap = async (targetOrgId = organizationId, targetRoadmapYear = roadmapYear) => {
    setState("loading");
    setError(null);
    try {
      const [orgsResult, eventsResult] = await Promise.all([
        api.orgs.list(),
        api.events.list({
          organization_id: targetOrgId ? Number(targetOrgId) : undefined,
          environment_type: "roadmap",
          roadmap_year: targetRoadmapYear.trim() ? Number(targetRoadmapYear) : undefined,
        }),
      ]);
      setOrganizations(orgsResult);
      setEvents(eventsResult);
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить дорожную карту");
    }
  };

  const loadEditorOptions = async (targetOrgId: string, isAllOrganizations: boolean) => {
    try {
      const numericOrgId = targetOrgId ? Number(targetOrgId) : undefined;
      const [profilesResult, responsibleResult] = await Promise.all([
        isAllOrganizations || !numericOrgId ? Promise.resolve<ClassProfile[]>([]) : api.orgs.listClassProfiles(numericOrgId),
        api.events.listResponsibleUsers(isAllOrganizations ? undefined : numericOrgId),
      ]);
      setClassProfiles(profilesResult);
      setResponsibleUsers(responsibleResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные формы");
    }
  };

  useEffect(() => {
    void loadRoadmap();
  }, []);

  useEffect(() => {
    if (!eventModal) {
      return;
    }
    void loadEditorOptions(eventForm.organization_id, eventForm.is_all_organizations);
  }, [eventModal, eventForm.organization_id, eventForm.is_all_organizations]);

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, EventItem[]>();
    ROADMAP_OPTIONS.forEach((item) => groups.set(item.value, []));
    events
      .filter((event) => (sectionMode === "general" ? event.is_all_organizations : !event.is_all_organizations))
      .slice()
      .sort((left, right) => left.title.localeCompare(right.title, "ru"))
      .forEach((event) => {
        const bucket = groups.get(event.roadmap_direction) ?? [];
        bucket.push(event);
        groups.set(event.roadmap_direction, bucket);
      });
    return ROADMAP_OPTIONS.map((item) => ({
      direction: item.value,
      items: groups.get(item.value) ?? [],
    }));
  }, [events, sectionMode]);

  const organizationNameById = useMemo(
    () => Object.fromEntries(organizations.map((organization) => [organization.id, organization.name])),
    [organizations],
  );

  const openCreate = () => {
    const nextForm = getDefaultEventForm(
      {
        organizationId:
          user?.role === "admin" ? (organizationId ? Number(organizationId) : organizations[0]?.id ?? null) : user?.organization_id,
        environmentType: "roadmap",
        roadmapYear: roadmapYear.trim() ? Number(roadmapYear) : inferRoadmapYear(),
      },
    );
    nextForm.is_all_organizations = sectionMode === "general" && user?.role === "admin";
    setEventForm(nextForm);
    setEventModal({ mode: "create" });
  };

  const openEdit = (event: EventItem) => {
    if (!editable) {
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
      await loadRoadmap();
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
      await loadRoadmap();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить мероприятие");
    }
  };

  const exportRoadmap = async () => {
    setExporting(true);
    setError(null);
    setNotice(null);

    try {
      if (user?.role === "admin" && !organizationId) {
        throw new Error("Для выгрузки выберите организацию");
      }

      const blob = await api.events.exportRoadmap({
        academic_year: roadmapYearToAcademicYear(Number(roadmapYear)),
        organization_id: organizationId ? Number(organizationId) : undefined,
      });
      const safeYear = roadmapYear;
      downloadBlob(blob, `roadmap_${organizationId || "current"}_${safeYear}.docx`);
      setNotice("Дорожная карта выгружена");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выгрузить дорожную карту");
    } finally {
      setExporting(false);
    }
  };

  const publishRoadmap = async () => {
    setPublishing(true);
    setError(null);
    setNotice(null);

    try {
      if (user?.role === "admin" && !organizationId) {
        throw new Error("Для публикации выберите организацию");
      }

      const result = await api.events.publishRoadmap({
        roadmap_year: Number(roadmapYear),
        organization_id: organizationId ? Number(organizationId) : undefined,
      });

      setNotice(
        result.created_count === 0 && result.skipped_count > 0
          ? "Все записи дорожной карты уже опубликованы"
          : `Опубликовано мероприятий: ${result.created_count}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось опубликовать дорожную карту");
    } finally {
      setPublishing(false);
    }
  };

  if (!editable) {
    return <StatusView state="empty" title="Раздел недоступен" description="Дорожная карта доступна только администратору и ОО." />;
  }

  if (state === "loading") {
    return <StatusView state="loading" title="Загружаем дорожную карту" description="Подготавливаем мероприятия учебного года." />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка загрузки" description={error ?? undefined} onRetry={() => void loadRoadmap()} />;
  }

  return (
    <div className="page-grid roadmap-page">
      <div className="events-page__alerts" aria-live="polite" aria-atomic="true">
        {error ? <Notice tone="error" text={error} /> : null}
        {notice ? <Notice tone="success" text={notice} /> : null}
      </div>

      <Card
        title="Дорожная карта"
        subtitle="Учебный год и мероприятия по направлениям"
        actions={
          <div className="card-actions">
            <SegmentedControl
              value={sectionMode}
              onChange={setSectionMode}
              options={[
                { value: "general", label: "Общие разделы" },
                { value: "organization", label: "Разделы организаций" },
              ]}
            />
            {user?.role === "admin" ? (
              <Select
                label="Организация"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                options={[
                  { value: "", label: "Все организации" },
                  ...organizations.map((organization) => ({
                    value: String(organization.id),
                    label: organization.name,
                  })),
                ]}
              />
            ) : null}
            <Select
              label="Год дорожной карты"
              value={roadmapYear}
              onChange={(event) => setRoadmapYear(event.target.value)}
              options={getRoadmapYearOptions(Number(roadmapYear))}
            />
            <Button variant="secondary" onClick={() => void loadRoadmap()}>
              Показать
            </Button>
            <Button onClick={() => void exportRoadmap()} disabled={exporting}>
              {exporting ? "Выгружаем..." : "Выгрузить DOCX"}
            </Button>
            <Button onClick={() => void publishRoadmap()} disabled={publishing}>
              {publishing ? "Публикуем..." : "Опубликовать"}
            </Button>
            <Button onClick={openCreate} disabled={sectionMode === "general" && user?.role !== "admin"}>
              Добавить мероприятие
            </Button>
          </div>
        }
      />

      {groupedEvents.every((group) => group.items.length === 0) ? (
        <StatusView state="empty" title="Дорожная карта пуста" description="Добавьте первое мероприятие для выбранного учебного года." />
      ) : (
        groupedEvents.map((group) => (
          <Card key={group.direction} title={group.direction}>
            {group.items.length === 0 ? (
              <StatusView state="empty" title="Пока пусто" description="В этом направлении еще нет мероприятий." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Название мероприятия</th>
                      <th>Сроки выполнения</th>
                      <th>Ответственные</th>
                      <th>Целевая аудитория</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <strong>{event.title}</strong>
                          {user?.role === "admin" && !organizationId ? (
                            <span className="table__meta">{organizationNameById[event.organization_id] ?? `ОО #${event.organization_id}`}</span>
                          ) : null}
                          <span className="table__meta">{event.event_type}</span>
                          {event.description ? <span className="table__meta">{event.description}</span> : null}
                        </td>
                        <td>{getEventExecutionLabel(event)}</td>
                        <td>
                          {event.responsible_employees.length > 0
                            ? event.responsible_employees.map((employee) => `${employee.last_name} ${employee.first_name}`).join(", ")
                            : event.organizer || "-"}
                        </td>
                        <td>{getEventAudienceLabel(event)}</td>
                        <td>
                          <div className="row-actions">
                            <Button size="sm" variant="secondary" onClick={() => openEdit(event)}>
                              Изменить
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => void removeEvent(event)}>
                              Удалить
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ))
      )}

      {eventModal ? (
        <EventEditorModal
          mode={eventModal.mode}
          form={eventForm}
          organizations={organizations}
          classProfiles={classProfiles}
          responsibleUsers={responsibleUsers}
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
