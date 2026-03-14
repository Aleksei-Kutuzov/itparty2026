import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { useAutoRefresh } from "../shared/hooks/useAutoRefresh";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Notice } from "../shared/ui/Notice";
import { NoticeStack } from "../shared/ui/NoticeStack";
import { Select } from "../shared/ui/Select";
import { StatusView } from "../shared/ui/StatusView";
import { downloadBlob } from "../shared/utils/download";
import { fetchAllPages } from "../shared/utils/fetchAllPages";
import type { Organization, ReportSummary } from "../types/models";

type PageState = "loading" | "ready" | "error";

const buildSummary = (
  eventsCount: number,
  studentsCount: number,
  participationsCount: number,
  eventTypeCounts: Record<string, number>,
): ReportSummary => ({
  total_events: eventsCount,
  total_students: studentsCount,
  total_participations: participationsCount,
  event_type_counts: eventTypeCounts,
});

const exportCsv = (summary: ReportSummary, orgName: string | null): Blob => {
  const lines = [
    "Показатель;Значение",
    `Организация;${orgName ?? "Все организации"}`,
    `Всего мероприятий;${summary.total_events}`,
    `Учеников;${summary.total_students}`,
    `Записей участия;${summary.total_participations}`,
    ...Object.entries(summary.event_type_counts).map(([eventType, count]) => `${eventType};${count}`),
  ];
  return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
};

export const ReportsPage = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("all");
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const resolvedOrgId =
    user?.role === "admin"
      ? selectedOrg === "all"
        ? null
        : Number(selectedOrg)
      : user?.role === "organization"
        ? user.organization_id ?? null
        : null;

  const load = async (orgId: number | null = resolvedOrgId, background = false) => {
    if (!background) {
      setState("loading");
      setError(null);
    }

    try {
      const [events, students, participations, orgsResult] = await Promise.all([
        fetchAllPages((page) => api.events.list(orgId ? { organization_id: orgId, ...page } : { ...page })),
        fetchAllPages((page) => api.students.list(orgId ? { organization_id: orgId, ...page } : page)),
        fetchAllPages((page) => api.participations.list(page)),
        api.orgs.list(),
      ]);

      const eventIds = new Set(events.map((event) => event.id));
      const filteredParticipations = participations.filter((item) => eventIds.has(item.event_id));
      const eventTypeCounts: Record<string, number> = {};
      events.forEach((event) => {
        eventTypeCounts[event.event_type] = (eventTypeCounts[event.event_type] ?? 0) + 1;
      });

      setSummary(buildSummary(events.length, students.length, filteredParticipations.length, eventTypeCounts));
      setOrganizations(orgsResult);
      setState("ready");
    } catch (err) {
      if (background) {
        return;
      }
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить отчет");
    }
  };

  useEffect(() => {
    if (user?.role === "organization" && user.organization_id) {
      setSelectedOrg(String(user.organization_id));
    }
  }, [user?.role, user?.organization_id]);

  useEffect(() => {
    void load(resolvedOrgId);
  }, [resolvedOrgId]);

  useAutoRefresh(() => load(resolvedOrgId, true), {
    enabled: state === "ready",
  });

  const orgName = useMemo(() => {
    if (resolvedOrgId === null) {
      return "Все организации";
    }
    return organizations.find((org) => org.id === resolvedOrgId)?.name ?? `ID ${resolvedOrgId}`;
  }, [organizations, resolvedOrgId]);

  const eventTypeEntries = useMemo(() => {
    if (!summary) {
      return [];
    }
    return Object.entries(summary.event_type_counts).sort((a, b) => b[1] - a[1]);
  }, [summary]);

  const statusMax = Math.max(...eventTypeEntries.map((entry) => entry[1]), 1);

  const changeOrg = async (orgValue: string) => {
    setSelectedOrg(orgValue);
  };

  const handleExport = () => {
    if (!summary) {
      return;
    }
    const blob = exportCsv(summary, orgName);
    downloadBlob(blob, "report.csv");
    setNotice("Отчет выгружен в CSV");
  };

  if (state === "loading") {
    return <StatusView state="loading" title="Формируем отчет" description="Считаем статистику по данным системы." />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка формирования отчета" description={error ?? undefined} onRetry={() => void load()} />;
  }

  if (!summary) {
    return <StatusView state="empty" title="Нет данных" />;
  }

  return (
    <div className="page-grid">
      <NoticeStack>{notice ? <Notice tone="success" text={notice} /> : null}</NoticeStack>

      <Card
        title="Отчеты по данным"
        subtitle="Сводная аналитика по мероприятиям и участию"
        actions={
          <div className="card-actions">
            {user?.role === "admin" ? (
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
            <p className="stats-card__label">Учеников</p>
            <strong className="stats-card__value">{summary.total_students}</strong>
          </Card>
          <Card className="stats-card">
            <p className="stats-card__label">Записей участия</p>
            <strong className="stats-card__value">{summary.total_participations}</strong>
          </Card>
        </section>

        <div className="report-bars">
          {eventTypeEntries.map(([eventType, count]) => (
            <article key={eventType} className="report-bars__item">
              <header>
                <span>{eventType}</span>
                <strong>{count}</strong>
              </header>
              <div className="report-bars__track">
                <div className="report-bars__fill" style={{ width: `${(count / statusMax) * 100}%` }} />
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
};
