import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { useAutoRefresh } from "../shared/hooks/useAutoRefresh";
import { usePagination } from "../shared/hooks/usePagination";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Input } from "../shared/ui/Input";
import { Modal } from "../shared/ui/Modal";
import { Notice } from "../shared/ui/Notice";
import { NoticeStack } from "../shared/ui/NoticeStack";
import { Pagination } from "../shared/ui/Pagination";
import { Select } from "../shared/ui/Select";
import { StatusView } from "../shared/ui/StatusView";
import { TextArea } from "../shared/ui/TextArea";
import { formatDateTime } from "../shared/utils/date";
import { fetchAllPages } from "../shared/utils/fetchAllPages";
import { formatStudentClass } from "../shared/utils/studentClass";
import type {
  EventItem,
  Organization,
  Participation,
  Student,
  StudentAchievement,
  StudentAchievementCreatePayload,
  StudentAdditionalEducation,
  StudentAdditionalEducationCreatePayload,
  StudentFirstProfession,
  StudentFirstProfessionCreatePayload,
  StudentResearchWork,
  StudentResearchWorkCreatePayload,
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
  event_name: string;
  achievement: string;
  achievement_date: string;
  notes: string;
};

type AchievementModal = {
  mode: "create" | "edit";
  achievement?: StudentAchievement;
};

type ResearchWorkForm = {
  work_title: string;
  publication_or_presentation_place: string;
};

type ResearchWorkModal = {
  mode: "create" | "edit";
  item?: StudentResearchWork;
};

type AdditionalEducationForm = {
  program_name: string;
  provider_organization: string;
};

type AdditionalEducationModal = {
  mode: "create" | "edit";
  item?: StudentAdditionalEducation;
};

type FirstProfessionForm = {
  educational_organization: string;
  training_program: string;
  study_period: string;
  document: string;
};

type FirstProfessionModal = {
  mode: "create" | "edit";
  item?: StudentFirstProfession;
};

const defaultStudentForm: StudentForm = {
  full_name: "",
  average_percent: "",
  notes: "",
};

const defaultAchievementForm: AchievementForm = {
  event_name: "",
  achievement: "Участник",
  achievement_date: new Date().toISOString().slice(0, 10),
  notes: "",
};

const defaultResearchWorkForm: ResearchWorkForm = {
  work_title: "",
  publication_or_presentation_place: "",
};

const defaultAdditionalEducationForm: AdditionalEducationForm = {
  program_name: "",
  provider_organization: "",
};

const defaultFirstProfessionForm: FirstProfessionForm = {
  educational_organization: "",
  training_program: "",
  study_period: "",
  document: "",
};

const fromStudent = (student: Student): StudentForm => ({
  full_name: student.full_name,
  average_percent: student.average_percent?.toString() ?? "",
  notes: student.notes ?? "",
});

const fromAchievement = (achievement: StudentAchievement): AchievementForm => ({
  event_name: achievement.event_name || achievement.achievement,
  achievement:
    achievement.event_name &&
    achievement.event_name.trim() &&
    achievement.event_name.trim() === achievement.achievement.trim()
      ? "Участник"
      : achievement.achievement,
  achievement_date: achievement.achievement_date.slice(0, 10),
  notes: achievement.notes ?? "",
});

const fromResearchWork = (item: StudentResearchWork): ResearchWorkForm => ({
  work_title: item.work_title,
  publication_or_presentation_place: item.publication_or_presentation_place,
});

const fromAdditionalEducation = (item: StudentAdditionalEducation): AdditionalEducationForm => ({
  program_name: item.program_name,
  provider_organization: item.provider_organization,
});

const fromFirstProfession = (item: StudentFirstProfession): FirstProfessionForm => ({
  educational_organization: item.educational_organization,
  training_program: item.training_program,
  study_period: item.study_period,
  document: item.document,
});

const parseOptionalPercent = (value: string): number | null => {
  if (!value.trim()) {
    return null;
  }
  return Number(value);
};

const STUDENTS_PAGE_SIZE = 10;
const DETAILS_PAGE_SIZE = 5;

export const StudentsPage = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [studentParticipations, setStudentParticipations] = useState<Participation[]>([]);
  const [studentAchievements, setStudentAchievements] = useState<StudentAchievement[]>([]);
  const [studentResearchWorks, setStudentResearchWorks] = useState<StudentResearchWork[]>([]);
  const [studentAdditionalEducation, setStudentAdditionalEducation] = useState<StudentAdditionalEducation[]>([]);
  const [studentFirstProfessions, setStudentFirstProfessions] = useState<StudentFirstProfession[]>([]);
  const [participationsState, setParticipationsState] = useState<PageState>("loading");
  const [achievementsState, setAchievementsState] = useState<PageState>("loading");
  const [researchWorksState, setResearchWorksState] = useState<PageState>("loading");
  const [additionalEducationState, setAdditionalEducationState] = useState<PageState>("loading");
  const [firstProfessionsState, setFirstProfessionsState] = useState<PageState>("loading");

  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [studentModal, setStudentModal] = useState<StudentModal | null>(null);
  const [studentForm, setStudentForm] = useState<StudentForm>(defaultStudentForm);
  const [savingStudent, setSavingStudent] = useState(false);

  const [achievementModal, setAchievementModal] = useState<AchievementModal | null>(null);
  const [achievementForm, setAchievementForm] = useState<AchievementForm>(defaultAchievementForm);
  const [savingAchievement, setSavingAchievement] = useState(false);

  const [researchWorkModal, setResearchWorkModal] = useState<ResearchWorkModal | null>(null);
  const [researchWorkForm, setResearchWorkForm] = useState<ResearchWorkForm>(defaultResearchWorkForm);
  const [savingResearchWork, setSavingResearchWork] = useState(false);

  const [additionalEducationModal, setAdditionalEducationModal] = useState<AdditionalEducationModal | null>(null);
  const [additionalEducationForm, setAdditionalEducationForm] = useState<AdditionalEducationForm>(defaultAdditionalEducationForm);
  const [savingAdditionalEducation, setSavingAdditionalEducation] = useState(false);

  const [firstProfessionModal, setFirstProfessionModal] = useState<FirstProfessionModal | null>(null);
  const [firstProfessionForm, setFirstProfessionForm] = useState<FirstProfessionForm>(defaultFirstProfessionForm);
  const [savingFirstProfession, setSavingFirstProfession] = useState(false);

  const canManageStudents = user?.role === "curator" || user?.role === "admin";
  const hasAssignedClass = Boolean(user?.responsible_class?.trim());
  const canCreateStudents = user?.role === "admin" || (user?.role === "curator" && hasAssignedClass);
  const resetStudentDetails = () => {
    setParticipationsState("ready");
    setStudentParticipations([]);
    setAchievementsState("ready");
    setStudentAchievements([]);
    setResearchWorksState("ready");
    setStudentResearchWorks([]);
    setAdditionalEducationState("ready");
    setStudentAdditionalEducation([]);
    setFirstProfessionsState("ready");
    setStudentFirstProfessions([]);
  };

  const loadStudentDetails = async (studentId: number, background = false) => {
    if (!background) {
      setParticipationsState("loading");
      setAchievementsState("loading");
      setResearchWorksState("loading");
      setAdditionalEducationState("loading");
      setFirstProfessionsState("loading");
    }

    try {
      const [participations, achievements, researchWorks, additionalEducation, firstProfessions] = await Promise.all([
        fetchAllPages((page) => api.participations.list({ student_id: studentId, ...page })),
        api.students.listAchievements(studentId),
        api.students.listResearchWorks(studentId),
        api.students.listAdditionalEducation(studentId),
        api.students.listFirstProfessions(studentId),
      ]);
      setStudentParticipations(participations);
      setStudentAchievements(achievements);
      setStudentResearchWorks(researchWorks);
      setStudentAdditionalEducation(additionalEducation);
      setStudentFirstProfessions(firstProfessions);
      setParticipationsState("ready");
      setAchievementsState("ready");
      setResearchWorksState("ready");
      setAdditionalEducationState("ready");
      setFirstProfessionsState("ready");
    } catch {
      if (background) {
        return;
      }
      setParticipationsState("error");
      setAchievementsState("error");
      setResearchWorksState("error");
      setAdditionalEducationState("error");
      setFirstProfessionsState("error");
    }
  };

  const load = async (background = false) => {
    if (!background) {
      setState("loading");
      setError(null);
    }

    try {
      const [studentsResult, orgsResult, eventsResult] = await Promise.all([
        fetchAllPages((page) => api.students.list(page)),
        api.orgs.list(),
        fetchAllPages((page) => api.events.list({ ...page })),
      ]);
      const currentSelectedId = selectedStudent?.id ?? null;
      const nextSelected =
        studentsResult.length === 0
          ? null
          : currentSelectedId
            ? studentsResult.find((student) => student.id === currentSelectedId) ?? studentsResult[0]
            : studentsResult[0];

      setStudents(studentsResult);
      setOrganizations(orgsResult);
      setEvents(eventsResult);
      setSelectedStudent(nextSelected);

      if (background) {
        if (nextSelected && nextSelected.id === currentSelectedId) {
          await loadStudentDetails(nextSelected.id, true);
        } else if (!nextSelected) {
          resetStudentDetails();
        }
      }

      setState("ready");
    } catch (err) {
      if (background) {
        return;
      }
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить учеников");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useAutoRefresh(
    () => load(true),
    {
      enabled:
        state === "ready" &&
        !studentModal &&
        !achievementModal &&
        !researchWorkModal &&
        !additionalEducationModal &&
        !firstProfessionModal &&
        !savingStudent &&
        !savingAchievement &&
        !savingResearchWork &&
        !savingAdditionalEducation &&
        !savingFirstProfession,
    },
  );

  useEffect(() => {
    if (!selectedStudent) {
      resetStudentDetails();
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

    if (studentModal?.mode === "create" && user?.role === "curator" && !hasAssignedClass) {
      setError("Нельзя добавлять учеников, пока ОО не назначит вам закрепленный класс");
      return;
    }

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
        setNotice("Карточка ученика обновлена");
      } else {
        await api.students.create(payload);
        setNotice("Ученик добавлен");
      }

      closeStudentModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить карточку ученика");
    } finally {
      setSavingStudent(false);
    }
  };

  const deleteStudent = async (student: Student) => {
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

  const submitAchievement = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedStudent) {
      return;
    }

    setSavingAchievement(true);
    setError(null);
    setNotice(null);

    try {
      const olympiadName = achievementForm.event_name.trim();
      const olympiadResult = achievementForm.achievement.trim() || "Участник";
      if (!olympiadName) {
        throw new Error("Укажите название олимпиады");
      }
      const payload: StudentAchievementCreatePayload = {
        event_name: olympiadName,
        event_type: "Олимпиада",
        achievement: olympiadResult,
        achievement_date: achievementForm.achievement_date,
        notes: achievementForm.notes.trim() || null,
      };

      if (achievementModal?.mode === "edit" && achievementModal.achievement) {
        await api.students.updateAchievement(selectedStudent.id, achievementModal.achievement.id, payload);
        setNotice("Олимпиада обновлена");
      } else {
        await api.students.createAchievement(selectedStudent.id, payload);
        setNotice("Олимпиада добавлена");
      }

      closeAchievementModal();
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить олимпиаду");
    } finally {
      setSavingAchievement(false);
    }
  };

  const deleteAchievement = async (achievement: StudentAchievement) => {
    if (!selectedStudent) {
      return;
    }
    if (!window.confirm(`Удалить олимпиаду «${achievement.achievement}»?`)) {
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await api.students.removeAchievement(selectedStudent.id, achievement.id);
      setNotice("Олимпиада удалена");
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить олимпиаду");
    }
  };

  const openCreateResearchWork = () => {
    setResearchWorkModal({ mode: "create" });
    setResearchWorkForm(defaultResearchWorkForm);
  };

  const openEditResearchWork = (item: StudentResearchWork) => {
    setResearchWorkModal({ mode: "edit", item });
    setResearchWorkForm(fromResearchWork(item));
  };

  const closeResearchWorkModal = () => {
    setResearchWorkModal(null);
    setSavingResearchWork(false);
  };

  const submitResearchWork = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedStudent) {
      return;
    }

    setSavingResearchWork(true);
    setError(null);
    setNotice(null);

    try {
      const payload: StudentResearchWorkCreatePayload = {
        work_title: researchWorkForm.work_title.trim(),
        publication_or_presentation_place: researchWorkForm.publication_or_presentation_place.trim(),
      };

      if (researchWorkModal?.mode === "edit" && researchWorkModal.item) {
        await api.students.updateResearchWork(selectedStudent.id, researchWorkModal.item.id, payload);
        setNotice("Запись НИР/проекта обновлена");
      } else {
        await api.students.createResearchWork(selectedStudent.id, payload);
        setNotice("Запись НИР/проекта добавлена");
      }

      closeResearchWorkModal();
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить запись НИР/проекта");
    } finally {
      setSavingResearchWork(false);
    }
  };

  const deleteResearchWork = async (item: StudentResearchWork) => {
    if (!selectedStudent) {
      return;
    }
    if (!window.confirm(`Удалить запись «${item.work_title}»?`)) {
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await api.students.removeResearchWork(selectedStudent.id, item.id);
      setNotice("Запись НИР/проекта удалена");
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить запись НИР/проекта");
    }
  };

  const openCreateAdditionalEducation = () => {
    setAdditionalEducationModal({ mode: "create" });
    setAdditionalEducationForm(defaultAdditionalEducationForm);
  };

  const openEditAdditionalEducation = (item: StudentAdditionalEducation) => {
    setAdditionalEducationModal({ mode: "edit", item });
    setAdditionalEducationForm(fromAdditionalEducation(item));
  };

  const closeAdditionalEducationModal = () => {
    setAdditionalEducationModal(null);
    setSavingAdditionalEducation(false);
  };

  const submitAdditionalEducation = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedStudent) {
      return;
    }

    setSavingAdditionalEducation(true);
    setError(null);
    setNotice(null);

    try {
      const payload: StudentAdditionalEducationCreatePayload = {
        program_name: additionalEducationForm.program_name.trim(),
        provider_organization: additionalEducationForm.provider_organization.trim(),
      };

      if (additionalEducationModal?.mode === "edit" && additionalEducationModal.item) {
        await api.students.updateAdditionalEducation(selectedStudent.id, additionalEducationModal.item.id, payload);
        setNotice("Запись дополнительного образования обновлена");
      } else {
        await api.students.createAdditionalEducation(selectedStudent.id, payload);
        setNotice("Запись дополнительного образования добавлена");
      }

      closeAdditionalEducationModal();
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить запись дополнительного образования");
    } finally {
      setSavingAdditionalEducation(false);
    }
  };

  const deleteAdditionalEducation = async (item: StudentAdditionalEducation) => {
    if (!selectedStudent) {
      return;
    }
    if (!window.confirm(`Удалить запись «${item.program_name}»?`)) {
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await api.students.removeAdditionalEducation(selectedStudent.id, item.id);
      setNotice("Запись дополнительного образования удалена");
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить запись дополнительного образования");
    }
  };

  const openCreateFirstProfession = () => {
    setFirstProfessionModal({ mode: "create" });
    setFirstProfessionForm(defaultFirstProfessionForm);
  };

  const openEditFirstProfession = (item: StudentFirstProfession) => {
    setFirstProfessionModal({ mode: "edit", item });
    setFirstProfessionForm(fromFirstProfession(item));
  };

  const closeFirstProfessionModal = () => {
    setFirstProfessionModal(null);
    setSavingFirstProfession(false);
  };

  const submitFirstProfession = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedStudent) {
      return;
    }

    setSavingFirstProfession(true);
    setError(null);
    setNotice(null);

    try {
      const payload: StudentFirstProfessionCreatePayload = {
        educational_organization: firstProfessionForm.educational_organization.trim(),
        training_program: firstProfessionForm.training_program.trim(),
        study_period: firstProfessionForm.study_period.trim(),
        document: firstProfessionForm.document.trim(),
      };

      if (firstProfessionModal?.mode === "edit" && firstProfessionModal.item) {
        await api.students.updateFirstProfession(selectedStudent.id, firstProfessionModal.item.id, payload);
        setNotice("Запись первой профессии обновлена");
      } else {
        await api.students.createFirstProfession(selectedStudent.id, payload);
        setNotice("Запись первой профессии добавлена");
      }

      closeFirstProfessionModal();
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить запись первой профессии");
    } finally {
      setSavingFirstProfession(false);
    }
  };

  const deleteFirstProfession = async (item: StudentFirstProfession) => {
    if (!selectedStudent) {
      return;
    }
    if (!window.confirm(`Удалить запись «${item.training_program}»?`)) {
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await api.students.removeFirstProfession(selectedStudent.id, item.id);
      setNotice("Запись первой профессии удалена");
      await loadStudentDetails(selectedStudent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить запись первой профессии");
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
  const organizationNameById = useMemo(
    () => Object.fromEntries(organizations.map((organization) => [organization.id, organization.name])),
    [organizations],
  );
  const studentsPagination = usePagination(students, STUDENTS_PAGE_SIZE);
  const participationPagination = usePagination(participationRows, DETAILS_PAGE_SIZE, [selectedStudent?.id]);
  const achievementsPagination = usePagination(studentAchievements, DETAILS_PAGE_SIZE, [selectedStudent?.id]);
  const researchPagination = usePagination(studentResearchWorks, DETAILS_PAGE_SIZE, [selectedStudent?.id]);
  const additionalEducationPagination = usePagination(studentAdditionalEducation, DETAILS_PAGE_SIZE, [selectedStudent?.id]);
  const firstProfessionPagination = usePagination(studentFirstProfessions, DETAILS_PAGE_SIZE, [selectedStudent?.id]);

  useEffect(() => {
    if (!selectedStudent) {
      return;
    }

    const selectedIndex = students.findIndex((student) => student.id === selectedStudent.id);
    if (selectedIndex >= 0) {
      studentsPagination.setPage(Math.floor(selectedIndex / STUDENTS_PAGE_SIZE) + 1);
    }
  }, [selectedStudent?.id, students]);

  if (state === "loading") {
    return <StatusView state="loading" title="Загружаем карточки учеников" />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка загрузки" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid page-grid--split">
      <NoticeStack>
        {error ? <Notice tone="error" text={error} /> : null}
        {notice ? <Notice tone="success" text={notice} /> : null}
        {user?.role === "curator" && !hasAssignedClass ? (
          <Notice tone="info" text="Пока ОО не назначит вам закрепленный класс, создание учеников недоступно." />
        ) : null}
      </NoticeStack>

      <Card
        title="Список учеников"
        subtitle="Карточки учеников в доступной области"
        actions={
          canCreateStudents ? (
            <Button onClick={openCreateStudent} size="sm">
              Добавить ученика
            </Button>
          ) : undefined
        }
      >
        {students.length === 0 ? (
          <StatusView state="empty" title="Ученики не добавлены" description="Создайте карточку первого ученика." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ФИО</th>
                    <th>Класс</th>
                    <th>ОО</th>
                    <th>Средний процент</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsPagination.pageItems.map((student) => (
                    <tr key={student.id} className={selectedStudent?.id === student.id ? "table__row--active" : ""}>
                      <td>
                        <button className="link-button" type="button" onClick={() => setSelectedStudent(student)}>
                          {student.full_name}
                        </button>
                      </td>
                      <td>{formatStudentClass(student.school_class) || "-"}</td>
                      <td>{organizationNameById[student.organization_id] ?? `ID ${student.organization_id}`}</td>
                      <td>{student.average_percent?.toFixed(2) ?? "-"}%</td>
                      <td>
                        {canManageStudents ? (
                          <div className="row-actions">
                            <Button size="sm" variant="secondary" onClick={() => openEditStudent(student)}>
                              Редактировать
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => void deleteStudent(student)}>
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
            <Pagination
              page={studentsPagination.page}
              totalPages={studentsPagination.totalPages}
              totalItems={studentsPagination.totalItems}
              pageSize={STUDENTS_PAGE_SIZE}
              itemLabel="учеников"
              onPageChange={studentsPagination.setPage}
            />
          </>
        )}
      </Card>

      <Card title="Карточка ученика" subtitle="Основные данные и достижения">
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
                <dt>Средний процент</dt>
                <dd>{selectedStudent.average_percent?.toFixed(2) ?? "-"}%</dd>
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
              <StatusView state="empty" title="Участий пока нет" description="Заполните участие на странице с мероприятиями." />
            ) : (
              <>
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
                      {participationPagination.pageItems.map((item) => (
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
                <Pagination
                  page={participationPagination.page}
                  totalPages={participationPagination.totalPages}
                  totalItems={participationPagination.totalItems}
                  pageSize={DETAILS_PAGE_SIZE}
                  itemLabel="записей участия"
                  onPageChange={participationPagination.setPage}
                />
              </>
            )}

            <div className="student-card__section-header">
              <h4 className="section-title" style={{ margin: 0 }}>
                Олимпиады
              </h4>
              {canManageStudents ? (
                <Button size="sm" onClick={openCreateAchievement}>
                  Добавить олимпиаду
                </Button>
              ) : null}
            </div>

            {achievementsState === "loading" ? (
              <StatusView state="loading" title="Загрузка олимпиад" />
            ) : achievementsState === "error" ? (
              <StatusView state="error" title="Не удалось загрузить олимпиады" />
            ) : studentAchievements.length === 0 ? (
              <StatusView state="empty" title="Олимпиад пока нет" />
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Олимпиада</th>
                        <th>Результат</th>
                        <th>Дата</th>
                        <th>Примечания</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {achievementsPagination.pageItems.map((item) => (
                        <tr key={item.id}>
                          <td>{item.event_name || item.achievement}</td>
                          <td>{item.achievement}</td>
                          <td>{item.achievement_date}</td>
                          <td>{item.notes || "-"}</td>
                          <td>
                            {canManageStudents ? (
                              <div className="row-actions">
                                <Button size="sm" variant="secondary" onClick={() => openEditAchievement(item)}>
                                  Изменить
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => void deleteAchievement(item)}>
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
                <Pagination
                  page={achievementsPagination.page}
                  totalPages={achievementsPagination.totalPages}
                  totalItems={achievementsPagination.totalItems}
                  pageSize={DETAILS_PAGE_SIZE}
                  itemLabel="олимпиад"
                  onPageChange={achievementsPagination.setPage}
                />
              </>
            )}

            <div className="student-card__section-header">
              <h4 className="section-title" style={{ margin: 0 }}>
                Научно-исследовательская работа / проект
              </h4>
              {canManageStudents ? (
                <Button size="sm" onClick={openCreateResearchWork}>
                  Загрузить НИР / проект
                </Button>
              ) : null}
            </div>

            {researchWorksState === "loading" ? (
              <StatusView state="loading" title="Загрузка НИР / проекта" />
            ) : researchWorksState === "error" ? (
              <StatusView state="error" title="Не удалось загрузить НИР / проект" />
            ) : studentResearchWorks.length === 0 ? (
              <StatusView state="empty" title="Записей НИР / проекта пока нет" />
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Название работы</th>
                        <th>Публикация</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {researchPagination.pageItems.map((item) => (
                        <tr key={item.id}>
                          <td>{item.work_title}</td>
                          <td>{item.publication_or_presentation_place}</td>
                          <td>
                            {canManageStudents ? (
                              <div className="row-actions">
                                <Button size="sm" variant="secondary" onClick={() => openEditResearchWork(item)}>
                                  Изменить
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => void deleteResearchWork(item)}>
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
                <Pagination
                  page={researchPagination.page}
                  totalPages={researchPagination.totalPages}
                  totalItems={researchPagination.totalItems}
                  pageSize={DETAILS_PAGE_SIZE}
                  itemLabel="записей"
                  onPageChange={researchPagination.setPage}
                />
              </>
            )}

            <div className="student-card__section-header">
              <h4 className="section-title" style={{ margin: 0 }}>
                Дополнительное образование
              </h4>
              {canManageStudents ? (
                <Button size="sm" onClick={openCreateAdditionalEducation}>
                  Загрузить доп. образование
                </Button>
              ) : null}
            </div>

            {additionalEducationState === "loading" ? (
              <StatusView state="loading" title="Загрузка дополнительного образования" />
            ) : additionalEducationState === "error" ? (
              <StatusView state="error" title="Не удалось загрузить дополнительное образование" />
            ) : studentAdditionalEducation.length === 0 ? (
              <StatusView state="empty" title="Записей дополнительного образования пока нет" />
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Наименование программы + период учёбы</th>
                        <th>Организация</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {additionalEducationPagination.pageItems.map((item) => (
                        <tr key={item.id}>
                          <td>{item.program_name}</td>
                          <td>{item.provider_organization}</td>
                          <td>
                            {canManageStudents ? (
                              <div className="row-actions">
                                <Button size="sm" variant="secondary" onClick={() => openEditAdditionalEducation(item)}>
                                  Изменить
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => void deleteAdditionalEducation(item)}>
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
                <Pagination
                  page={additionalEducationPagination.page}
                  totalPages={additionalEducationPagination.totalPages}
                  totalItems={additionalEducationPagination.totalItems}
                  pageSize={DETAILS_PAGE_SIZE}
                  itemLabel="записей"
                  onPageChange={additionalEducationPagination.setPage}
                />
              </>
            )}

            <div className="student-card__section-header">
              <h4 className="section-title" style={{ margin: 0 }}>
                Первая профессия
              </h4>
              {canManageStudents ? (
                <Button size="sm" onClick={openCreateFirstProfession}>
                  Загрузить первую профессию
                </Button>
              ) : null}
            </div>

            {firstProfessionsState === "loading" ? (
              <StatusView state="loading" title="Загрузка первой профессии" />
            ) : firstProfessionsState === "error" ? (
              <StatusView state="error" title="Не удалось загрузить первую профессию" />
            ) : studentFirstProfessions.length === 0 ? (
              <StatusView state="empty" title="Записей по первой профессии пока нет" />
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Образовательная организация</th>
                        <th>Программа обучения</th>
                        <th>Период обучения</th>
                        <th>Документ</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {firstProfessionPagination.pageItems.map((item) => (
                        <tr key={item.id}>
                          <td>{item.educational_organization}</td>
                          <td>{item.training_program}</td>
                          <td>{item.study_period}</td>
                          <td>{item.document}</td>
                          <td>
                            {canManageStudents ? (
                              <div className="row-actions">
                                <Button size="sm" variant="secondary" onClick={() => openEditFirstProfession(item)}>
                                  Изменить
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => void deleteFirstProfession(item)}>
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
                <Pagination
                  page={firstProfessionPagination.page}
                  totalPages={firstProfessionPagination.totalPages}
                  totalItems={firstProfessionPagination.totalItems}
                  pageSize={DETAILS_PAGE_SIZE}
                  itemLabel="записей"
                  onPageChange={firstProfessionPagination.setPage}
                />
              </>
            )}
          </div>
        )}
      </Card>

      {studentModal ? (
        <Modal title={studentModal.mode === "create" ? "Новая карточка ученика" : "Редактирование карточки"} onClose={closeStudentModal} width="lg">
          <form className="form-grid form-grid--two" onSubmit={submitStudent}>
            <Input
              label="ФИО"
              className="form-grid__full"
              required
              value={studentForm.full_name}
              onChange={(event) => setStudentForm((previous) => ({ ...previous, full_name: event.target.value }))}
            />
            <p className="field__hint form-grid__full">
              Класс ученика устанавливается автоматически по закрепленному классу сотрудника.
            </p>
            <Input
              label="Средний процент"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={studentForm.average_percent}
              onChange={(event) => setStudentForm((previous) => ({ ...previous, average_percent: event.target.value }))}
            />
            <TextArea
              label="Заметки"
              className="form-grid__full"
              value={studentForm.notes}
              onChange={(event) => setStudentForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeStudentModal}>
                Закрыть
              </Button>
              <Button type="submit" disabled={savingStudent}>
                {savingStudent ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {achievementModal ? (
        <Modal title={achievementModal.mode === "create" ? "Новая олимпиада" : "Редактирование олимпиады"} onClose={closeAchievementModal}>
          <form className="form-grid form-grid--two" onSubmit={submitAchievement}>
            <Input
              label="Олимпиада"
              required
              value={achievementForm.event_name}
              onChange={(event) => setAchievementForm((previous) => ({ ...previous, event_name: event.target.value }))}
            />
            <Select
              label="Результат"
              value={achievementForm.achievement}
              onChange={(event) => setAchievementForm((previous) => ({ ...previous, achievement: event.target.value }))}
              options={[
                { value: "Участник", label: "Участник" },
                { value: "Победитель", label: "Победитель" },
                { value: "Призер", label: "Призер" },
              ]}
            />
            <Input
              label="Дата"
              type="date"
              required
              value={achievementForm.achievement_date}
              onChange={(event) => setAchievementForm((previous) => ({ ...previous, achievement_date: event.target.value }))}
            />
            <TextArea
              label="Примечания"
              className="form-grid__full"
              value={achievementForm.notes}
              onChange={(event) => setAchievementForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeAchievementModal}>
                Закрыть
              </Button>
              <Button type="submit" disabled={savingAchievement}>
                {savingAchievement ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {researchWorkModal ? (
        <Modal title={researchWorkModal.mode === "create" ? "Загрузка НИР / проекта" : "Редактирование НИР / проекта"} onClose={closeResearchWorkModal}>
          <form className="form-grid form-grid--two" onSubmit={submitResearchWork}>
            <Input
              label="Название работы"
              className="form-grid__full"
              required
              value={researchWorkForm.work_title}
              onChange={(event) => setResearchWorkForm((previous) => ({ ...previous, work_title: event.target.value }))}
            />
            <Input
              label="Публикация"
              className="form-grid__full"
              required
              value={researchWorkForm.publication_or_presentation_place}
              onChange={(event) =>
                setResearchWorkForm((previous) => ({ ...previous, publication_or_presentation_place: event.target.value }))
              }
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeResearchWorkModal}>
                Закрыть
              </Button>
              <Button type="submit" disabled={savingResearchWork}>
                {savingResearchWork ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {additionalEducationModal ? (
        <Modal
          title={additionalEducationModal.mode === "create" ? "Загрузка дополнительного образования" : "Редактирование дополнительного образования"}
          onClose={closeAdditionalEducationModal}
        >
          <form className="form-grid form-grid--two" onSubmit={submitAdditionalEducation}>
            <Input
              label="Наименование программы + период учёбы"
              className="form-grid__full"
              required
              value={additionalEducationForm.program_name}
              onChange={(event) => setAdditionalEducationForm((previous) => ({ ...previous, program_name: event.target.value }))}
            />
            <Input
              label="Организация"
              className="form-grid__full"
              required
              value={additionalEducationForm.provider_organization}
              onChange={(event) =>
                setAdditionalEducationForm((previous) => ({ ...previous, provider_organization: event.target.value }))
              }
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeAdditionalEducationModal}>
                Закрыть
              </Button>
              <Button type="submit" disabled={savingAdditionalEducation}>
                {savingAdditionalEducation ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {firstProfessionModal ? (
        <Modal title={firstProfessionModal.mode === "create" ? "Загрузка первой профессии" : "Редактирование первой профессии"} onClose={closeFirstProfessionModal}>
          <form className="form-grid form-grid--two" onSubmit={submitFirstProfession}>
            <Input
              label="Образовательная организация"
              required
              value={firstProfessionForm.educational_organization}
              onChange={(event) =>
                setFirstProfessionForm((previous) => ({ ...previous, educational_organization: event.target.value }))
              }
            />
            <Input
              label="Программа обучения"
              required
              value={firstProfessionForm.training_program}
              onChange={(event) => setFirstProfessionForm((previous) => ({ ...previous, training_program: event.target.value }))}
            />
            <Input
              label="Период обучения"
              required
              value={firstProfessionForm.study_period}
              onChange={(event) => setFirstProfessionForm((previous) => ({ ...previous, study_period: event.target.value }))}
            />
            <TextArea
              label="Документ"
              className="form-grid__full"
              required
              value={firstProfessionForm.document}
              onChange={(event) => setFirstProfessionForm((previous) => ({ ...previous, document: event.target.value }))}
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeFirstProfessionModal}>
                Закрыть
              </Button>
              <Button type="submit" disabled={savingFirstProfession}>
                {savingFirstProfession ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
};
