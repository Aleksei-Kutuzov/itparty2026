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
  const { user, orgProfile } = useAuth();
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

  const ownOrgId = orgProfile?.organization_id;

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
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РґР°РЅРЅС‹Рµ");
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
        { value: "common", label: "РћР±С‰РµРµ РјРµСЂРѕРїСЂРёСЏС‚РёРµ" },
        ...organizations.map((org) => ({ value: String(org.id), label: org.name })),
      ];
    }
    const ownOrgName = organizations.find((org) => org.id === ownOrgId)?.name ?? "РњРѕСЏ РѕСЂРіР°РЅРёР·Р°С†РёСЏ";
    return [
      { value: "common", label: "РћР±С‰РµРµ РјРµСЂРѕРїСЂРёСЏС‚РёРµ" },
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
        setNotice("РњРµСЂРѕРїСЂРёСЏС‚РёРµ РѕР±РЅРѕРІР»РµРЅРѕ");
      } else {
        await api.events.create(payload);
        setNotice("РњРµСЂРѕРїСЂРёСЏС‚РёРµ РґРѕР±Р°РІР»РµРЅРѕ РІ РїР»Р°РЅ");
      }
      closeEventModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РјРµСЂРѕРїСЂРёСЏС‚РёРµ");
    } finally {
      setSavingEvent(false);
    }
  };

  const doCancel = async (eventItem: EventItem) => {
    if (!window.confirm(`РћС‚РјРµРЅРёС‚СЊ РјРµСЂРѕРїСЂРёСЏС‚РёРµ В«${eventItem.title}В»?`)) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.events.cancel(eventItem.id);
      setNotice("РњРµСЂРѕРїСЂРёСЏС‚РёРµ РѕС‚РјРµРЅРµРЅРѕ");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РјРµРЅРёС‚СЊ РјРµСЂРѕРїСЂРёСЏС‚РёРµ");
    }
  };

  const doDelete = async (eventItem: EventItem) => {
    if (!window.confirm(`РЈРґР°Р»РёС‚СЊ РјРµСЂРѕРїСЂРёСЏС‚РёРµ В«${eventItem.title}В»?`)) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.events.remove(eventItem.id);
      setNotice("РњРµСЂРѕРїСЂРёСЏС‚РёРµ СѓРґР°Р»РµРЅРѕ");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РјРµСЂРѕРїСЂРёСЏС‚РёРµ");
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
      setNotice("РњРµСЂРѕРїСЂРёСЏС‚РёРµ РїРµСЂРµРЅРµСЃРµРЅРѕ");
      setRescheduleEvent(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРЅРµСЃС‚Рё РјРµСЂРѕРїСЂРёСЏС‚РёРµ");
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
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ СЃРїРёСЃРѕРє СѓС‡Р°СЃС‚РЅРёРєРѕРІ");
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
      setNotice("РЈС‡РµРЅРёРє РґРѕР±Р°РІР»РµРЅ РІ РјРµСЂРѕРїСЂРёСЏС‚РёРµ");
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ СѓС‡РµРЅРёРєР°");
    }
  };

  const removeParticipant = async (studentId: number) => {
    if (!participantsEvent) {
      return;
    }
    try {
      await api.events.removeStudent(participantsEvent.id, studentId);
      setParticipants((prev) => prev.filter((student) => student.id !== studentId));
      setNotice("РЈС‡РµРЅРёРє СѓРґР°Р»РµРЅ РёР· РјРµСЂРѕРїСЂРёСЏС‚РёСЏ");
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ СѓС‡РµРЅРёРєР°");
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
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РѕР±СЂР°С‚РЅСѓСЋ СЃРІСЏР·СЊ");
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
      setNotice("РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ СЃРѕС…СЂР°РЅРµРЅР°");
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РѕР±СЂР°С‚РЅСѓСЋ СЃРІСЏР·СЊ");
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
    return <StatusView state="loading" title="Р—Р°РіСЂСѓР¶Р°РµРј РјРµСЂРѕРїСЂРёСЏС‚РёСЏ" description="РџРѕРґРіРѕС‚Р°РІР»РёРІР°РµРј РїР»Р°РЅ Рё РєР°Р»РµРЅРґР°СЂСЊ." />;
  }

  if (state === "error") {
    return <StatusView state="error" title="РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid events-page">
      <div className="events-page__alerts" aria-live="polite" aria-atomic="true">
        {error ? <Notice tone="error" text={error} /> : null}
        {notice ? <Notice tone="success" text={notice} /> : null}
      </div>

      <Card
        title="РџР»Р°РЅ РјРµСЂРѕРїСЂРёСЏС‚РёР№"
        subtitle="Р”РѕР±Р°РІР»РµРЅРёРµ, РїРµСЂРµРЅРѕСЃ, РѕС‚РјРµРЅР° Рё РєРѕРЅС‚СЂРѕР»СЊ СѓС‡Р°СЃС‚РёСЏ"
        actions={
          <div className="card-actions">
            <SegmentedControl
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "table", label: "РўР°Р±Р»РёС†Р°" },
                { value: "calendar", label: "РљР°Р»РµРЅРґР°СЂСЊ" },
              ]}
            />
            <Button onClick={openCreate}>Р”РѕР±Р°РІРёС‚СЊ РјРµСЂРѕРїСЂРёСЏС‚РёРµ</Button>
          </div>
        }
      >
        {ownOrCommonEvents.length === 0 ? (
          <StatusView state="empty" title="РџР»Р°РЅ РїРѕРєР° РїСѓСЃС‚" description="РЎРѕР·РґР°Р№С‚Рµ РїРµСЂРІРѕРµ РјРµСЂРѕРїСЂРёСЏС‚РёРµ." />
        ) : viewMode === "table" ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>РњРµСЂРѕРїСЂРёСЏС‚РёРµ</th>
                  <th>РџРµСЂРёРѕРґ</th>
                  <th>РћРћ</th>
                  <th>РЎС‚Р°С‚СѓСЃ</th>
                  <th>Р”РµР№СЃС‚РІРёСЏ</th>
                </tr>
              </thead>
              <tbody>
                {ownOrCommonEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      <p className="table__meta">{event.description || "Р‘РµР· РѕРїРёСЃР°РЅРёСЏ"}</p>
                    </td>
                    <td>
                      {formatDateTime(event.starts_at)} - {formatDateTime(event.ends_at)}
                    </td>
                    <td>{event.organization_name ?? "РћР±С‰РµРµ"}</td>
                    <td>
                      <StatusBadge status={event.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(event)}>
                          РР·РјРµРЅРёС‚СЊ
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openReschedule(event)}>
                          РџРµСЂРµРЅРµСЃС‚Рё
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void openParticipants(event)}>
                          РЈС‡Р°СЃС‚РЅРёРєРё
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void openFeedback(event)}>
                          РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void doCancel(event)}>
                          РћС‚РјРµРЅРёС‚СЊ
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void doDelete(event)}>
                          РЈРґР°Р»РёС‚СЊ
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
        <Modal title={eventModal.mode === "create" ? "РќРѕРІРѕРµ РјРµСЂРѕРїСЂРёСЏС‚РёРµ" : "Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РјРµСЂРѕРїСЂРёСЏС‚РёСЏ"} onClose={closeEventModal} width="lg">
          <form className="form-grid form-grid--two" onSubmit={submitEvent}>
            <Input
              label="РќР°Р·РІР°РЅРёРµ"
              required
              value={eventForm.title}
              onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <Select
              label="РћСЂРіР°РЅРёР·Р°С†РёСЏ"
              value={eventForm.organization_id}
              onChange={(event) => setEventForm((prev) => ({ ...prev, organization_id: event.target.value }))}
              options={eventOrgOptions}
            />
            <Input
              label="РќР°С‡Р°Р»Рѕ"
              type="datetime-local"
              required
              value={eventForm.starts_at}
              onChange={(event) => setEventForm((prev) => ({ ...prev, starts_at: event.target.value }))}
            />
            <Input
              label="РћРєРѕРЅС‡Р°РЅРёРµ"
              type="datetime-local"
              required
              value={eventForm.ends_at}
              onChange={(event) => setEventForm((prev) => ({ ...prev, ends_at: event.target.value }))}
            />
            <Select
              label="РЎС‚Р°С‚СѓСЃ"
              value={eventForm.status}
              onChange={(event) => setEventForm((prev) => ({ ...prev, status: event.target.value as EventItem["status"] }))}
              options={[
                { value: "planned", label: "Р—Р°РїР»Р°РЅРёСЂРѕРІР°РЅРѕ" },
                { value: "rescheduled", label: "РџРµСЂРµРЅРµСЃРµРЅРѕ" },
                { value: "completed", label: "Р—Р°РІРµСЂС€РµРЅРѕ" },
                { value: "cancelled", label: "РћС‚РјРµРЅРµРЅРѕ" },
              ]}
            />
            <TextArea
              label="РћРїРёСЃР°РЅРёРµ"
              className="form-grid__full"
              value={eventForm.description}
              onChange={(event) => setEventForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeEventModal}>
                Р—Р°РєСЂС‹С‚СЊ
              </Button>
              <Button type="submit" disabled={savingEvent}>
                {savingEvent ? "РЎРѕС…СЂР°РЅРµРЅРёРµ..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {rescheduleEvent ? (
        <Modal title={`РџРµСЂРµРЅРѕСЃ: ${rescheduleEvent.title}`} onClose={() => setRescheduleEvent(null)} width="sm">
          <form className="form-grid" onSubmit={submitReschedule}>
            <Input label="РќРѕРІР°СЏ РґР°С‚Р° РЅР°С‡Р°Р»Р°" type="datetime-local" required value={rescheduleStart} onChange={(event) => setRescheduleStart(event.target.value)} />
            <Input label="РќРѕРІР°СЏ РґР°С‚Р° РѕРєРѕРЅС‡Р°РЅРёСЏ" type="datetime-local" required value={rescheduleEnd} onChange={(event) => setRescheduleEnd(event.target.value)} />
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setRescheduleEvent(null)}>
                РћС‚РјРµРЅР°
              </Button>
              <Button type="submit" disabled={reschedulePending}>
                {reschedulePending ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РџРµСЂРµРЅРµСЃС‚Рё"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {participantsEvent ? (
        <Modal title={`РЈС‡Р°СЃС‚РЅРёРєРё: ${participantsEvent.title}`} onClose={() => setParticipantsEvent(null)} width="lg">
          {participantsLoading ? (
            <StatusView state="loading" title="Р—Р°РіСЂСѓР·РєР° СѓС‡Р°СЃС‚РЅРёРєРѕРІ" />
          ) : (
            <>
              <div className="inline-controls">
                <select value={studentToAdd} onChange={(event) => setStudentToAdd(event.target.value)} className="field__control">
                  <option value="">Р’С‹Р±РµСЂРёС‚Рµ СѓС‡РµРЅРёРєР°</option>
                  {participantCandidates.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.full_name} ({student.school_class})
                    </option>
                  ))}
                </select>
                <Button onClick={addParticipant} disabled={!studentToAdd}>
                  Р”РѕР±Р°РІРёС‚СЊ
                </Button>
              </div>

              {participants.length === 0 ? (
                <StatusView state="empty" title="РЈС‡Р°СЃС‚РЅРёРєРё РЅРµ РґРѕР±Р°РІР»РµРЅС‹" description="Р’С‹Р±РµСЂРёС‚Рµ СѓС‡РµРЅРёРєР° Рё РґРѕР±Р°РІСЊС‚Рµ РµРіРѕ РІ РјРµСЂРѕРїСЂРёСЏС‚РёРµ." />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Р¤РРћ</th>
                        <th>РљР»Р°СЃСЃ</th>
                        <th>Р РµР№С‚РёРЅРі</th>
                        <th>Р”РµР№СЃС‚РІРёСЏ</th>
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
                              РЈРґР°Р»РёС‚СЊ
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
        <Modal title={`РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ: ${feedbackEvent.title}`} onClose={() => setFeedbackEvent(null)} width="lg">
          {feedbackLoading ? (
            <StatusView state="loading" title="Р—Р°РіСЂСѓР·РєР° РѕС‚Р·С‹РІРѕРІ" />
          ) : (
            <>
              <form className="form-grid form-grid--two" onSubmit={submitFeedback}>
                <Select
                  label="РћС†РµРЅРєР°"
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
                  label="РљРѕРјРјРµРЅС‚Р°СЂРёР№"
                  className="form-grid__full"
                  value={feedbackForm.comment}
                  onChange={(event) => setFeedbackForm((prev) => ({ ...prev, comment: event.target.value }))}
                />
                <Button type="submit" className="form-grid__full">
                  РЎРѕС…СЂР°РЅРёС‚СЊ РѕС‚Р·С‹РІ
                </Button>
              </form>

              {feedbackList.length === 0 ? (
                <StatusView state="empty" title="РћС‚Р·С‹РІРѕРІ РїРѕРєР° РЅРµС‚" description="РћСЃС‚Р°РІСЊС‚Рµ РїРµСЂРІС‹Р№ РѕС‚Р·С‹РІ РїРѕ СѓС‡Р°СЃС‚РёСЋ." />
              ) : (
                <div className="feedback-list">
                  {feedbackList.map((feedback) => (
                    <article key={feedback.id} className="feedback-item">
                      <header>
                        <strong>РћС†РµРЅРєР°: {feedback.rating ?? "-"}</strong>
                        <span>{formatDateTime(feedback.created_at)}</span>
                      </header>
                      <p>{feedback.comment || "РљРѕРјРјРµРЅС‚Р°СЂРёР№ РЅРµ РѕСЃС‚Р°РІР»РµРЅ."}</p>
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
