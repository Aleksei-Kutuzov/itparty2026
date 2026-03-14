import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { useAutoRefresh } from "../shared/hooks/useAutoRefresh";
import { Card } from "../shared/ui/Card";
import { StatusView } from "../shared/ui/StatusView";
import { formatDateTime } from "../shared/utils/date";
import { fetchAllPages } from "../shared/utils/fetchAllPages";
import { formatStudentClass } from "../shared/utils/studentClass";
import type { EventItem, Participation, Student } from "../types/models";

type LoadState = "loading" | "ready" | "error";

const averageScore = (student: Student): number => student.average_percent ?? 0;

export const DashboardPage = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const load = async (background = false) => {
    if (!background) {
      setState("loading");
      setError(null);
    }

    try {
      const [eventsResult, studentsResult, participationsResult] = await Promise.all([
        fetchAllPages((page) => api.events.list({ ...page })),
        fetchAllPages((page) => api.students.list(page)),
        fetchAllPages((page) => api.participations.list(page)),
      ]);
      setEvents(eventsResult);
      setStudents(studentsResult);
      setParticipations(participationsResult);
      setState("ready");
    } catch (err) {
      if (background) {
        return;
      }
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useAutoRefresh(() => load(true), {
    enabled: state === "ready",
  });

  const nearestEvents = useMemo(() => [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 5), [events]);
  const topStudents = useMemo(
    () =>
      [...students]
        .sort((a, b) => averageScore(b) - averageScore(a))
        .slice(0, 5)
        .map((student) => ({ student, avg: averageScore(student) })),
    [students],
  );

  if (state === "loading") {
    return <StatusView state="loading" title="Загружаем dashboard" description="Обновляем статистику и ключевые данные." />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка загрузки" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid">
      <section className="stats-grid">
        <Card className="stats-card">
          <p className="stats-card__label">Всего мероприятий</p>
          <strong className="stats-card__value">{events.length}</strong>
        </Card>
        <Card className="stats-card">
          <p className="stats-card__label">Записей участия</p>
          <strong className="stats-card__value">{participations.length}</strong>
        </Card>
        <Card className="stats-card">
          <p className="stats-card__label">Учеников в базе</p>
          <strong className="stats-card__value">{students.length}</strong>
        </Card>
        <Card className="stats-card">
          <p className="stats-card__label">Роль</p>
          <strong className="stats-card__value">{user?.role}</strong>
        </Card>
      </section>

      <Card title="Ближайшие мероприятия" subtitle="Лента актуальных событий">
        {nearestEvents.length === 0 ? (
          <StatusView state="empty" title="Событий пока нет" description="Создайте первое мероприятие в разделе «Мероприятия»." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Мероприятие</th>
                  <th>Тип</th>
                  <th>Период</th>
                </tr>
              </thead>
              <tbody>
                {nearestEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      {event.description ? <p className="table__meta">{event.description}</p> : null}
                    </td>
                    <td>{event.event_type}</td>
                    <td>
                      {formatDateTime(event.starts_at)} - {formatDateTime(event.ends_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Лидеры успеваемости" subtitle="Средний процент по ученикам">
        {topStudents.length === 0 ? (
          <StatusView state="empty" title="Список учеников пуст" description="Добавьте учеников в разделе «Ученики»." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Класс</th>
                  <th>Средний процент</th>
                </tr>
              </thead>
              <tbody>
                {topStudents.map(({ student, avg }) => (
                  <tr key={student.id}>
                    <td>{student.full_name}</td>
                    <td>{formatStudentClass(student.school_class)}</td>
                    <td>{avg.toFixed(2)}%</td>
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
