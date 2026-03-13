import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Input } from "../shared/ui/Input";
import { Notice } from "../shared/ui/Notice";
import { Select } from "../shared/ui/Select";
import { StatusView } from "../shared/ui/StatusView";
import { downloadBlob } from "../shared/utils/download";
import type { ClassProfile, Organization, ProjectAnalysisExportType } from "../types/models";

type PageState = "loading" | "ready" | "error";

type ExportOption = {
  value: ProjectAnalysisExportType;
  title: string;
  description: string;
};

const EXPORT_OPTIONS: ExportOption[] = [
  {
    value: "class-info",
    title: "Паспорт класса",
    description: "Состав класса, год формирования и общее количество учеников.",
  },
  {
    value: "profile-performance",
    title: "Средний процент",
    description: "Список учеников класса и их средний процент успеваемости.",
  },
  {
    value: "olympiad",
    title: "Олимпиады",
    description: "Участие учеников класса в олимпиадах за выбранную четверть.",
  },
  {
    value: "apz-participation",
    title: "Участие в проекте",
    description: "Все участия учеников класса в мероприятиях проекта за выбранную четверть.",
  },
  {
    value: "research-works",
    title: "Исследовательские работы",
    description: "Работы учеников и места публикации или выступления.",
  },
  {
    value: "additional-education",
    title: "Дополнительное образование",
    description: "Программы дополнительного образования учеников выбранного класса.",
  },
  {
    value: "first-profession",
    title: "Первая профессия",
    description: "Данные по обучению первой профессии у учеников класса.",
  },
  {
    value: "external-career",
    title: "Внешние профориентационные события",
    description: "Мероприятия класса с организатором, уровнем, форматом и количеством участников.",
  },
];

const DEFAULT_PERIOD = new Date().toISOString().slice(0, 10);

const sanitizeFilePart = (value: string) =>
  value
    .trim()
    .replace(/[^0-9A-Za-zА-Яа-яЁё._-]+/g, "_")
    .replace(/^[_./-]+|[_./-]+$/g, "") || "report";

export const ProjectAnalysisPage = () => {
  const { user } = useAuth();
  const [state, setState] = useState<PageState>("loading");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [classProfiles, setClassProfiles] = useState<ClassProfile[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [className, setClassName] = useState("");
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [busyExport, setBusyExport] = useState<ProjectAnalysisExportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOrganizations = async () => {
    setState("loading");
    setError(null);
    try {
      const rows = await api.orgs.list();
      setOrganizations(rows);
      setOrganizationId((previous) => previous || (rows[0] ? String(rows[0].id) : ""));
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить организации");
    }
  };

  useEffect(() => {
    if (user?.role !== "admin") {
      return;
    }
    void loadOrganizations();
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "admin") {
      return;
    }
    if (!organizationId) {
      setClassProfiles([]);
      setClassName("");
      return;
    }

    const loadClassProfiles = async () => {
      setLoadingClasses(true);
      setError(null);
      try {
        const rows = await api.orgs.listClassProfiles(Number(organizationId));
        setClassProfiles(rows);
        setClassName((previous) => {
          if (rows.some((item) => item.class_name === previous)) {
            return previous;
          }
          return rows[0]?.class_name ?? "";
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить классы организации");
      } finally {
        setLoadingClasses(false);
      }
    };

    void loadClassProfiles();
  }, [organizationId, user?.role]);

  const selectedOrganization = useMemo(
    () => organizations.find((item) => item.id === Number(organizationId)) ?? null,
    [organizationId, organizations],
  );
  const selectedClassProfile = useMemo(
    () => classProfiles.find((item) => item.class_name === className) ?? null,
    [className, classProfiles],
  );

  const handleExport = async (exportType: ProjectAnalysisExportType) => {
    if (!organizationId) {
      setError("Выберите образовательную организацию");
      return;
    }
    if (!className) {
      setError("Выберите класс");
      return;
    }

    setBusyExport(exportType);
    setError(null);
    setNotice(null);
    try {
      const blob = await api.admin.exportProjectAnalysis({
        export_type: exportType,
        organization_id: Number(organizationId),
        class_name: className,
        period,
      });
      const fileName = [
        "analysis",
        exportType,
        sanitizeFilePart(selectedOrganization?.name ?? `org_${organizationId}`),
        sanitizeFilePart(className),
        period.split("-").join(""),
      ].join("_");
      downloadBlob(blob, `${fileName}.docx`);
      setNotice(`Документ "${EXPORT_OPTIONS.find((item) => item.value === exportType)?.title ?? exportType}" выгружен`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сформировать DOCX");
    } finally {
      setBusyExport(null);
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <StatusView
        state="error"
        title='Доступ запрещен'
        description='Страница анализа проекта доступна только администратору.'
      />
    );
  }

  if (state === "loading") {
    return (
      <StatusView
        state="loading"
        title='Загружаем анализ по проекту'
        description='Подготавливаем список организаций и классов для экспорта.'
      />
    );
  }

  if (state === "error") {
    return (
      <StatusView
        state="error"
        title='Ошибка загрузки'
        description={error ?? undefined}
        onRetry={() => void loadOrganizations()}
      />
    );
  }

  if (organizations.length === 0) {
    return (
      <StatusView
        state="empty"
        title='Нет организаций'
        description='Сначала подтвердите хотя бы одну образовательную организацию.'
      />
    );
  }

  return (
    <div className="page-grid project-analysis-page">
      {error ? <Notice tone="error" text={error} /> : null}
      {notice ? <Notice tone="success" text={notice} /> : null}

      <Card
        title='Анализ по проекту "Ракеты АПЗ"'
        subtitle='Экспорт DOCX-отчетов по выбранной образовательной организации, классу и отчетной дате.'
        actions={
          <Button variant="secondary" onClick={() => void loadOrganizations()} disabled={busyExport !== null || loadingClasses}>
            Обновить
          </Button>
        }
      >
        <div className="project-analysis__filters">
          <Select
            label="ОО"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            options={organizations.map((item) => ({
              value: String(item.id),
              label: item.name,
            }))}
          />
          <Select
            label="Класс"
            value={className}
            onChange={(event) => setClassName(event.target.value)}
            disabled={loadingClasses || classProfiles.length === 0}
            options={
              classProfiles.length > 0
                ? classProfiles.map((item) => ({
                    value: item.class_name,
                    label: item.class_name,
                  }))
                : [{ value: "", label: loadingClasses ? "Загрузка классов..." : "Нет классов" }]
            }
          />
          <Input
            label="Отчетная дата"
            type="date"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            max="2100-12-31"
          />
        </div>

        <div className="project-analysis__summary">
          <div>
            <span className="table__meta">Организация</span>
            <strong>{selectedOrganization?.name ?? "-"}</strong>
          </div>
          <div>
            <span className="table__meta">Класс</span>
            <strong>{selectedClassProfile?.class_name ?? "-"}</strong>
          </div>
          <div>
            <span className="table__meta">Год формирования</span>
            <strong>{selectedClassProfile?.formation_year ?? "-"}</strong>
          </div>
          <div>
            <span className="table__meta">Период отчета</span>
            <strong>{period}</strong>
          </div>
        </div>
      </Card>

      <div className="project-analysis__grid">
        {EXPORT_OPTIONS.map((item) => (
          <Card
            key={item.value}
            className="project-analysis__card"
            title={item.title}
            subtitle={item.description}
            actions={
              <Button
                size="sm"
                onClick={() => void handleExport(item.value)}
                disabled={!organizationId || !className || !period || loadingClasses || busyExport !== null}
              >
                {busyExport === item.value ? "Формируем..." : "Выгрузить DOCX"}
              </Button>
            }
          >
            <p className="project-analysis__meta">
              Документ будет построен по организации <strong>{selectedOrganization?.name ?? "-"}</strong> и классу{" "}
              <strong>{selectedClassProfile?.class_name ?? "-"}</strong>.
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
};
