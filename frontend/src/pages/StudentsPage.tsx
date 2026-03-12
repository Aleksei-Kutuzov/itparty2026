import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Input } from "../shared/ui/Input";
import { Modal } from "../shared/ui/Modal";
import { Notice } from "../shared/ui/Notice";
import { StatusView } from "../shared/ui/StatusView";
import { TextArea } from "../shared/ui/TextArea";
import { formatDateTime } from "../shared/utils/date";
import { formatStudentClass } from "../shared/utils/studentClass";
import type { EventItem, Organization, Participation, Student } from "../types/models";

type PageState = "loading" | "ready" | "error";

type StudentForm = {
  full_name: string;
  school_class: string;
  informatics_avg_score: string;
  physics_avg_score: string;
  mathematics_avg_score: string;
  notes: string;
};

type StudentModal = {
  mode: "create" | "edit";
  student?: Student;
};

const defaultStudentForm: StudentForm = {
  full_name: "",
  school_class: "",
  informatics_avg_score: "",
  physics_avg_score: "",
  mathematics_avg_score: "",
  notes: "",
};

const fromStudent = (student: Student): StudentForm => ({
  full_name: student.full_name,
  school_class: formatStudentClass(student.school_class),
  informatics_avg_score: student.informatics_avg_score?.toString() ?? "",
  physics_avg_score: student.physics_avg_score?.toString() ?? "",
  mathematics_avg_score: student.mathematics_avg_score?.toString() ?? "",
  notes: student.notes ?? "",
});

export const StudentsPage = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentParticipations, setStudentParticipations] = useState<Participation[]>([]);
  const [participationsState, setParticipationsState] = useState<PageState>("loading");
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [studentModal, setStudentModal] = useState<StudentModal | null>(null);
  const [studentForm, setStudentForm] = useState<StudentForm>(defaultStudentForm);
  const [savingStudent, setSavingStudent] = useState(false);

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
      setSelectedStudent((prev) => {
        if (studentsResult.length === 0) {
          return null;
        }
        if (!prev) {
          return studentsResult[0];
        }
        return studentsResult.find((student) => student.id === prev.id) ?? studentsResult[0];
      });
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить учеников");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const fetchParticipations = async () => {
      if (!selectedStudent) {
        setParticipationsState("ready");
        setStudentParticipations([]);
        return;
      }
      setParticipationsState("loading");
      try {
        const result = await api.participations.list({ student_id: selectedStudent.id });
        setStudentParticipations(result);
        setParticipationsState("ready");
      } catch {
        setParticipationsState("error");
      }
    };
    void fetchParticipations();
  }, [selectedStudent?.id]);

  const openCreate = () => {
    setStudentModal({ mode: "create" });
    setStudentForm(defaultStudentForm);
  };

  const openEdit = (student: Student) => {
    setStudentModal({ mode: "edit", student });
    setStudentForm(fromStudent(student));
  };

  const closeModal = () => {
    setStudentModal(null);
    setSavingStudent(false);
  };

  const parseOptionalScore = (value: string): number | null => {
    if (!value.trim()) {
      return null;
    }
    return Number(value);
  };

  const submitStudent = async (event: FormEvent) => {
    event.preventDefault();
    setSavingStudent(true);
    setError(null);
    setNotice(null);

    try {
      const payload = {
        full_name: studentForm.full_name.trim(),
        school_class: studentForm.school_class.trim(),
        informatics_avg_score: parseOptionalScore(studentForm.informatics_avg_score),
        physics_avg_score: parseOptionalScore(studentForm.physics_avg_score),
        mathematics_avg_score: parseOptionalScore(studentForm.mathematics_avg_score),
        notes: studentForm.notes.trim() || null,
      };

      if (studentModal?.mode === "edit" && studentModal.student) {
        await api.students.update(studentModal.student.id, payload);
        setNotice("Карточка ученика обновлена");
      } else {
        await api.students.create(payload);
        setNotice("Ученик добавлен");
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить карточку ученика");
    } finally {
      setSavingStudent(false);
    }
  };

  const doDelete = async (student: Student) => {
    if (!window.confirm(`Удалить карточку ученика «${student.full_name}»?`)) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.students.remove(student.id);
      setNotice("Карточка ученика удалена");
      if (selectedStudent?.id === student.id) {
        setSelectedStudent(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить ученика");
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
    return <StatusView state="loading" title="Загружаем карточки учеников" />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка загрузки" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid page-grid--split">
      {error ? <Notice tone="error" text={error} /> : null}
      {notice ? <Notice tone="success" text={notice} /> : null}

      <Card
        title="Список учеников"
        subtitle="Карточки учеников вашей области доступа"
        actions={
          canManageStudents ? (
            <Button onClick={openCreate} size="sm">
              Добавить ученика
            </Button>
          ) : undefined
        }
      >
        {students.length === 0 ? (
          <StatusView state="empty" title="Ученики не добавлены" description="Создайте карточку первого ученика." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Класс</th>
                  <th>ОО</th>
                  <th>Средний балл</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const values = [student.informatics_avg_score, student.physics_avg_score, student.mathematics_avg_score].filter(
                    (v): v is number => typeof v === "number",
                  );
                  const avg = values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;

                  return (
                    <tr key={student.id} className={selectedStudent?.id === student.id ? "table__row--active" : ""}>
                      <td>
                        <button className="link-button" type="button" onClick={() => setSelectedStudent(student)}>
                          {student.full_name}
                        </button>
                      </td>
                      <td>{formatStudentClass(student.school_class) || "-"}</td>
                      <td>{organizations.find((org) => org.id === student.organization_id)?.name ?? `ID ${student.organization_id}`}</td>
                      <td>{avg.toFixed(2)}</td>
                      <td>
                        {canManageStudents ? (
                          <div className="row-actions">
                            <Button size="sm" variant="secondary" onClick={() => openEdit(student)}>
                              Редактировать
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => void doDelete(student)}>
                              Удалить
                            </Button>
                          </div>
                        ) : (
                          <span className="table__meta">Только просмотр</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Карточка ученика" subtitle="Основные данные и записи об участии">
        {!selectedStudent ? (
          <StatusView state="empty" title="Ученик не выбран" description="Выберите ученика в таблице слева." />
        ) : (
          <div className="student-card">
            <dl className="kv-grid">
              <div>
                <dt>ФИО</dt>
                <dd>{selectedStudent.full_name}</dd>
              </div>
              <div>
                <dt>Класс</dt>
                <dd>{formatStudentClass(selectedStudent.school_class) || "-"}</dd>
              </div>
              <div>
                <dt>Информатика</dt>
                <dd>{selectedStudent.informatics_avg_score?.toFixed(2) ?? "-"}</dd>
              </div>
              <div>
                <dt>Физика</dt>
                <dd>{selectedStudent.physics_avg_score?.toFixed(2) ?? "-"}</dd>
              </div>
              <div>
                <dt>Математика</dt>
                <dd>{selectedStudent.mathematics_avg_score?.toFixed(2) ?? "-"}</dd>
              </div>
              <div>
                <dt>Заметки</dt>
                <dd>{selectedStudent.notes || "-"}</dd>
              </div>
            </dl>

            <h4 className="section-title">Участие в мероприятиях</h4>
            {participationsState === "loading" ? (
              <StatusView state="loading" title="Загрузка участия" />
            ) : participationsState === "error" ? (
              <StatusView state="error" title="Не удалось загрузить участие" />
            ) : participationRows.length === 0 ? (
              <StatusView state="empty" title="Участий пока нет" description="Заполните участие на странице с мероприятиями/участиями." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Мероприятие</th>
                      <th>Тип участия</th>
                      <th>Результат</th>
                      <th>Дата записи</th>
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
          </div>
        )}
      </Card>

      {studentModal ? (
        <Modal title={studentModal.mode === "create" ? "Новая карточка ученика" : "Редактирование карточки"} onClose={closeModal} width="lg">
          <form className="form-grid form-grid--two" onSubmit={submitStudent}>
            <Input
              label="ФИО"
              className="form-grid__full"
              required
              value={studentForm.full_name}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, full_name: event.target.value }))}
            />
            <Input
              label="Класс"
              required
              value={studentForm.school_class}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, school_class: event.target.value }))}
            />
            <Input
              label="Информатика"
              type="number"
              min={0}
              max={5}
              step={0.01}
              value={studentForm.informatics_avg_score}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, informatics_avg_score: event.target.value }))}
            />
            <Input
              label="Физика"
              type="number"
              min={0}
              max={5}
              step={0.01}
              value={studentForm.physics_avg_score}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, physics_avg_score: event.target.value }))}
            />
            <Input
              label="Математика"
              type="number"
              min={0}
              max={5}
              step={0.01}
              value={studentForm.mathematics_avg_score}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, mathematics_avg_score: event.target.value }))}
            />
            <TextArea
              label="Заметки"
              className="form-grid__full"
              value={studentForm.notes}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeModal}>
                Закрыть
              </Button>
              <Button type="submit" disabled={savingStudent}>
                {savingStudent ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
};
