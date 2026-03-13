import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Input } from "../shared/ui/Input";
import { Modal } from "../shared/ui/Modal";
import { Notice } from "../shared/ui/Notice";
import { Select } from "../shared/ui/Select";
import { StatusView } from "../shared/ui/StatusView";
import { TextArea } from "../shared/ui/TextArea";
import { formatDateTime } from "../shared/utils/date";
import { formatStudentClass } from "../shared/utils/studentClass";
import type {
  EventItem,
  Organization,
  Participation,
  Student,
  StudentAchievement,
  StudentAchievementCreatePayload,
} from "../types/models";

type PageState = "loading" | "ready" | "error";

type StudentForm = {
  full_name: string;
  average_percent: string;
  notes: string;
};

type StudentModal = {
  mode: "create" | "edit";
  student?: Student;
};

type AchievementForm = {
  event_id: string;
  event_name: string;
  event_type: string;
  achievement: string;
  achievement_date: string;
  notes: string;
};

type AchievementModal = {
  mode: "create" | "edit";
  achievement?: StudentAchievement;
};

const defaultStudentForm: StudentForm = {
  full_name: "",
  average_percent: "",
  notes: "",
};

const defaultAchievementForm: AchievementForm = {
  event_id: "",
  event_name: "",
  event_type: "",
  achievement: "",
  achievement_date: new Date().toISOString().slice(0, 10),
  notes: "",
};

const fromStudent = (student: Student): StudentForm => ({
  full_name: student.full_name,
  average_percent: student.average_percent?.toString() ?? "",
  notes: student.notes ?? "",
});

const fromAchievement = (achievement: StudentAchievement): AchievementForm => ({
  event_id: achievement.event_id ? String(achievement.event_id) : "",
  event_name: achievement.event_name,
  event_type: achievement.event_type,
  achievement: achievement.achievement,
  achievement_date: achievement.achievement_date.slice(0, 10),
  notes: achievement.notes ?? "",
});

const parseOptionalPercent = (value: string): number | null => {
  if (!value.trim()) {
    return null;
  }
  return Number(value);
};

export const StudentsPage = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [studentParticipations, setStudentParticipations] = useState<Participation[]>([]);
  const [studentAchievements, setStudentAchievements] = useState<StudentAchievement[]>([]);
  const [participationsState, setParticipationsState] = useState<PageState>("loading");
  const [achievementsState, setAchievementsState] = useState<PageState>("loading");

  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [studentModal, setStudentModal] = useState<StudentModal | null>(null);
  const [studentForm, setStudentForm] = useState<StudentForm>(defaultStudentForm);
  const [savingStudent, setSavingStudent] = useState(false);

  const [achievementModal, setAchievementModal] = useState<AchievementModal | null>(null);
  const [achievementForm, setAchievementForm] = useState<AchievementForm>(defaultAchievementForm);
  const [savingAchievement, setSavingAchievement] = useState(false);

  const canManageStudents = user?.role === "curator" || user?.role === "admin";

  const load = async () => {
    setState("loading");
    setError(null);
    try {
      const [studentsResult, orgsResult, eventsResult] = await Promise.all([
        api.students.list(),
        api.orgs.list(),
        api.events.list(),
      ]);
      setStudents(studentsResult);
      setOrganizations(orgsResult);
      setEvents(eventsResult);
      setSelectedStudent((previous) => {
        if (studentsResult.length === 0) {
          return null;
        }
        if (!previous) {
          return studentsResult[0];
        }
        return studentsResult.find((student) => student.id === previous.id) ?? studentsResult[0];
      });
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СѓС‡РµРЅРёРєРѕРІ");
    }
  };

  const loadStudentDetails = async (studentId: number) => {
    setParticipationsState("loading");
    setAchievementsState("loading");
    try {
      const [participations, achievements] = await Promise.all([
        api.participations.list({ student_id: studentId }),
        api.students.listAchievements(studentId),
      ]);
      setStudentParticipations(participations);
      setStudentAchievements(achievements);
      setParticipationsState("ready");
      setAchievementsState("ready");
    } catch {
      setParticipationsState("error");
      setAchievementsState("error");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedStudent) {
      setParticipationsState("ready");
      setStudentParticipations([]);
      setAchievementsState("ready");
      setStudentAchievements([]);
      return;
    }
    void loadStudentDetails(selectedStudent.id);
  }, [selectedStudent?.id]);

  const openCreateStudent = () => {
    setStudentModal({ mode: "create" });
    setStudentForm(defaultStudentForm);
  };

  const openEditStudent = (student: Student) => {
    setStudentModal({ mode: "edit", student });
    setStudentForm(fromStudent(student));
  };

  const closeStudentModal = () => {
    setStudentModal(null);
    setSavingStudent(false);
  };

  const submitStudent = async (event: FormEvent) => {
    event.preventDefault();
    setSavingStudent(true);
    setError(null);
    setNotice(null);

    try {
      const payload = {
        full_name: studentForm.full_name.trim(),
        average_percent: parseOptionalPercent(studentForm.average_percent),
        notes: studentForm.notes.trim() || null,
      };

      if (studentModal?.mode === "edit" && studentModal.student) {
        await api.students.update(studentModal.student.id, payload);
        setNotice("РљР°СЂС‚РѕС‡РєР° СѓС‡РµРЅРёРєР° РѕР±РЅРѕРІР»РµРЅР°");
      } else {
        await api.students.create(payload);
        setNotice("РЈС‡РµРЅРёРє РґРѕР±Р°РІР»РµРЅ");
      }

      closeStudentModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ СѓС‡РµРЅРёРєР°");
    } finally {
      setSavingStudent(false);
    }
  };

  const deleteStudent = async (student: Student) => {
    if (!window.confirm(`РЈРґР°Р»РёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ СѓС‡РµРЅРёРєР° В«${student.full_name}В»?`)) {
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await api.students.remove(student.id);
      setNotice("РљР°СЂС‚РѕС‡РєР° СѓС‡РµРЅРёРєР° СѓРґР°Р»РµРЅР°");
      if (selectedStudent?.id === student.id) {
        setSelectedStudent(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ СѓС‡РµРЅРёРєР°");
    }
  };

  const eventOptions = useMemo(() => {
    if (!selectedStudent) {
      return [{ value: "", label: "Р‘РµР· РїСЂРёРІСЏР·РєРё Рє СЃРѕР±С‹С‚РёСЋ" }];
    }

    const items = events
      .filter((item) => item.organization_id === selectedStudent.organization_id)
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at));

    return [
      { value: "", label: "Р‘РµР· РїСЂРёРІСЏР·РєРё Рє СЃРѕР±С‹С‚РёСЋ" },
      ...items.map((item) => ({ value: String(item.id), label: `${item.title} (${item.academic_year})` })),
    ];
  }, [events, selectedStudent]);

  const openCreateAchievement = () => {
    setAchievementModal({ mode: "create" });
    setAchievementForm(defaultAchievementForm);
  };

  const openEditAchievement = (achievement: StudentAchievement) => {
    setAchievementModal({ mode: "edit", achievement });
    setAchievementForm(fromAchievement(achievement));
  };

  const closeAchievementModal = () => {
    setAchievementModal(null);
    setSavingAchievement(false);
  };

  const selectAchievementEvent = (eventId: string) => {
    const selectedEvent = events.find((item) => item.id === Number(eventId));
    setAchievementForm((previous) => ({
      ...previous,
      event_id: eventId,
      event_name: eventId && selectedEvent ? selectedEvent.title : previous.event_name,
      event_type: eventId && selectedEvent ? selectedEvent.event_type : previous.event_type,
    }));
  };

  const submitAchievement = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedStudent) {
      return;
    }

    setSavingAchievement(true);
    setError(null);
    setNotice(null);

    try {
      const payload: StudentAchievementCreatePayload = {
        event_id: achievementForm.event_id ? Number(achievementForm.event_id) : null,
        event_name: achievementForm.event_name.trim() || null,
        event_type: achievementForm.event_type.trim() || null,
        achievement: achievementForm.achievement.trim(),
        achievement_date: achievementForm.achievement_date,
        notes: achievementForm.notes.trim() || null,
      };

      if (achievementModal?.mode === "edit" && achievementModal.achievement) {
        await api.students.updateAchievement(selectedStudent.id, achievementModal.achievement.id, payload);
        setNotice("Р”РѕСЃС‚РёР¶РµРЅРёРµ РѕР±РЅРѕРІР»РµРЅРѕ");
      } else {
        await api.students.createAchievement(selectedStudent.id, payload);
        setNotice("Р”РѕСЃС‚РёР¶РµРЅРёРµ РґРѕР±Р°РІР»РµРЅРѕ");
      }

      closeAchievementModal();
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РґРѕСЃС‚РёР¶РµРЅРёРµ");
    } finally {
      setSavingAchievement(false);
    }
  };

  const deleteAchievement = async (achievement: StudentAchievement) => {
    if (!selectedStudent) {
      return;
    }
    if (!window.confirm(`РЈРґР°Р»РёС‚СЊ РґРѕСЃС‚РёР¶РµРЅРёРµ В«${achievement.achievement}В»?`)) {
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await api.students.removeAchievement(selectedStudent.id, achievement.id);
      setNotice("Р”РѕСЃС‚РёР¶РµРЅРёРµ СѓРґР°Р»РµРЅРѕ");
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РґРѕСЃС‚РёР¶РµРЅРёРµ");
    }
  };

  const participationRows = useMemo(
    () =>
      studentParticipations.map((item) => ({
        ...item,
        event: events.find((event) => event.id === item.event_id) ?? null,
      })),
    [events, studentParticipations],
  );

  if (state === "loading") {
    return <StatusView state="loading" title="Р—Р°РіСЂСѓР¶Р°РµРј РєР°СЂС‚РѕС‡РєРё СѓС‡РµРЅРёРєРѕРІ" />;
  }

  if (state === "error") {
    return <StatusView state="error" title="РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid page-grid--split">
      {error ? <Notice tone="error" text={error} /> : null}
      {notice ? <Notice tone="success" text={notice} /> : null}

      <Card
        title="РЎРїРёСЃРѕРє СѓС‡РµРЅРёРєРѕРІ"
        subtitle="РљР°СЂС‚РѕС‡РєРё СѓС‡РµРЅРёРєРѕРІ РІ РґРѕСЃС‚СѓРїРЅРѕР№ РѕР±Р»Р°СЃС‚Рё"
        actions={
          canManageStudents ? (
            <Button onClick={openCreateStudent} size="sm">
              Р”РѕР±Р°РІРёС‚СЊ СѓС‡РµРЅРёРєР°
            </Button>
          ) : undefined
        }
      >
        {students.length === 0 ? (
          <StatusView state="empty" title="РЈС‡РµРЅРёРєРё РЅРµ РґРѕР±Р°РІР»РµРЅС‹" description="РЎРѕР·РґР°Р№С‚Рµ РєР°СЂС‚РѕС‡РєСѓ РїРµСЂРІРѕРіРѕ СѓС‡РµРЅРёРєР°." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Р¤РРћ</th>
                  <th>РљР»Р°СЃСЃ</th>
                  <th>РћРћ</th>
                  <th>РЎСЂРµРґРЅРёР№ РїСЂРѕС†РµРЅС‚</th>
                  <th>Р”РµР№СЃС‚РІРёСЏ</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className={selectedStudent?.id === student.id ? "table__row--active" : ""}>
                    <td>
                      <button className="link-button" type="button" onClick={() => setSelectedStudent(student)}>
                        {student.full_name}
                      </button>
                    </td>
                    <td>{formatStudentClass(student.school_class) || "-"}</td>
                    <td>{organizations.find((org) => org.id === student.organization_id)?.name ?? `ID ${student.organization_id}`}</td>
                    <td>{student.average_percent?.toFixed(2) ?? "-"}%</td>
                    <td>
                      {canManageStudents ? (
                        <div className="row-actions">
                          <Button size="sm" variant="secondary" onClick={() => openEditStudent(student)}>
                            Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => void deleteStudent(student)}>
                            РЈРґР°Р»РёС‚СЊ
                          </Button>
                        </div>
                      ) : (
                        <span className="table__meta">РўРѕР»СЊРєРѕ РїСЂРѕСЃРјРѕС‚СЂ</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="РљР°СЂС‚РѕС‡РєР° СѓС‡РµРЅРёРєР°" subtitle="РћСЃРЅРѕРІРЅС‹Рµ РґР°РЅРЅС‹Рµ Рё РґРѕСЃС‚РёР¶РµРЅРёСЏ">
        {!selectedStudent ? (
          <StatusView state="empty" title="РЈС‡РµРЅРёРє РЅРµ РІС‹Р±СЂР°РЅ" description="Р’С‹Р±РµСЂРёС‚Рµ СѓС‡РµРЅРёРєР° РІ С‚Р°Р±Р»РёС†Рµ СЃР»РµРІР°." />
        ) : (
          <div className="student-card">
            <dl className="kv-grid">
              <div>
                <dt>Р¤РРћ</dt>
                <dd>{selectedStudent.full_name}</dd>
              </div>
              <div>
                <dt>РљР»Р°СЃСЃ</dt>
                <dd>{formatStudentClass(selectedStudent.school_class) || "-"}</dd>
              </div>
              <div>
                <dt>РЎСЂРµРґРЅРёР№ РїСЂРѕС†РµРЅС‚</dt>
                <dd>{selectedStudent.average_percent?.toFixed(2) ?? "-"}%</dd>
              </div>
              <div>
                <dt>Р—Р°РјРµС‚РєРё</dt>
                <dd>{selectedStudent.notes || "-"}</dd>
              </div>
            </dl>

            <h4 className="section-title">РЈС‡Р°СЃС‚РёРµ РІ РјРµСЂРѕРїСЂРёСЏС‚РёСЏС…</h4>
            {participationsState === "loading" ? (
              <StatusView state="loading" title="Р—Р°РіСЂСѓР·РєР° СѓС‡Р°СЃС‚РёСЏ" />
            ) : participationsState === "error" ? (
              <StatusView state="error" title="РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СѓС‡Р°СЃС‚РёРµ" />
            ) : participationRows.length === 0 ? (
              <StatusView state="empty" title="РЈС‡Р°СЃС‚РёР№ РїРѕРєР° РЅРµС‚" description="Р—Р°РїРѕР»РЅРёС‚Рµ СѓС‡Р°СЃС‚РёРµ РЅР° СЃС‚СЂР°РЅРёС†Рµ СЃ РјРµСЂРѕРїСЂРёСЏС‚РёСЏРјРё." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>РњРµСЂРѕРїСЂРёСЏС‚РёРµ</th>
                      <th>РўРёРї СѓС‡Р°СЃС‚РёСЏ</th>
                      <th>Р РµР·СѓР»СЊС‚Р°С‚</th>
                      <th>Р”Р°С‚Р° Р·Р°РїРёСЃРё</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participationRows.map((item) => (
                      <tr key={item.id}>
                        <td>{item.event?.title ?? `ID ${item.event_id}`}</td>
                        <td>{item.participation_type}</td>
                        <td>{item.result || item.status || "-"}</td>
                        <td>{formatDateTime(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="row-actions">
              <h4 className="section-title" style={{ margin: 0 }}>
                Р”РѕСЃС‚РёР¶РµРЅРёСЏ
              </h4>
              {canManageStudents ? (
                <Button size="sm" onClick={openCreateAchievement}>
                  Р”РѕР±Р°РІРёС‚СЊ РґРѕСЃС‚РёР¶РµРЅРёРµ
                </Button>
              ) : null}
            </div>

            {achievementsState === "loading" ? (
              <StatusView state="loading" title="Р—Р°РіСЂСѓР·РєР° РґРѕСЃС‚РёР¶РµРЅРёР№" />
            ) : achievementsState === "error" ? (
              <StatusView state="error" title="РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РґРѕСЃС‚РёР¶РµРЅРёСЏ" />
            ) : studentAchievements.length === 0 ? (
              <StatusView state="empty" title="Р”РѕСЃС‚РёР¶РµРЅРёР№ РїРѕРєР° РЅРµС‚" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>РЎРѕР±С‹С‚РёРµ</th>
                      <th>РўРёРї</th>
                      <th>Р”РѕСЃС‚РёР¶РµРЅРёРµ</th>
                      <th>Р”Р°С‚Р°</th>
                      <th>Р”РµР№СЃС‚РІРёСЏ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentAchievements.map((item) => (
                      <tr key={item.id}>
                        <td>{item.event_name}</td>
                        <td>{item.event_type}</td>
                        <td>{item.achievement}</td>
                        <td>{item.achievement_date}</td>
                        <td>
                          {canManageStudents ? (
                            <div className="row-actions">
                              <Button size="sm" variant="secondary" onClick={() => openEditAchievement(item)}>
                                РР·РјРµРЅРёС‚СЊ
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => void deleteAchievement(item)}>
                                РЈРґР°Р»РёС‚СЊ
                              </Button>
                            </div>
                          ) : (
                            <span className="table__meta">РўРѕР»СЊРєРѕ РїСЂРѕСЃРјРѕС‚СЂ</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {studentModal ? (
        <Modal title={studentModal.mode === "create" ? "РќРѕРІР°СЏ РєР°СЂС‚РѕС‡РєР° СѓС‡РµРЅРёРєР°" : "Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РєР°СЂС‚РѕС‡РєРё"} onClose={closeStudentModal} width="lg">
          <form className="form-grid form-grid--two" onSubmit={submitStudent}>
            <Input
              label="Р¤РРћ"
              className="form-grid__full"
              required
              value={studentForm.full_name}
              onChange={(event) => setStudentForm((previous) => ({ ...previous, full_name: event.target.value }))}
            />
            <p className="field__hint form-grid__full">
              Класс ученика устанавливается автоматически по закрепленному классу сотрудника.
            </p>
            <Input
              label="РЎСЂРµРґРЅРёР№ РїСЂРѕС†РµРЅС‚"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={studentForm.average_percent}
              onChange={(event) => setStudentForm((previous) => ({ ...previous, average_percent: event.target.value }))}
            />
            <TextArea
              label="Р—Р°РјРµС‚РєРё"
              className="form-grid__full"
              value={studentForm.notes}
              onChange={(event) => setStudentForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeStudentModal}>
                Р—Р°РєСЂС‹С‚СЊ
              </Button>
              <Button type="submit" disabled={savingStudent}>
                {savingStudent ? "РЎРѕС…СЂР°РЅРµРЅРёРµ..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {achievementModal ? (
        <Modal title={achievementModal.mode === "create" ? "РќРѕРІРѕРµ РґРѕСЃС‚РёР¶РµРЅРёРµ" : "Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РґРѕСЃС‚РёР¶РµРЅРёСЏ"} onClose={closeAchievementModal}>
          <form className="form-grid form-grid--two" onSubmit={submitAchievement}>
            <Select
              label="РЎРѕР±С‹С‚РёРµ"
              className="form-grid__full"
              value={achievementForm.event_id}
              onChange={(event) => selectAchievementEvent(event.target.value)}
              options={eventOptions}
            />
            <Input
              label="РќР°Р·РІР°РЅРёРµ СЃРѕР±С‹С‚РёСЏ"
              value={achievementForm.event_name}
              onChange={(event) => setAchievementForm((previous) => ({ ...previous, event_name: event.target.value }))}
            />
            <Input
              label="РўРёРї СЃРѕР±С‹С‚РёСЏ"
              value={achievementForm.event_type}
              onChange={(event) => setAchievementForm((previous) => ({ ...previous, event_type: event.target.value }))}
            />
            <Input
              label="Р”РѕСЃС‚РёР¶РµРЅРёРµ"
              required
              value={achievementForm.achievement}
              onChange={(event) => setAchievementForm((previous) => ({ ...previous, achievement: event.target.value }))}
            />
            <Input
              label="Р”Р°С‚Р°"
              type="date"
              required
              value={achievementForm.achievement_date}
              onChange={(event) => setAchievementForm((previous) => ({ ...previous, achievement_date: event.target.value }))}
            />
            <TextArea
              label="РџСЂРёРјРµС‡Р°РЅРёСЏ"
              className="form-grid__full"
              value={achievementForm.notes}
              onChange={(event) => setAchievementForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeAchievementModal}>
                Р—Р°РєСЂС‹С‚СЊ
              </Button>
              <Button type="submit" disabled={savingAchievement}>
                {savingAchievement ? "РЎРѕС…СЂР°РЅРµРЅРёРµ..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
};

