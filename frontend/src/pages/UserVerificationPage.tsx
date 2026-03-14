import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { useAutoRefresh } from "../shared/hooks/useAutoRefresh";
import { usePagination } from "../shared/hooks/usePagination";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Notice } from "../shared/ui/Notice";
import { NoticeStack } from "../shared/ui/NoticeStack";
import { Pagination } from "../shared/ui/Pagination";
import { PENDING_APPROVALS_UPDATED_EVENT } from "../shared/constants/verification";
import { StatusView } from "../shared/ui/StatusView";
import { formatDateTime } from "../shared/utils/date";
import type { ApprovalStatus, PendingCuratorRegistration, PendingOrganizationRegistration, User } from "../types/models";

type PageState = "loading" | "ready" | "error";

const PENDING_PAGE_SIZE = 8;
const CURATORS_PAGE_SIZE = 10;

const approvalStatusLabels: Record<ApprovalStatus, string> = {
  pending: "Ожидает подтверждения",
  approved: "Подтвержден",
  rejected: "Отклонен",
};

export const UserVerificationPage = () => {
  const { user } = useAuth();
  const [state, setState] = useState<PageState>("loading");
  const [pendingOrganizations, setPendingOrganizations] = useState<PendingOrganizationRegistration[]>([]);
  const [pendingCurators, setPendingCurators] = useState<PendingCuratorRegistration[]>([]);
  const [curators, setCurators] = useState<User[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async (background = false) => {
    if (!user) {
      return;
    }

    if (!background) {
      setState("loading");
      setError(null);
    }

    try {
      if (user.role === "admin") {
        const rows = await api.admin.listPendingOrganizations();
        setPendingOrganizations(rows);
        setPendingCurators([]);
        setCurators([]);
      } else if (user.role === "organization") {
        const [pendingRows, curatorRows] = await Promise.all([
          api.organization.listPendingCurators(),
          api.organization.listCurators(),
        ]);
        setPendingCurators(pendingRows);
        setCurators(curatorRows);
        setPendingOrganizations([]);
      } else {
        setPendingOrganizations([]);
        setPendingCurators([]);
        setCurators([]);
      }
      setState("ready");
    } catch (err) {
      if (background) {
        return;
      }
      setState("error");
      setError(err instanceof Error ? err.message : "Не удалось загрузить список заявок");
    }
  };

  useEffect(() => {
    void load();
  }, [user?.role]);

  useAutoRefresh(() => load(true), {
    enabled: state === "ready" && busyId === null,
  });

  const pendingOrganizationsPagination = usePagination(pendingOrganizations, PENDING_PAGE_SIZE);
  const pendingCuratorsPagination = usePagination(pendingCurators, PENDING_PAGE_SIZE);
  const curatorsPagination = usePagination(curators, CURATORS_PAGE_SIZE);

  const approveOrganization = async (organizationId: number) => {
    setBusyId(organizationId);
    setError(null);
    setSuccess(null);
    try {
      await api.admin.approveOrganization(organizationId);
      setPendingOrganizations((prev) => prev.filter((item) => item.organization_id !== organizationId));
      setSuccess("Организация подтверждена");
      window.dispatchEvent(new Event(PENDING_APPROVALS_UPDATED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось подтвердить организацию");
    } finally {
      setBusyId(null);
    }
  };

  const rejectOrganization = async (organizationId: number) => {
    setBusyId(organizationId);
    setError(null);
    setSuccess(null);
    try {
      await api.admin.rejectOrganization(organizationId);
      setPendingOrganizations((prev) => prev.filter((item) => item.organization_id !== organizationId));
      setSuccess("Заявка организации отклонена");
      window.dispatchEvent(new Event(PENDING_APPROVALS_UPDATED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отклонить организацию");
    } finally {
      setBusyId(null);
    }
  };

  const approveCurator = async (curatorId: number) => {
    setBusyId(curatorId);
    setError(null);
    setSuccess(null);
    try {
      await api.organization.approveCurator(curatorId);
      setPendingCurators((prev) => prev.filter((item) => item.user_id !== curatorId));
      setCurators((prev) =>
        prev.map((item) => (item.id === curatorId ? { ...item, approval_status: "approved" } : item)),
      );
      setSuccess("Классный руководитель подтвержден");
      window.dispatchEvent(new Event(PENDING_APPROVALS_UPDATED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось подтвердить классного руководителя");
    } finally {
      setBusyId(null);
    }
  };

  const rejectCurator = async (curatorId: number) => {
    setBusyId(curatorId);
    setError(null);
    setSuccess(null);
    try {
      await api.organization.rejectCurator(curatorId);
      setPendingCurators((prev) => prev.filter((item) => item.user_id !== curatorId));
      setCurators((prev) =>
        prev.map((item) => (item.id === curatorId ? { ...item, approval_status: "rejected" } : item)),
      );
      setSuccess("Заявка классного руководителя отклонена");
      window.dispatchEvent(new Event(PENDING_APPROVALS_UPDATED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отклонить классного руководителя");
    } finally {
      setBusyId(null);
    }
  };

  const assignCuratorClass = async (curator: User) => {
    const fullName = [curator.last_name, curator.first_name, curator.patronymic].filter(Boolean).join(" ");
    const value = window.prompt(
      `Введите закрепленный класс для ${fullName || curator.email} (формат: 7А)`,
      curator.responsible_class ?? "",
    );
    if (value === null) {
      return;
    }

    const normalizedClass = value.trim();
    if (!normalizedClass) {
      setError("Закрепленный класс не может быть пустым");
      return;
    }

    setBusyId(curator.id);
    setError(null);
    setSuccess(null);

    try {
      const updated = await api.organization.updateCuratorClass(curator.id, { responsible_class: normalizedClass });
      setCurators((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setPendingCurators((prev) =>
        prev.map((item) => (item.user_id === updated.id ? { ...item, responsible_class: updated.responsible_class } : item)),
      );
      setSuccess("Закрепленный класс куратора обновлен");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось назначить закрепленный класс");
    } finally {
      setBusyId(null);
    }
  };

  if (!user || (user.role !== "admin" && user.role !== "organization")) {
    return <StatusView state="error" title="Доступ запрещен" description="Страница доступна только администратору и ОО." />;
  }

  if (state === "loading") {
    return <StatusView state="loading" title="Загружаем заявки на подтверждение" />;
  }

  if (state === "error") {
    return <StatusView state="error" title="Ошибка загрузки" description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="page-grid">
      <NoticeStack>
        {error ? <Notice tone="error" text={error} /> : null}
        {success ? <Notice tone="success" text={success} /> : null}
      </NoticeStack>

      {user.role === "admin" ? (
        <Card
          title="Подтверждение образовательных организаций"
          subtitle="Заявки ОО на регистрацию"
          actions={
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={busyId !== null}>
              Обновить
            </Button>
          }
        >
          {pendingOrganizations.length === 0 ? (
            <StatusView state="empty" title="Новых заявок нет" />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Организация</th>
                      <th>Владелец</th>
                      <th>Email</th>
                      <th>Дата</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingOrganizationsPagination.pageItems.map((candidate) => {
                      const isBusy = busyId === candidate.organization_id;
                      return (
                        <tr key={candidate.organization_id}>
                          <td data-label="Организация">{candidate.organization_name}</td>
                          <td data-label="Владелец">{candidate.owner_full_name}</td>
                          <td data-label="Email">{candidate.owner_email}</td>
                          <td data-label="Дата">{formatDateTime(candidate.created_at)}</td>
                          <td data-label="Действия">
                            <div className="row-actions">
                              <Button
                                size="sm"
                                onClick={() => void approveOrganization(candidate.organization_id)}
                                disabled={isBusy || busyId !== null}
                              >
                                Подтвердить
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => void rejectOrganization(candidate.organization_id)}
                                disabled={isBusy || busyId !== null}
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
              <Pagination
                page={pendingOrganizationsPagination.page}
                totalPages={pendingOrganizationsPagination.totalPages}
                totalItems={pendingOrganizationsPagination.totalItems}
                pageSize={PENDING_PAGE_SIZE}
                itemLabel="заявок"
                onPageChange={pendingOrganizationsPagination.setPage}
              />
            </>
          )}
        </Card>
      ) : (
        <>
          <Card
            title="Подтверждение классных руководителей"
            subtitle="Заявки сотрудников вашей организации"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void load()} disabled={busyId !== null}>
                Обновить
              </Button>
            }
          >
            {pendingCurators.length === 0 ? (
              <StatusView state="empty" title="Новых заявок нет" />
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ФИО</th>
                        <th>Email</th>
                        <th>Должность</th>
                        <th>Закрепленный класс</th>
                        <th>Дата</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingCuratorsPagination.pageItems.map((candidate) => {
                        const isBusy = busyId === candidate.user_id;
                        return (
                          <tr key={candidate.user_id}>
                            <td data-label="ФИО">{[candidate.last_name, candidate.first_name, candidate.patronymic].filter(Boolean).join(" ")}</td>
                            <td data-label="Email">{candidate.email}</td>
                            <td data-label="Должность">{candidate.position || "-"}</td>
                            <td data-label="Закрепленный класс">{candidate.responsible_class || "-"}</td>
                            <td data-label="Дата">{formatDateTime(candidate.created_at)}</td>
                            <td data-label="Действия">
                              <div className="row-actions">
                                <Button
                                  size="sm"
                                  onClick={() => void approveCurator(candidate.user_id)}
                                  disabled={isBusy || busyId !== null}
                                >
                                  Подтвердить
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => void rejectCurator(candidate.user_id)}
                                  disabled={isBusy || busyId !== null}
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
                <Pagination
                  page={pendingCuratorsPagination.page}
                  totalPages={pendingCuratorsPagination.totalPages}
                  totalItems={pendingCuratorsPagination.totalItems}
                  pageSize={PENDING_PAGE_SIZE}
                  itemLabel="заявок"
                  onPageChange={pendingCuratorsPagination.setPage}
                />
              </>
            )}
          </Card>

          <Card
            title="Все кураторы организации"
            subtitle="Список сотрудников и назначение закрепленного класса"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void load()} disabled={busyId !== null}>
                Обновить
              </Button>
            }
          >
            {curators.length === 0 ? (
              <StatusView state="empty" title="Кураторы не найдены" />
            ) : (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ФИО</th>
                        <th>Email</th>
                        <th>Должность</th>
                        <th>Статус</th>
                        <th>Закрепленный класс</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {curatorsPagination.pageItems.map((curator) => {
                        const isBusy = busyId === curator.id;
                        return (
                          <tr key={curator.id}>
                            <td data-label="ФИО">{[curator.last_name, curator.first_name, curator.patronymic].filter(Boolean).join(" ")}</td>
                            <td data-label="Email">{curator.email}</td>
                            <td data-label="Должность">{curator.position || "-"}</td>
                            <td data-label="Статус">{approvalStatusLabels[curator.approval_status]}</td>
                            <td data-label="Закрепленный класс">{curator.responsible_class || "-"}</td>
                            <td data-label="Действия">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void assignCuratorClass(curator)}
                                disabled={isBusy || busyId !== null}
                              >
                                {isBusy ? "Сохраняем..." : "Назначить класс"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={curatorsPagination.page}
                  totalPages={curatorsPagination.totalPages}
                  totalItems={curatorsPagination.totalItems}
                  pageSize={CURATORS_PAGE_SIZE}
                  itemLabel="кураторов"
                  onPageChange={curatorsPagination.setPage}
                />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
