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
import { downloadBlob } from "../shared/utils/download";
import { formatDateTime } from "../shared/utils/date";
import { composeStudentClass, parseStudentClass } from "../shared/utils/studentClass";
import type { EventItem, Organization, Student } from "../types/models";

type PageState = "loading" | "ready" | "error";

type StudentForm = {
  full_name: string;
  class_name: string;
  group_name: string;
  rating: string;
  contests: string;
  olympiads: string;
  organization_id: string;
};

type StudentModal = {
  mode: "create" | "edit";
  student?: Student;
};

const defaultStudentForm: StudentForm = {
  full_name: "",
  class_name: "",
  group_name: "",
  rating: "0",
  contests: "",
  olympiads: "",
  organization_id: "",
};

const fromStudent = (student: Student): StudentForm => {
  const parsedClass = parseStudentClass(student.school_class);
  return {
    full_name: student.full_name,
    class_name: parsedClass.className,
    group_name: parsedClass.groupName,
    rating: String(student.rating),
    contests: student.contests ?? "",
    olympiads: student.olympiads ?? "",
    organization_id: String(student.organization_id),
  };
};

export const StudentsPage = () => {
  const { user, orgProfile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentEvents, setStudentEvents] = useState<EventItem[]>([]);
  const [eventsState, setEventsState] = useState<PageState>("loading");
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [studentModal, setStudentModal] = useState<StudentModal | null>(null);
  const [studentForm, setStudentForm] = useState<StudentForm>(defaultStudentForm);
  const [savingStudent, setSavingStudent] = useState(false);

  const load = async () => {
    setState("loading");
    setError(null);
    try {
      const [studentsResult, orgsResult] = await Promise.all([api.students.list(), api.orgs.list()]);
      setStudents(studentsResult);
      setOrganizations(orgsResult);
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
    const fetchEvents = async () => {
      if (!selectedStudent) {
        setEventsState("ready");
        setStudentEvents([]);
        return;
      }
      setEventsState("loading");
      try {
        const result = await api.students.listEvents(selectedStudent.id);
        setStudentEvents(result);
        setEventsState("ready");
      } catch {
        setEventsState("error");
      }
    };
    void fetchEvents();
  }, [selectedStudent?.id]);

  const organizationOptions = useMemo(() => {
    const all = organizations.map((org) => ({ value: String(org.id), label: org.name }));
    if (user?.is_admin) {
      return [{ value: "", label: "Выберите ОО" }, ...all];
    }
    return all.filter((org) => org.value === String(orgProfile?.organization_id));
  }, [organizations, orgProfile?.organization_id, user?.is_admin]);

  const openCreate = () => {
    setStudentModal({ mode: "create" });
    setStudentForm({
      ...defaultStudentForm,
      organization_id: user?.is_admin ? "" : String(orgProfile?.organization_id ?? ""),
    });
  };

  const openEdit = (student: Student) => {
    setStudentModal({ mode: "edit", student });
    setStudentForm(fromStudent(student));
  };

  const closeModal = () => {
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
        school_class: composeStudentClass(studentForm.class_name.trim(), studentForm.group_name.trim()),
        rating: Number(studentForm.rating),
        contests: studentForm.contests.trim() || null,
        olympiads: studentForm.olympiads.trim() || null,
        organization_id: studentForm.organization_id ? Number(studentForm.organization_id) : undefined,
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

  const doExport = async (student: Student) => {
    setError(null);
    try {
      const blob = await api.students.exportCard(student.id);
      downloadBlob(blob, `student_${student.id}.txt`);
      setNotice(`Файл student_${student.id}.txt выгружен`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выгрузить карточку");
    }
  };

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
        title="Список учеников ОО"
        subtitle="Добавление, редактирование и экспорт"
        actions={
          <Button onClick={openCreate} size="sm">
            Добавить ученика
          </Button>
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
                  <th>Группа</th>
                  <th>Рейтинг</th>
                  <th>ОО</th>
                  <th>Действия</th>
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
                    <td>{parseStudentClass(student.school_class).className || "-"}</td>
                    <td>{parseStudentClass(student.school_class).groupName || "-"}</td>
                    <td>{student.rating.toFixed(1)}</td>
                    <td>{organizations.find((org) => org.id === student.organization_id)?.name ?? `ID ${student.organization_id}`}</td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(student)}>
                          Редактировать
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void doExport(student)}>
                          Выгрузка
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void doDelete(student)}>
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

      <Card title="Карточка ученика" subtitle="История участия и показатели">
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
                <dd>{parseStudentClass(selectedStudent.school_class).className || "-"}</dd>
              </div>
              <div>
                <dt>Группа</dt>
                <dd>{parseStudentClass(selectedStudent.school_class).groupName || "-"}</dd>
              </div>
              <div>
                <dt>Рейтинг</dt>
                <dd>{selectedStudent.rating.toFixed(1)}</dd>
              </div>
              <div>
                <dt>ОО</dt>
                <dd>{organizations.find((org) => org.id === selectedStudent.organization_id)?.name ?? selectedStudent.organization_id}</dd>
              </div>
              <div>
                <dt>Конкурсы</dt>
                <dd>{selectedStudent.contests || "-"}</dd>
              </div>
              <div>
                <dt>Олимпиады</dt>
                <dd>{selectedStudent.olympiads || "-"}</dd>
              </div>
            </dl>

            <h4 className="section-title">Участие в мероприятиях</h4>
            {eventsState === "loading" ? (
              <StatusView state="loading" title="Загрузка участия" />
            ) : eventsState === "error" ? (
              <StatusView state="error" title="Не удалось загрузить мероприятия ученика" />
            ) : studentEvents.length === 0 ? (
              <StatusView state="empty" title="Участия пока нет" description="Добавьте ученика в нужное мероприятие на странице «Мероприятия»." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Мероприятие</th>
                      <th>Период</th>
                      <th>ОО</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentEvents.map((event) => (
                      <tr key={event.id}>
                        <td>{event.title}</td>
                        <td>
                          {formatDateTime(event.starts_at)} - {formatDateTime(event.ends_at)}
                        </td>
                        <td>{event.organization_name ?? "Общее"}</td>
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
              value={studentForm.class_name}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, class_name: event.target.value }))}
            />
            <Input
              label="Группа"
              required
              value={studentForm.group_name}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, group_name: event.target.value }))}
            />
            <Input
              label="Рейтинг"
              type="number"
              min={0}
              max={1000}
              value={studentForm.rating}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, rating: event.target.value }))}
            />
            {user?.is_admin ? (
              <Select
                label="Организация"
                value={studentForm.organization_id}
                required
                options={organizationOptions}
                onChange={(event) => setStudentForm((prev) => ({ ...prev, organization_id: event.target.value }))}
              />
            ) : null}
            <TextArea
              label="Участие в конкурсах"
              className="form-grid__full"
              value={studentForm.contests}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, contests: event.target.value }))}
            />
            <TextArea
              label="Участие в олимпиадах"
              className="form-grid__full"
              value={studentForm.olympiads}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, olympiads: event.target.value }))}
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
