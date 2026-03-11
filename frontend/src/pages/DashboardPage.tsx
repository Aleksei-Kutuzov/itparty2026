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
  const { user, staffProfile } = useAuth();
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
        api.events.reportSummary(user?.is_admin ? null : staffProfile?.organization_id),
      ]);
      setEvents(eventsResult);
      setStudents(studentsResult);
      setReport(summaryResult);
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные");
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
    return <StatusView state="loading" title="Загружаем dashboard" description="Обновляем статистику и ближайшие активности." />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка загрузки" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid">
      <section className="stats-grid">
        <Card className="stats-card">
          <p className="stats-card__label">Всего мероприятий</p>
          <strong className="stats-card__value">{report?.total_events ?? 0}</strong>
        </Card>
        <Card className="stats-card">
          <p className="stats-card__label">Обратная связь</p>
          <strong className="stats-card__value">{report?.total_feedback ?? 0}</strong>
        </Card>
        <Card className="stats-card">
          <p className="stats-card__label">Учеников в базе</p>
          <strong className="stats-card__value">{students.length}</strong>
        </Card>
        <Card className="stats-card">
          <p className="stats-card__label">ОО</p>
          <strong className="stats-card__value">{user?.is_admin ? "Все" : staffProfile?.organization_name}</strong>
        </Card>
      </section>

      <Card title="Ближайшие мероприятия" subtitle="Лента плановых и общих событий">
        {nearestEvents.length === 0 ? (
          <StatusView state="empty" title="Событий пока нет" description="Создайте первое мероприятие в разделе «Мероприятия»." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Мероприятие</th>
                  <th>Период</th>
                  <th>ОО</th>
                  <th>Статус</th>
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
                    <td>{event.organization_name ?? "Общее мероприятие"}</td>
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

      <Card title="Лидеры рейтинга" subtitle="Топ-ученики вашей ОО/системы">
        {topStudents.length === 0 ? (
          <StatusView state="empty" title="Список учеников пуст" description="Добавьте учеников в разделе «Ученики»." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Класс</th>
                  <th>Рейтинг</th>
                  <th>Конкурсы / Олимпиады</th>
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
