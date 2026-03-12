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
import type { EventItem, Organization } from "../types/models";

type PageState = "loading" | "ready" | "error";

type EventForm = {
  title: string;
  event_type: string;
  target_class_name: string;
  organizer: string;
  event_level: string;
  event_format: string;
  participants_count: string;
  description: string;
  starts_at: string;
  ends_at: string;
  organization_id: string;
};

type EventModal = {
  mode: "create" | "edit";
  event?: EventItem;
};

const getDefaultEventForm = (): EventForm => {
  const start = new Date();
  const end = new Date(start.getTime() + 3600000);
  return {
    title: "",
    event_type: "Олимпиада",
    target_class_name: "",
    organizer: "",
    event_level: "",
    event_format: "",
    participants_count: "",
    description: "",
    starts_at: formatInputDateTime(start.toISOString()),
    ends_at: formatInputDateTime(end.toISOString()),
    organization_id: "",
  };
};

const fromEvent = (event: EventItem): EventForm => ({
  title: event.title,
  event_type: event.event_type,
  target_class_name: event.target_class_name ?? "",
  organizer: event.organizer ?? "",
  event_level: event.event_level ?? "",
  event_format: event.event_format ?? "",
  participants_count: event.participants_count ? String(event.participants_count) : "",
  description: event.description ?? "",
  starts_at: formatInputDateTime(event.starts_at),
  ends_at: formatInputDateTime(event.ends_at),
  organization_id: String(event.organization_id),
});

export const EventsPage = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [eventModal, setEventModal] = useState<EventModal | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(getDefaultEventForm());
  const [savingEvent, setSavingEvent] = useState(false);

  const load = async () => {
    setState("loading");
    setError(null);
    try {
      const [eventsResult, orgsResult] = await Promise.all([api.events.list(), api.orgs.list()]);
      setEvents(eventsResult);
      setOrganizations(orgsResult);
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

  const openCreate = () => {
    setEventModal({ mode: "create" });
    setEventForm({
      ...getDefaultEventForm(),
      organization_id: user?.organization_id ? String(user.organization_id) : "",
    });
  };

  const openEdit = (event: EventItem) => {
    setEventModal({ mode: "edit", event });
    setEventForm(fromEvent(event));
  };

  const closeEventModal = () => {
    setEventModal(null);
    setSavingEvent(false);
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
        target_class_name: eventForm.target_class_name.trim() || null,
        organizer: eventForm.organizer.trim() || null,
        event_level: eventForm.event_level.trim() || null,
        event_format: eventForm.event_format.trim() || null,
        participants_count: eventForm.participants_count.trim() ? Number(eventForm.participants_count) : null,
        description: eventForm.description.trim() || null,
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

  const eventOrgOptions = useMemo(() => organizations.map((org) => ({ value: String(org.id), label: org.name })), [organizations]);

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
        title="План мероприятий"
        subtitle="Добавление и редактирование событий"
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
            {(user?.role === "admin" || user?.role === "organization") && <Button onClick={openCreate}>Добавить мероприятие</Button>}
          </div>
        }
      >
        {sortedEvents.length === 0 ? (
          <StatusView state="empty" title="План пока пуст" description="Создайте первое мероприятие." />
        ) : viewMode === "table" ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Мероприятие</th>
                  <th>Тип</th>
                  <th>Период</th>
                  <th>Организатор</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      <p className="table__meta">{event.description || "Без описания"}</p>
                    </td>
                    <td>{event.event_type}</td>
                    <td>
                      {formatDateTime(event.starts_at)} - {formatDateTime(event.ends_at)}
                    </td>
                    <td>{event.organizer || "-"}</td>
                    <td>
                      {(user?.role === "admin" || user?.role === "organization") ? (
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
            onEventClick={openEdit}
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
            <Input
              label="Класс"
              value={eventForm.target_class_name}
              onChange={(event) => setEventForm((prev) => ({ ...prev, target_class_name: event.target.value }))}
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
            <TextArea
              label="Описание"
              className="form-grid__full"
              value={eventForm.description}
              onChange={(event) => setEventForm((prev) => ({ ...prev, description: event.target.value }))}
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
