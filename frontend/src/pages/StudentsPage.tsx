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
import { formatStudentClass } from "../shared/utils/studentClass";
import type { EventItem, Organization, Student } from "../types/models";

type PageState = "loading" | "ready" | "error";

type StudentForm = {
  full_name: string;
  school_class: string;
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
  school_class: "",
  rating: "0",
  contests: "",
  olympiads: "",
  organization_id: "",
};

const fromStudent = (student: Student): StudentForm => {
  return {
    full_name: student.full_name,
    school_class: formatStudentClass(student.school_class),
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
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СѓС‡РµРЅРёРєРѕРІ");
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
      return [{ value: "", label: "Р’С‹Р±РµСЂРёС‚Рµ РћРћ" }, ...all];
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
        school_class: studentForm.school_class.trim(),
        rating: Number(studentForm.rating),
        contests: studentForm.contests.trim() || null,
        olympiads: studentForm.olympiads.trim() || null,
        organization_id: studentForm.organization_id ? Number(studentForm.organization_id) : undefined,
      };
      if (studentModal?.mode === "edit" && studentModal.student) {
        await api.students.update(studentModal.student.id, payload);
        setNotice("РљР°СЂС‚РѕС‡РєР° СѓС‡РµРЅРёРєР° РѕР±РЅРѕРІР»РµРЅР°");
      } else {
        await api.students.create(payload);
        setNotice("РЈС‡РµРЅРёРє РґРѕР±Р°РІР»РµРЅ");
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ СѓС‡РµРЅРёРєР°");
    } finally {
      setSavingStudent(false);
    }
  };

  const doDelete = async (student: Student) => {
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

  const doExport = async (student: Student) => {
    setError(null);
    try {
      const blob = await api.students.exportCard(student.id);
      downloadBlob(blob, `student_${student.id}.txt`);
      setNotice(`Р¤Р°Р№Р» student_${student.id}.txt РІС‹РіСЂСѓР¶РµРЅ`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹РіСЂСѓР·РёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ");
    }
  };

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
        title="РЎРїРёСЃРѕРє СѓС‡РµРЅРёРєРѕРІ РћРћ"
        subtitle="Р”РѕР±Р°РІР»РµРЅРёРµ, СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ Рё СЌРєСЃРїРѕСЂС‚"
        actions={
          <Button onClick={openCreate} size="sm">
            Р”РѕР±Р°РІРёС‚СЊ СѓС‡РµРЅРёРєР°
          </Button>
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
                  <th>РљР»Р°СЃСЃ / РіСЂСѓРїРїР°</th>
                  <th>Р РµР№С‚РёРЅРі</th>
                  <th>РћРћ</th>
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
                    <td>{student.rating.toFixed(1)}</td>
                    <td>{organizations.find((org) => org.id === student.organization_id)?.name ?? `ID ${student.organization_id}`}</td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(student)}>
                          Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void doExport(student)}>
                          Р’С‹РіСЂСѓР·РєР°
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void doDelete(student)}>
                          РЈРґР°Р»РёС‚СЊ
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

      <Card title="РљР°СЂС‚РѕС‡РєР° СѓС‡РµРЅРёРєР°" subtitle="РСЃС‚РѕСЂРёСЏ СѓС‡Р°СЃС‚РёСЏ Рё РїРѕРєР°Р·Р°С‚РµР»Рё">
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
                <dt>РљР»Р°СЃСЃ / РіСЂСѓРїРїР°</dt>
                <dd>{formatStudentClass(selectedStudent.school_class) || "-"}</dd>
              </div>
              <div>
                <dt>Р РµР№С‚РёРЅРі</dt>
                <dd>{selectedStudent.rating.toFixed(1)}</dd>
              </div>
              <div>
                <dt>РћРћ</dt>
                <dd>{organizations.find((org) => org.id === selectedStudent.organization_id)?.name ?? selectedStudent.organization_id}</dd>
              </div>
              <div>
                <dt>РљРѕРЅРєСѓСЂСЃС‹</dt>
                <dd>{selectedStudent.contests || "-"}</dd>
              </div>
              <div>
                <dt>РћР»РёРјРїРёР°РґС‹</dt>
                <dd>{selectedStudent.olympiads || "-"}</dd>
              </div>
            </dl>

            <h4 className="section-title">РЈС‡Р°СЃС‚РёРµ РІ РјРµСЂРѕРїСЂРёСЏС‚РёСЏС…</h4>
            {eventsState === "loading" ? (
              <StatusView state="loading" title="Р—Р°РіСЂСѓР·РєР° СѓС‡Р°СЃС‚РёСЏ" />
            ) : eventsState === "error" ? (
              <StatusView state="error" title="РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РјРµСЂРѕРїСЂРёСЏС‚РёСЏ СѓС‡РµРЅРёРєР°" />
            ) : studentEvents.length === 0 ? (
              <StatusView state="empty" title="РЈС‡Р°СЃС‚РёСЏ РїРѕРєР° РЅРµС‚" description="Р”РѕР±Р°РІСЊС‚Рµ СѓС‡РµРЅРёРєР° РІ РЅСѓР¶РЅРѕРµ РјРµСЂРѕРїСЂРёСЏС‚РёРµ РЅР° СЃС‚СЂР°РЅРёС†Рµ В«РњРµСЂРѕРїСЂРёСЏС‚РёСЏВ»." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>РњРµСЂРѕРїСЂРёСЏС‚РёРµ</th>
                      <th>РџРµСЂРёРѕРґ</th>
                      <th>РћРћ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentEvents.map((event) => (
                      <tr key={event.id}>
                        <td>{event.title}</td>
                        <td>
                          {formatDateTime(event.starts_at)} - {formatDateTime(event.ends_at)}
                        </td>
                        <td>{event.organization_name ?? "РћР±С‰РµРµ"}</td>
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
        <Modal title={studentModal.mode === "create" ? "РќРѕРІР°СЏ РєР°СЂС‚РѕС‡РєР° СѓС‡РµРЅРёРєР°" : "Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РєР°СЂС‚РѕС‡РєРё"} onClose={closeModal} width="lg">
          <form className="form-grid form-grid--two" onSubmit={submitStudent}>
            <Input
              label="Р¤РРћ"
              className="form-grid__full"
              required
              value={studentForm.full_name}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, full_name: event.target.value }))}
            />
            <Input
              label="РљР»Р°СЃСЃ / РіСЂСѓРїРїР°"
              required
              value={studentForm.school_class}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, school_class: event.target.value }))}
            />
            <Input
              label="Р РµР№С‚РёРЅРі"
              type="number"
              min={0}
              max={1000}
              value={studentForm.rating}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, rating: event.target.value }))}
            />
            {user?.is_admin ? (
              <Select
                label="РћСЂРіР°РЅРёР·Р°С†РёСЏ"
                value={studentForm.organization_id}
                required
                options={organizationOptions}
                onChange={(event) => setStudentForm((prev) => ({ ...prev, organization_id: event.target.value }))}
              />
            ) : null}
            <TextArea
              label="РЈС‡Р°СЃС‚РёРµ РІ РєРѕРЅРєСѓСЂСЃР°С…"
              className="form-grid__full"
              value={studentForm.contests}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, contests: event.target.value }))}
            />
            <TextArea
              label="РЈС‡Р°СЃС‚РёРµ РІ РѕР»РёРјРїРёР°РґР°С…"
              className="form-grid__full"
              value={studentForm.olympiads}
              onChange={(event) => setStudentForm((prev) => ({ ...prev, olympiads: event.target.value }))}
            />
            <div className="form-actions form-grid__full">
              <Button type="button" variant="ghost" onClick={closeModal}>
                Р—Р°РєСЂС‹С‚СЊ
              </Button>
              <Button type="submit" disabled={savingStudent}>
                {savingStudent ? "РЎРѕС…СЂР°РЅРµРЅРёРµ..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
};

