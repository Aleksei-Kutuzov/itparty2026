import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { StatusBadge } from "../shared/ui/Badge";
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
import type { EventFeedback, EventItem, Organization, Student } from "../types/models";

type PageState = "loading" | "ready" | "error";

type EventForm = {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  organization_id: string;
  status: EventItem["status"];
};

type EventModal = {
  mode: "create" | "edit";
  event?: EventItem;
};

type FeedbackForm = {
  rating: string;
  comment: string;
};

const getDefaultEventForm = (): EventForm => {
  const start = new Date();
  const end = new Date(start.getTime() + 3600000);
  return {
    title: "",
    description: "",
    starts_at: formatInputDateTime(start.toISOString()),
    ends_at: formatInputDateTime(end.toISOString()),
    organization_id: "common",
    status: "planned",
  };
};

const fromEvent = (event: EventItem): EventForm => ({
  title: event.title,
  description: event.description ?? "",
  starts_at: formatInputDateTime(event.starts_at),
  ends_at: formatInputDateTime(event.ends_at),
  organization_id: event.organization_id ? String(event.organization_id) : "common",
  status: event.status,
});

export const EventsPage = () => {
  const { user, staffProfile } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [eventModal, setEventModal] = useState<EventModal | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(getDefaultEventForm());
  const [savingEvent, setSavingEvent] = useState(false);

  const [rescheduleEvent, setRescheduleEvent] = useState<EventItem | null>(null);
  const [rescheduleStart, setRescheduleStart] = useState("");
  const [rescheduleEnd, setRescheduleEnd] = useState("");
  const [reschedulePending, setReschedulePending] = useState(false);

  const [participantsEvent, setParticipantsEvent] = useState<EventItem | null>(null);
  const [participants, setParticipants] = useState<Student[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [studentToAdd, setStudentToAdd] = useState("");

  const [feedbackEvent, setFeedbackEvent] = useState<EventItem | null>(null);
  const [feedbackList, setFeedbackList] = useState<EventFeedback[]>([]);
  const [feedbackForm, setFeedbackForm] = useState<FeedbackForm>({ rating: "5", comment: "" });
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const ownOrgId = staffProfile?.organization_id;

  const load = async () => {
    setState("loading");
    setError(null);
    try {
      const [eventsResult, studentsResult, orgsResult] = await Promise.all([
        api.events.list(),
        api.students.list(),
        api.orgs.list(),
      ]);
      setEvents(eventsResult);
      setStudents(studentsResult);
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

  const ownOrCommonEvents = useMemo(
    () =>
      [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).filter((event) => {
        if (user?.is_admin) {
          return true;
        }
        return event.organization_id === null || event.organization_id === ownOrgId;
      }),
    [events, ownOrgId, user?.is_admin],
  );

  const openCreate = () => {
    setEventModal({ mode: "create" });
    setEventForm(getDefaultEventForm());
  };

  const openEdit = (event: EventItem) => {
    setEventModal({ mode: "edit", event });
    setEventForm(fromEvent(event));
  };

  const closeEventModal = () => {
    setEventModal(null);
    setSavingEvent(false);
  };

  const eventOrgOptions = useMemo(() => {
    if (user?.is_admin) {
      return [
        { value: "common", label: "Общее мероприятие" },
        ...organizations.map((org) => ({ value: String(org.id), label: org.name })),
      ];
    }
    const ownOrgName = organizations.find((org) => org.id === ownOrgId)?.name ?? "Моя организация";
    return [
      { value: "common", label: "Общее мероприятие" },
      { value: String(ownOrgId ?? ""), label: ownOrgName },
    ];
  }, [organizations, ownOrgId, user?.is_admin]);

  const submitEvent = async (event: FormEvent) => {
    event.preventDefault();
    setSavingEvent(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        title: eventForm.title.trim(),
        description: eventForm.description.trim() || null,
        status: eventForm.status,
        starts_at: fromInputDateTime(eventForm.starts_at),
        ends_at: fromInputDateTime(eventForm.ends_at),
        organization_id: eventForm.organization_id === "common" ? null : Number(eventForm.organization_id),
      };

      if (eventModal?.mode === "edit" && eventModal.event) {
        await api.events.update(eventModal.event.id, payload);
        setNotice("Мероприятие обновлено");
      } else {
        await api.events.create(payload);
        setNotice("Мероприятие добавлено в план");
      }
      closeEventModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить мероприятие");
    } finally {
      setSavingEvent(false);
    }
  };

  const doCancel = async (eventItem: EventItem) => {
    if (!window.confirm(`Отменить мероприятие «${eventItem.title}»?`)) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.events.cancel(eventItem.id);
      setNotice("Мероприятие отменено");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отменить мероприятие");
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

  const openReschedule = (eventItem: EventItem) => {
    setRescheduleEvent(eventItem);
    setRescheduleStart(formatInputDateTime(eventItem.starts_at));
    setRescheduleEnd(formatInputDateTime(eventItem.ends_at));
  };

  const submitReschedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!rescheduleEvent) {
      return;
    }
    setReschedulePending(true);
    setError(null);
    try {
      await api.events.reschedule(rescheduleEvent.id, {
        starts_at: fromInputDateTime(rescheduleStart),
        ends_at: fromInputDateTime(rescheduleEnd),
      });
      setNotice("Мероприятие перенесено");
      setRescheduleEvent(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось перенести мероприятие");
    } finally {
      setReschedulePending(false);
    }
  };

  const openParticipants = async (eventItem: EventItem) => {
    setParticipantsEvent(eventItem);
    setParticipantsLoading(true);
    setStudentToAdd("");
    try {
      const list = await api.events.listStudents(eventItem.id);
      const linkedStudents = list
        .map((link) => students.find((student) => student.id === link.student_id))
        .filter(Boolean) as Student[];
      setParticipants(linkedStudents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось получить список участников");
      setParticipants([]);
    } finally {
      setParticipantsLoading(false);
    }
  };

  const addParticipant = async () => {
    if (!participantsEvent || !studentToAdd) {
      return;
    }
    try {
      await api.events.assignStudent(participantsEvent.id, Number(studentToAdd));
      const list = await api.events.listStudents(participantsEvent.id);
      const linkedStudents = list
        .map((link) => students.find((student) => student.id === link.student_id))
        .filter(Boolean) as Student[];
      setParticipants(linkedStudents);
      setStudentToAdd("");
      setNotice("Ученик добавлен в мероприятие");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить ученика");
    }
  };

  const removeParticipant = async (studentId: number) => {
    if (!participantsEvent) {
      return;
    }
    try {
      await api.events.removeStudent(participantsEvent.id, studentId);
      setParticipants((prev) => prev.filter((student) => student.id !== studentId));
      setNotice("Ученик удален из мероприятия");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить ученика");
    }
  };

  const openFeedback = async (eventItem: EventItem) => {
    setFeedbackEvent(eventItem);
    setFeedbackLoading(true);
    setFeedbackForm({ rating: "5", comment: "" });
    try {
      const list = await api.events.listFeedback(eventItem.id);
      setFeedbackList(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить обратную связь");
      setFeedbackList([]);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const submitFeedback = async (event: FormEvent) => {
    event.preventDefault();
    if (!feedbackEvent) {
      return;
    }
    try {
      await api.events.sendFeedback(feedbackEvent.id, {
        rating: Number(feedbackForm.rating),
        comment: feedbackForm.comment.trim(),
      });
      const list = await api.events.listFeedback(feedbackEvent.id);
      setFeedbackList(list);
      setFeedbackForm({ rating: "5", comment: "" });
      setNotice("Обратная связь сохранена");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить обратную связь");
    }
  };

  const participantCandidates = useMemo(() => {
    if (!participantsEvent) {
      return [];
    }
    const linkedIds = new Set(participants.map((student) => student.id));
    return students.filter((student) => {
      if (linkedIds.has(student.id)) {
        return false;
      }
      if (participantsEvent.organization_id === null) {
        return true;
      }
      return student.organization_id === participantsEvent.organization_id;
    });
  }, [participants, participantsEvent, students]);

  if (state === "loading") {
    return <StatusView state="loading" title="Загружаем мероприятия" description="Подготавливаем план и календарь." />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка загрузки" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid">
      {error ? <Notice tone="error" text={error} /> : null}
      {notice ? <Notice tone="success" text={notice} /> : null}

      <Card
        title="План мероприятий"
        subtitle="Добавление, перенос, отмена и контроль участия"
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
            <Button onClick={openCreate}>Добавить мероприятие</Button>
          </div>
        }
      >
        {ownOrCommonEvents.length === 0 ? (
          <StatusView state="empty" title="План пока пуст" description="Создайте первое мероприятие." />
        ) : viewMode === "table" ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Мероприятие</th>
                  <th>Период</th>
                  <th>ОО</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {ownOrCommonEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      <p className="table__meta">{event.description || "Без описания"}</p>
                    </td>
                    <td>
                      {formatDateTime(event.starts_at)} - {formatDateTime(event.ends_at)}
                    </td>
                    <td>{event.organization_name ?? "Общее"}</td>
                    <td>
                      <StatusBadge status={event.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(event)}>
                          Изменить
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openReschedule(event)}>
                          Перенести
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void openParticipants(event)}>
                          Участники
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void openFeedback(event)}>
                          Обратная связь
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void doCancel(event)}>
                          Отменить
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void doDelete(event)}>
                          Удалить
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <MonthCalendar
            month={calendarMonth}
            events={ownOrCommonEvents}
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
            <Select
              label="Статус"
              value={eventForm.status}
              onChange={(event) => setEventForm((prev) => ({ ...prev, status: event.target.value as EventItem["status"] }))}
              options={[
                { value: "planned", label: "Запланировано" },
                { value: "rescheduled", label: "Перенесено" },
                { value: "completed", label: "Завершено" },
                { value: "cancelled", label: "Отменено" },
              ]}
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

      {rescheduleEvent ? (
        <Modal title={`Перенос: ${rescheduleEvent.title}`} onClose={() => setRescheduleEvent(null)} width="sm">
          <form className="form-grid" onSubmit={submitReschedule}>
            <Input label="Новая дата начала" type="datetime-local" required value={rescheduleStart} onChange={(event) => setRescheduleStart(event.target.value)} />
            <Input label="Новая дата окончания" type="datetime-local" required value={rescheduleEnd} onChange={(event) => setRescheduleEnd(event.target.value)} />
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setRescheduleEvent(null)}>
                Отмена
              </Button>
              <Button type="submit" disabled={reschedulePending}>
                {reschedulePending ? "Сохраняем..." : "Перенести"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {participantsEvent ? (
        <Modal title={`Участники: ${participantsEvent.title}`} onClose={() => setParticipantsEvent(null)} width="lg">
          {participantsLoading ? (
            <StatusView state="loading" title="Загрузка участников" />
          ) : (
            <>
              <div className="inline-controls">
                <select value={studentToAdd} onChange={(event) => setStudentToAdd(event.target.value)} className="field__control">
                  <option value="">Выберите ученика</option>
                  {participantCandidates.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.full_name} ({student.school_class})
                    </option>
                  ))}
                </select>
                <Button onClick={addParticipant} disabled={!studentToAdd}>
                  Добавить
                </Button>
              </div>

              {participants.length === 0 ? (
                <StatusView state="empty" title="Участники не добавлены" description="Выберите ученика и добавьте его в мероприятие." />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ФИО</th>
                        <th>Класс</th>
                        <th>Рейтинг</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((student) => (
                        <tr key={student.id}>
                          <td>{student.full_name}</td>
                          <td>{student.school_class}</td>
                          <td>{student.rating.toFixed(1)}</td>
                          <td>
                            <Button size="sm" variant="danger" onClick={() => void removeParticipant(student.id)}>
                              Удалить
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Modal>
      ) : null}

      {feedbackEvent ? (
        <Modal title={`Обратная связь: ${feedbackEvent.title}`} onClose={() => setFeedbackEvent(null)} width="lg">
          {feedbackLoading ? (
            <StatusView state="loading" title="Загрузка отзывов" />
          ) : (
            <>
              <form className="form-grid form-grid--two" onSubmit={submitFeedback}>
                <Select
                  label="Оценка"
                  value={feedbackForm.rating}
                  onChange={(event) => setFeedbackForm((prev) => ({ ...prev, rating: event.target.value }))}
                  options={[
                    { value: "5", label: "5" },
                    { value: "4", label: "4" },
                    { value: "3", label: "3" },
                    { value: "2", label: "2" },
                    { value: "1", label: "1" },
                  ]}
                />
                <TextArea
                  label="Комментарий"
                  className="form-grid__full"
                  value={feedbackForm.comment}
                  onChange={(event) => setFeedbackForm((prev) => ({ ...prev, comment: event.target.value }))}
                />
                <Button type="submit" className="form-grid__full">
                  Сохранить отзыв
                </Button>
              </form>

              {feedbackList.length === 0 ? (
                <StatusView state="empty" title="Отзывов пока нет" description="Оставьте первый отзыв по участию." />
              ) : (
                <div className="feedback-list">
                  {feedbackList.map((feedback) => (
                    <article key={feedback.id} className="feedback-item">
                      <header>
                        <strong>Оценка: {feedback.rating ?? "-"}</strong>
                        <span>{formatDateTime(feedback.created_at)}</span>
                      </header>
                      <p>{feedback.comment || "Комментарий не оставлен."}</p>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal>
      ) : null}
    </div>
  );
};
