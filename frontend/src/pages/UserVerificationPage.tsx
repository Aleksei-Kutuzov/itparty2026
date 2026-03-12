import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Notice } from "../shared/ui/Notice";
import { StatusView } from "../shared/ui/StatusView";
import { formatDateTime } from "../shared/utils/date";
import type { PendingUserRegistration } from "../types/models";

type PageState = "loading" | "ready" | "error";

const getFullName = (user: PendingUserRegistration): string =>
  [user.last_name, user.first_name, user.patronymic].filter(Boolean).join(" ");

export const UserVerificationPage = () => {
  const { user } = useAuth();
  const [state, setState] = useState<PageState>("loading");
  const [pendingUsers, setPendingUsers] = useState<PendingUserRegistration[]>([]);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    setState("loading");
    setError(null);
    try {
      const rows = await api.admin.listPendingUsers();
      setPendingUsers(rows);
      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить список заявок");
    }
  };

  useEffect(() => {
    if (!user?.is_admin) {
      return;
    }
    void load();
  }, [user?.is_admin]);

  const approveUser = async (userId: number) => {
    setBusyUserId(userId);
    setError(null);
    setSuccess(null);
    try {
      await api.admin.approveUser(userId);
      setPendingUsers((prev) => prev.filter((item) => item.user_id !== userId));
      setSuccess("Пользователь подтвержден");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось подтвердить пользователя");
    } finally {
      setBusyUserId(null);
    }
  };

  const rejectUser = async (candidate: PendingUserRegistration) => {
    const fullName = getFullName(candidate) || candidate.email;
    if (!window.confirm(`Отклонить заявку пользователя «${fullName}»?`)) {
      return;
    }

    setBusyUserId(candidate.user_id);
    setError(null);
    setSuccess(null);
    try {
      await api.admin.rejectUser(candidate.user_id);
      setPendingUsers((prev) => prev.filter((item) => item.user_id !== candidate.user_id));
      setSuccess("Заявка отклонена");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отклонить заявку");
    } finally {
      setBusyUserId(null);
    }
  };

  if (!user?.is_admin) {
    return <StatusView state="error" title="Доступ запрещен" description="Страница доступна только администраторам." />;
  }

  if (state === "loading") {
    return <StatusView state="loading" title="Загружаем заявки на верификацию" />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка загрузки" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid">
      {error ? <Notice tone="error" text={error} /> : null}
      {success ? <Notice tone="success" text={success} /> : null}

      <Card
        title="Верификация новых пользователей"
        subtitle="Подтвердите или отклоните заявки, чтобы управлять доступом в систему"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={busyUserId !== null}>
            Обновить список
          </Button>
        }
      >
        {pendingUsers.length === 0 ? (
          <StatusView state="empty" title="Новых заявок нет" description="Все новые пользователи уже обработаны." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Email</th>
                  <th>Организация</th>
                  <th>Должность</th>
                  <th>Дата заявки</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((candidate) => {
                  const isBusy = busyUserId === candidate.user_id;
                  return (
                    <tr key={candidate.user_id}>
                      <td>{getFullName(candidate) || "-"}</td>
                      <td>{candidate.email}</td>
                      <td>{candidate.organization_name ?? "Не указана"}</td>
                      <td>{candidate.position || "-"}</td>
                      <td>{formatDateTime(candidate.created_at)}</td>
                      <td>
                        <div className="row-actions">
                          <Button size="sm" onClick={() => void approveUser(candidate.user_id)} disabled={isBusy || busyUserId !== null}>
                            {isBusy ? "Обрабатываем..." : "Подтвердить"}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => void rejectUser(candidate)}
                            disabled={isBusy || busyUserId !== null}
                          >
                            Отклонить
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
