import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { Card } from "../shared/ui/Card";
import { StatusBadge } from "../shared/ui/Badge";
import { StatusView } from "../shared/ui/StatusView";
import type { EventItem, ReportSummary, Student } from "../types/models";
import { formatDateTime } from "../shared/utils/date";

type LoadState = "loading" | "ready" | "error";

export const DashboardPage = () => {
  const { user, orgProfile } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setState("loading");
    setError(null);
    try {
      const [eventsResult, studentsResult, summaryResult] = await Promise.all([
        api.events.list(),
        api.students.list(),
        api.events.reportSummary(user?.is_admin ? null : orgProfile?.organization_id),
      ]);
      setEvents(eventsResult);
      setStudents(studentsResult);
      setReport(summaryResult);
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РґР°РЅРЅС‹Рµ");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const nearestEvents = useMemo(
    () => [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 5),
    [events],
  );
  const topStudents = useMemo(() => [...students].sort((a, b) => b.rating - a.rating).slice(0, 5), [students]);

  if (state === "loading") {
    return <StatusView state="loading" title="Р—Р°РіСЂСѓР¶Р°РµРј dashboard" description="РћР±РЅРѕРІР»СЏРµРј СЃС‚Р°С‚РёСЃС‚РёРєСѓ Рё Р±Р»РёР¶Р°Р№С€РёРµ Р°РєС‚РёРІРЅРѕСЃС‚Рё." />;
  }

  if (state === "error") {
    return <StatusView state="error" title="РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid">
      <section className="stats-grid">
        <Card className="stats-card">
          <p className="stats-card__label">Р’СЃРµРіРѕ РјРµСЂРѕРїСЂРёСЏС‚РёР№</p>
          <strong className="stats-card__value">{report?.total_events ?? 0}</strong>
        </Card>
        <Card className="stats-card">
          <p className="stats-card__label">РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ</p>
          <strong className="stats-card__value">{report?.total_feedback ?? 0}</strong>
        </Card>
        <Card className="stats-card">
          <p className="stats-card__label">РЈС‡РµРЅРёРєРѕРІ РІ Р±Р°Р·Рµ</p>
          <strong className="stats-card__value">{students.length}</strong>
        </Card>
        <Card className="stats-card">
          <p className="stats-card__label">РћРћ</p>
          <strong className="stats-card__value">{user?.is_admin ? "Р’СЃРµ" : orgProfile?.organization_name}</strong>
        </Card>
      </section>

      <Card title="Р‘Р»РёР¶Р°Р№С€РёРµ РјРµСЂРѕРїСЂРёСЏС‚РёСЏ" subtitle="Р›РµРЅС‚Р° РїР»Р°РЅРѕРІС‹С… Рё РѕР±С‰РёС… СЃРѕР±С‹С‚РёР№">
        {nearestEvents.length === 0 ? (
          <StatusView state="empty" title="РЎРѕР±С‹С‚РёР№ РїРѕРєР° РЅРµС‚" description="РЎРѕР·РґР°Р№С‚Рµ РїРµСЂРІРѕРµ РјРµСЂРѕРїСЂРёСЏС‚РёРµ РІ СЂР°Р·РґРµР»Рµ В«РњРµСЂРѕРїСЂРёСЏС‚РёСЏВ»." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>РњРµСЂРѕРїСЂРёСЏС‚РёРµ</th>
                  <th>РџРµСЂРёРѕРґ</th>
                  <th>РћРћ</th>
                  <th>РЎС‚Р°С‚СѓСЃ</th>
                </tr>
              </thead>
              <tbody>
                {nearestEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      {event.description ? <p className="table__meta">{event.description}</p> : null}
                    </td>
                    <td>
                      {formatDateTime(event.starts_at)} - {formatDateTime(event.ends_at)}
                    </td>
                    <td>{event.organization_name ?? "РћР±С‰РµРµ РјРµСЂРѕРїСЂРёСЏС‚РёРµ"}</td>
                    <td>
                      <StatusBadge status={event.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Р›РёРґРµСЂС‹ СЂРµР№С‚РёРЅРіР°" subtitle="РўРѕРї-СѓС‡РµРЅРёРєРё РІР°С€РµР№ РћРћ/СЃРёСЃС‚РµРјС‹">
        {topStudents.length === 0 ? (
          <StatusView state="empty" title="РЎРїРёСЃРѕРє СѓС‡РµРЅРёРєРѕРІ РїСѓСЃС‚" description="Р”РѕР±Р°РІСЊС‚Рµ СѓС‡РµРЅРёРєРѕРІ РІ СЂР°Р·РґРµР»Рµ В«РЈС‡РµРЅРёРєРёВ»." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Р¤РРћ</th>
                  <th>РљР»Р°СЃСЃ</th>
                  <th>Р РµР№С‚РёРЅРі</th>
                  <th>РљРѕРЅРєСѓСЂСЃС‹ / РћР»РёРјРїРёР°РґС‹</th>
                </tr>
              </thead>
              <tbody>
                {topStudents.map((student) => (
                  <tr key={student.id}>
                    <td>{student.full_name}</td>
                    <td>{student.school_class}</td>
                    <td>{student.rating.toFixed(1)}</td>
                    <td>
                      <span className="table__meta">{student.contests || "-"}</span>
                      <span className="table__meta">{student.olympiads || "-"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
