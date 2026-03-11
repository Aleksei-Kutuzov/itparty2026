import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../app/providers/AuthProvider";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Input } from "../shared/ui/Input";
import { Notice } from "../shared/ui/Notice";
import { StatusView } from "../shared/ui/StatusView";
import { formatDateTime } from "../shared/utils/date";

type ProfileForm = {
  first_name: string;
  last_name: string;
  patronymic: string;
};

export const ProfilePage = () => {
  const { user, staffProfile, refresh } = useAuth();
  const [form, setForm] = useState<ProfileForm>({
    first_name: "",
    last_name: "",
    patronymic: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    setForm({
      first_name: user.first_name,
      last_name: user.last_name,
      patronymic: user.patronymic ?? "",
    });
    setLoading(false);
  }, [user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.auth.updateProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        patronymic: form.patronymic.trim() || null,
      });
      await refresh();
      setSuccess("Профиль обновлен");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить профиль");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user || !staffProfile) {
    return <StatusView state="loading" title="Загружаем профиль" />;
  }

  return (
    <div className="page-grid page-grid--split">
      {error ? <Notice tone="error" text={error} /> : null}
      {success ? <Notice tone="success" text={success} /> : null}

      <Card title="Настройки профиля" subtitle="Персональные данные сотрудника">
        <form className="form-grid" onSubmit={submit}>
          <Input
            label="Фамилия"
            required
            value={form.last_name}
            onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
          />
          <Input
            label="Имя"
            required
            value={form.first_name}
            onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
          />
          <Input
            label="Отчество"
            value={form.patronymic}
            onChange={(event) => setForm((prev) => ({ ...prev, patronymic: event.target.value }))}
          />
          <Input label="Email (не редактируется)" value={user.email} disabled />
          <div className="form-actions">
            <Button type="submit" disabled={saving}>
              {saving ? "Сохраняем..." : "Сохранить изменения"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Служебная информация" subtitle="Данные доступа и принадлежность к ОО">
        <dl className="kv-grid">
          <div>
            <dt>Роль</dt>
            <dd>{user.is_admin ? "Администратор АПЗ" : "Сотрудник ОО"}</dd>
          </div>
          <div>
            <dt>Организация</dt>
            <dd>{staffProfile.organization_name}</dd>
          </div>
          <div>
            <dt>Должность</dt>
            <dd>{staffProfile.position || "-"}</dd>
          </div>
          <div>
            <dt>Профиль создан</dt>
            <dd>{formatDateTime(staffProfile.created_at)}</dd>
          </div>
          <div>
            <dt>Подтверждение</dt>
            <dd>{user.is_verified ? "Подтвержден" : "Не подтвержден"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
};
