import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Notice } from "../shared/ui/Notice";
import { Select } from "../shared/ui/Select";
import { StatusView } from "../shared/ui/StatusView";
import { downloadBlob } from "../shared/utils/download";
import type { Organization, ReportSummary } from "../types/models";

type PageState = "loading" | "ready" | "error";

const statusLabels: Record<keyof ReportSummary["status_counts"], string> = {
  planned: "Запланировано",
  cancelled: "Отменено",
  rescheduled: "Перенесено",
  completed: "Завершено",
};

const exportCsv = (summary: ReportSummary, orgName: string | null): Blob => {
  const lines = [
    "Показатель;Значение",
    `Организация;${orgName ?? "Все организации"}`,
    `Всего мероприятий;${summary.total_events}`,
    `Обратная связь;${summary.total_feedback}`,
    ...Object.entries(summary.status_counts).map(([status, count]) => `${statusLabels[status as keyof ReportSummary["status_counts"]]};${count}`),
  ];
  return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
};

export const ReportsPage = () => {
  const { user, staffProfile } = useAuth();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("all");
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async (orgId?: number | null) => {
    setState("loading");
    setError(null);
    try {
      const [summaryResult, orgsResult] = await Promise.all([
        api.events.reportSummary(orgId),
        api.orgs.list(),
      ]);
      setSummary(summaryResult);
      setOrganizations(orgsResult);
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить отчет");
    }
  };

  useEffect(() => {
    void load(user?.is_admin ? null : staffProfile?.organization_id);
  }, [staffProfile?.organization_id, user?.is_admin]);

  const orgName = useMemo(() => {
    if (!summary) {
      return null;
    }
    if (summary.organization_id === null) {
      return "Все организации";
    }
    return organizations.find((org) => org.id === summary.organization_id)?.name ?? `ID ${summary.organization_id}`;
  }, [organizations, summary]);

  const statusEntries = useMemo(() => {
    if (!summary) {
      return [];
    }
    return Object.entries(summary.status_counts) as Array<[keyof ReportSummary["status_counts"], number]>;
  }, [summary]);

  const statusMax = Math.max(...statusEntries.map((entry) => entry[1]), 1);

  const changeOrg = async (orgValue: string) => {
    setSelectedOrg(orgValue);
    const orgId = orgValue === "all" ? null : Number(orgValue);
    await load(orgId);
  };

  const handleExport = () => {
    if (!summary) {
      return;
    }
    const blob = exportCsv(summary, orgName);
    downloadBlob(blob, "event_report.csv");
    setNotice("Отчет выгружен в CSV");
  };

  if (state === "loading") {
    return <StatusView state="loading" title="Формируем отчет" description="Считаем статистику по мероприятиям." />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка формирования отчета" description={error ?? undefined} onRetry={() => void load()} />;
  }

  if (!summary) {
    return <StatusView state="empty" title="Нет данных" />;
  }

  return (
    <div className="page-grid">
      {notice ? <Notice tone="success" text={notice} /> : null}

      <Card
        title="Отчеты по мероприятиям"
        subtitle="Сводная аналитика для администрации АПЗ и ОО"
        actions={
          <div className="card-actions">
            {user?.is_admin ? (
              <Select
                label="ОО"
                value={selectedOrg}
                onChange={(event) => void changeOrg(event.target.value)}
                options={[
                  { value: "all", label: "Все организации" },
                  ...organizations.map((org) => ({ value: String(org.id), label: org.name })),
                ]}
              />
            ) : null}
            <Button onClick={handleExport}>Выгрузить CSV</Button>
          </div>
        }
      >
        <section className="stats-grid">
          <Card className="stats-card">
            <p className="stats-card__label">Организация</p>
            <strong className="stats-card__value">{orgName}</strong>
          </Card>
          <Card className="stats-card">
            <p className="stats-card__label">Всего мероприятий</p>
            <strong className="stats-card__value">{summary.total_events}</strong>
          </Card>
          <Card className="stats-card">
            <p className="stats-card__label">Количество отзывов</p>
            <strong className="stats-card__value">{summary.total_feedback}</strong>
          </Card>
        </section>

        <div className="report-bars">
          {statusEntries.map(([status, count]) => (
            <article key={status} className="report-bars__item">
              <header>
                <span>{statusLabels[status]}</span>
                <strong>{count}</strong>
              </header>
              <div className="report-bars__track">
                <div className={`report-bars__fill report-bars__fill--${status}`} style={{ width: `${(count / statusMax) * 100}%` }} />
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
};
