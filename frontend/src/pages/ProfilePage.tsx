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
  const { user, orgProfile, refresh } = useAuth();
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
      setSuccess("РџСЂРѕС„РёР»СЊ РѕР±РЅРѕРІР»РµРЅ");
    } catch (err) {
      setError(err instanceof Error ? err.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ РїСЂРѕС„РёР»СЊ");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user || !orgProfile) {
    return <StatusView state="loading" title="Р—Р°РіСЂСѓР¶Р°РµРј РїСЂРѕС„РёР»СЊ" />;
  }

  return (
    <div className="page-grid page-grid--split">
      {error ? <Notice tone="error" text={error} /> : null}
      {success ? <Notice tone="success" text={success} /> : null}

      <Card title="РќР°СЃС‚СЂРѕР№РєРё РїСЂРѕС„РёР»СЏ" subtitle="РџРµСЂСЃРѕРЅР°Р»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ СЃРѕС‚СЂСѓРґРЅРёРєР°">
        <form className="form-grid" onSubmit={submit}>
          <Input
            label="Р¤Р°РјРёР»РёСЏ"
            required
            value={form.last_name}
            onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
          />
          <Input
            label="РРјСЏ"
            required
            value={form.first_name}
            onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
          />
          <Input
            label="РћС‚С‡РµСЃС‚РІРѕ"
            value={form.patronymic}
            onChange={(event) => setForm((prev) => ({ ...prev, patronymic: event.target.value }))}
          />
          <Input label="Email (РЅРµ СЂРµРґР°РєС‚РёСЂСѓРµС‚СЃСЏ)" value={user.email} disabled />
          <div className="form-actions">
            <Button type="submit" disabled={saving}>
              {saving ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ"}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="РЎР»СѓР¶РµР±РЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ" subtitle="Р”Р°РЅРЅС‹Рµ РґРѕСЃС‚СѓРїР° Рё РїСЂРёРЅР°РґР»РµР¶РЅРѕСЃС‚СЊ Рє РћРћ">
        <dl className="kv-grid">
          <div>
            <dt>Р РѕР»СЊ</dt>
            <dd>{user.is_admin ? "РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РђРџР—" : "РЎРѕС‚СЂСѓРґРЅРёРє РћРћ"}</dd>
          </div>
          <div>
            <dt>РћСЂРіР°РЅРёР·Р°С†РёСЏ</dt>
            <dd>{orgProfile.organization_name}</dd>
          </div>
          <div>
            <dt>Р”РѕР»Р¶РЅРѕСЃС‚СЊ</dt>
            <dd>{orgProfile.position || "-"}</dd>
          </div>
          <div>
            <dt>РџСЂРѕС„РёР»СЊ СЃРѕР·РґР°РЅ</dt>
            <dd>{formatDateTime(orgProfile.created_at)}</dd>
          </div>
          <div>
            <dt>РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ</dt>
            <dd>{user.is_verified ? "РџРѕРґС‚РІРµСЂР¶РґРµРЅ" : "РќРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅ"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
};
