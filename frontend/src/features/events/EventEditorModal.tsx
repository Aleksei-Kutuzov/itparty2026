import { FormEvent, useMemo, useState } from "react";
import type { ClassProfile, Organization, User } from "../../types/models";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { Modal } from "../../shared/ui/Modal";
import { Select } from "../../shared/ui/Select";
import { TextArea } from "../../shared/ui/TextArea";
import { EventEditorForm, formatResponsibleOption } from "../../shared/utils/events";
import { matchesUserSearch, ROADMAP_OPTIONS, SCHEDULE_MODE_OPTIONS } from "../../shared/utils/roadmap";

type Props = {
  mode: "create" | "edit";
  form: EventEditorForm;
  organizations: Organization[];
  classProfiles: ClassProfile[];
  responsibleUsers: User[];
  saving: boolean;
  showOrganizationSelect: boolean;
  canSetGlobal: boolean;
  onChange: (patch: Partial<EventEditorForm>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
};

export const EventEditorModal = ({
  mode,
  form,
  organizations,
  classProfiles,
  responsibleUsers,
  saving,
  showOrganizationSelect,
  canSetGlobal,
  onChange,
  onClose,
  onSubmit,
}: Props) => {
  const [responsibleSearch, setResponsibleSearch] = useState("");

  const filteredResponsibles = useMemo(
    () => responsibleUsers.filter((user) => matchesUserSearch(user, responsibleSearch)),
    [responsibleUsers, responsibleSearch],
  );

  const organizationOptions = organizations.map((organization) => ({
    value: String(organization.id),
    label: organization.name,
  }));
  const targetRangeKindOptions: Array<{ value: EventEditorForm["target_range_kind"]; label: string }> = [
    { value: "class", label: "РљР»Р°СЃСЃС‹" },
    { value: "course", label: "РљСѓСЂСЃС‹" },
  ];
  const targetRangeValueOptions = useMemo(() => {
    const maxValue = form.target_range_kind === "course" ? 6 : 11;
    return Array.from({ length: maxValue }, (_, index) => {
      const value = String(index + 1);
      return { value, label: value };
    });
  }, [form.target_range_kind]);

  const toggleClassName = (className: string) => {
    const next = form.target_class_names.includes(className)
      ? form.target_class_names.filter((item) => item !== className)
      : [...form.target_class_names, className];
    onChange({ target_class_names: next });
  };

  const toggleResponsible = (userId: number) => {
    const next = form.responsible_user_ids.includes(userId)
      ? form.responsible_user_ids.filter((item) => item !== userId)
      : [...form.responsible_user_ids, userId];
    onChange({ responsible_user_ids: next });
  };

  return (
    <Modal
      title={mode === "create" ? "РќРѕРІРѕРµ РјРµСЂРѕРїСЂРёСЏС‚РёРµ" : "Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РјРµСЂРѕРїСЂРёСЏС‚РёСЏ"}
      onClose={onClose}
      width="lg"
    >
      <form className="form-grid form-grid--two" onSubmit={onSubmit}>
        {showOrganizationSelect ? (
          <Select
            label="РћСЂРіР°РЅРёР·Р°С†РёСЏ"
            value={form.organization_id}
            onChange={(event) =>
              onChange({
                organization_id: event.target.value,
                target_class_names: [],
                responsible_user_ids: [],
              })
            }
            options={organizationOptions}
          />
        ) : null}

        {canSetGlobal ? (
          <div className="field">
            <span className="field__label">РћС…РІР°С‚</span>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.is_all_organizations}
                onChange={(event) =>
                  onChange({
                    is_all_organizations: event.target.checked,
                    target_class_names: event.target.checked ? [] : form.target_class_names,
                    target_range_kind: event.target.checked ? form.target_range_kind : "class",
                    target_range_start: event.target.checked ? (form.target_range_start || "1") : "1",
                    target_range_end: event.target.checked ? (form.target_range_end || "11") : "11",
                    responsible_user_ids: [],
                  })
                }
              />
              <span>Р”РѕР±Р°РІРёС‚СЊ СЃСЂР°Р·Сѓ РґР»СЏ РІСЃРµС… РћРћ</span>
            </label>
          </div>
        ) : null}

        <Input
          label="РќР°Р·РІР°РЅРёРµ РјРµСЂРѕРїСЂРёСЏС‚РёСЏ"
          required
          value={form.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <Select
          label="Тип мероприятия"
          value={form.event_type}
          onChange={(event) => {
            const nextType = event.target.value as EventEditorForm["event_type"];
            onChange({ event_type: nextType, roadmap_direction: nextType });
          }}
          options={ROADMAP_OPTIONS}
        />
        <Select
          label="РќР°РїСЂР°РІР»РµРЅРёРµ"
          value={form.roadmap_direction}
          onChange={(event) => onChange({ roadmap_direction: event.target.value as EventEditorForm["roadmap_direction"] })}
          options={ROADMAP_OPTIONS}
        />
        <Input
          label="РЈС‡РµР±РЅС‹Р№ РіРѕРґ"
          placeholder="2025/2026"
          value={form.academic_year}
          onChange={(event) => onChange({ academic_year: event.target.value })}
        />
        <Select
          label="РЎСЂРѕРєРё РІС‹РїРѕР»РЅРµРЅРёСЏ"
          value={form.schedule_mode}
          onChange={(event) => onChange({ schedule_mode: event.target.value as EventEditorForm["schedule_mode"] })}
          options={SCHEDULE_MODE_OPTIONS}
        />
        <Input
          label="РћСЂРіР°РЅРёР·Р°С‚РѕСЂ"
          value={form.organizer}
          onChange={(event) => onChange({ organizer: event.target.value })}
        />

        {form.schedule_mode === "range" ? (
          <>
            <Input
              label="Р”Р°С‚Р° РЅР°С‡Р°Р»Р°"
              type="datetime-local"
              required
              value={form.starts_at}
              onChange={(event) => onChange({ starts_at: event.target.value })}
            />
            <Input
              label="Р”Р°С‚Р° РѕРєРѕРЅС‡Р°РЅРёСЏ"
              type="datetime-local"
              required
              value={form.ends_at}
              onChange={(event) => onChange({ ends_at: event.target.value })}
            />
          </>
        ) : null}

        {form.is_all_organizations ? (
          <>
            <Select
              label="Тип диапазона аудитории"
              value={form.target_range_kind}
              onChange={(event) => {
                const nextKind = event.target.value as EventEditorForm["target_range_kind"];
                const maxValue = nextKind === "course" ? 6 : 11;
                const nextStart = Math.min(Number(form.target_range_start || "1"), maxValue);
                const nextEnd = Math.min(Number(form.target_range_end || String(maxValue)), maxValue);
                onChange({
                  target_range_kind: nextKind,
                  target_range_start: String(nextStart),
                  target_range_end: String(nextEnd),
                });
              }}
              options={targetRangeKindOptions}
            />
            <Select
              label="С"
              value={form.target_range_start}
              onChange={(event) => onChange({ target_range_start: event.target.value })}
              options={targetRangeValueOptions}
            />
            <Select
              label="По"
              value={form.target_range_end}
              onChange={(event) => onChange({ target_range_end: event.target.value })}
              options={targetRangeValueOptions}
            />
            <p className="field__hint form-grid__full">
              Целевая аудитория будет сохранена как диапазон ({form.target_range_start || "?"}-{form.target_range_end || "?"} {form.target_range_kind === "course" ? "курсы" : "классы"}).
            </p>
          </>
        ) : null}

        {!form.is_all_organizations ? (
          <div className="form-grid__full field">
            <span className="field__label">Р¦РµР»РµРІР°СЏ Р°СѓРґРёС‚РѕСЂРёСЏ: РєР»Р°СЃСЃС‹ РћРћ</span>
            {classProfiles.length > 0 ? (
              <div className="chip-grid">
                {classProfiles.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={form.target_class_names.includes(item.class_name) ? "primary" : "secondary"}
                    onClick={() => toggleClassName(item.class_name)}
                  >
                    {item.class_name}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="field__hint">Р”Р»СЏ РІС‹Р±СЂР°РЅРЅРѕР№ РћРћ РµС‰Рµ РЅРµ Р·Р°РІРµРґРµРЅС‹ РєР»Р°СЃСЃС‹.</p>
            )}
          </div>
        ) : null}

        {!form.is_all_organizations ? (
          <Input
            label="Р¦РµР»РµРІР°СЏ Р°СѓРґРёС‚РѕСЂРёСЏ (С‚РµРєСЃС‚РѕРј, РµСЃР»Рё РЅСѓР¶РЅРѕ)"
            className="form-grid__full"
            value={form.target_audience}
            onChange={(event) => onChange({ target_audience: event.target.value })}
          />
        ) : null}

        <Input
          label="РЈСЂРѕРІРµРЅСЊ"
          value={form.event_level}
          onChange={(event) => onChange({ event_level: event.target.value })}
        />
        <Input
          label="Р¤РѕСЂРјР°С‚"
          value={form.event_format}
          onChange={(event) => onChange({ event_format: event.target.value })}
        />
        <Input
          label="РџР»Р°РЅ СѓС‡Р°СЃС‚РЅРёРєРѕРІ"
          type="number"
          min={0}
          value={form.participants_count}
          onChange={(event) => onChange({ participants_count: event.target.value })}
        />

        <div className="form-grid__full field">
          <span className="field__label">РћС‚РІРµС‚СЃС‚РІРµРЅРЅС‹Рµ</span>
          <Input
            label="РџРѕРёСЃРє РїРѕ Р¤РРћ"
            value={responsibleSearch}
            onChange={(event) => setResponsibleSearch(event.target.value)}
            placeholder="Р’РІРµРґРёС‚Рµ С„Р°РјРёР»РёСЋ РёР»Рё РёРјСЏ"
          />
          <div className="chip-grid">
            {filteredResponsibles.map((user) => (
              <Button
                key={user.id}
                type="button"
                size="sm"
                variant={form.responsible_user_ids.includes(user.id) ? "primary" : "secondary"}
                onClick={() => toggleResponsible(user.id)}
              >
                {formatResponsibleOption(user)}
              </Button>
            ))}
          </div>
        </div>

        <TextArea
          label="РћРїРёСЃР°РЅРёРµ"
          className="form-grid__full"
          value={form.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        <TextArea
          label="РџСЂРёРјРµС‡Р°РЅРёСЏ"
          className="form-grid__full"
          value={form.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
        />

        <div className="form-actions form-grid__full">
          <Button type="button" variant="ghost" onClick={onClose}>
            Р—Р°РєСЂС‹С‚СЊ
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

