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
  planned: "Р—Р°РїР»Р°РЅРёСЂРѕРІР°РЅРѕ",
  cancelled: "РћС‚РјРµРЅРµРЅРѕ",
  rescheduled: "РџРµСЂРµРЅРµСЃРµРЅРѕ",
  completed: "Р—Р°РІРµСЂС€РµРЅРѕ",
};

const exportCsv = (summary: ReportSummary, orgName: string | null): Blob => {
  const lines = [
    "РџРѕРєР°Р·Р°С‚РµР»СЊ;Р—РЅР°С‡РµРЅРёРµ",
    `РћСЂРіР°РЅРёР·Р°С†РёСЏ;${orgName ?? "Р’СЃРµ РѕСЂРіР°РЅРёР·Р°С†РёРё"}`,
    `Р’СЃРµРіРѕ РјРµСЂРѕРїСЂРёСЏС‚РёР№;${summary.total_events}`,
    `РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ;${summary.total_feedback}`,
    ...Object.entries(summary.status_counts).map(([status, count]) => `${statusLabels[status as keyof ReportSummary["status_counts"]]};${count}`),
  ];
  return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
};

export const ReportsPage = () => {
  const { user, orgProfile } = useAuth();
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
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РѕС‚С‡РµС‚");
    }
  };

  useEffect(() => {
    void load(user?.is_admin ? null : orgProfile?.organization_id);
  }, [orgProfile?.organization_id, user?.is_admin]);

  const orgName = useMemo(() => {
    if (!summary) {
      return null;
    }
    if (summary.organization_id === null) {
      return "Р’СЃРµ РѕСЂРіР°РЅРёР·Р°С†РёРё";
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
    setNotice("РћС‚С‡РµС‚ РІС‹РіСЂСѓР¶РµРЅ РІ CSV");
  };

  if (state === "loading") {
    return <StatusView state="loading" title="Р¤РѕСЂРјРёСЂСѓРµРј РѕС‚С‡РµС‚" description="РЎС‡РёС‚Р°РµРј СЃС‚Р°С‚РёСЃС‚РёРєСѓ РїРѕ РјРµСЂРѕРїСЂРёСЏС‚РёСЏРј." />;
  }

  if (state === "error") {
    return <StatusView state="error" title="РћС€РёР±РєР° С„РѕСЂРјРёСЂРѕРІР°РЅРёСЏ РѕС‚С‡РµС‚Р°" description={error ?? undefined} onRetry={() => void load()} />;
  }

  if (!summary) {
    return <StatusView state="empty" title="РќРµС‚ РґР°РЅРЅС‹С…" />;
  }

  return (
    <div className="page-grid">
      {notice ? <Notice tone="success" text={notice} /> : null}

      <Card
        title="РћС‚С‡РµС‚С‹ РїРѕ РјРµСЂРѕРїСЂРёСЏС‚РёСЏРј"
        subtitle="РЎРІРѕРґРЅР°СЏ Р°РЅР°Р»РёС‚РёРєР° РґР»СЏ Р°РґРјРёРЅРёСЃС‚СЂР°С†РёРё РђРџР— Рё РћРћ"
        actions={
          <div className="card-actions">
            {user?.is_admin ? (
              <Select
                label="РћРћ"
                value={selectedOrg}
                onChange={(event) => void changeOrg(event.target.value)}
                options={[
                  { value: "all", label: "Р’СЃРµ РѕСЂРіР°РЅРёР·Р°С†РёРё" },
                  ...organizations.map((org) => ({ value: String(org.id), label: org.name })),
                ]}
              />
            ) : null}
            <Button onClick={handleExport}>Р’С‹РіСЂСѓР·РёС‚СЊ CSV</Button>
          </div>
        }
      >
        <section className="stats-grid">
          <Card className="stats-card">
            <p className="stats-card__label">РћСЂРіР°РЅРёР·Р°С†РёСЏ</p>
            <strong className="stats-card__value">{orgName}</strong>
          </Card>
          <Card className="stats-card">
            <p className="stats-card__label">Р’СЃРµРіРѕ РјРµСЂРѕРїСЂРёСЏС‚РёР№</p>
            <strong className="stats-card__value">{summary.total_events}</strong>
          </Card>
          <Card className="stats-card">
            <p className="stats-card__label">РљРѕР»РёС‡РµСЃС‚РІРѕ РѕС‚Р·С‹РІРѕРІ</p>
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
