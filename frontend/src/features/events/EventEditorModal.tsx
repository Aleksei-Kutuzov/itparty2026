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
      title={mode === "create" ? "Новое мероприятие" : "Редактирование мероприятия"}
      onClose={onClose}
      width="lg"
    >
      <form className="form-grid form-grid--two" onSubmit={onSubmit}>
        {showOrganizationSelect ? (
          <Select
            label="Организация"
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
            <span className="field__label">Охват</span>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.is_all_organizations}
                onChange={(event) =>
                  onChange({
                    is_all_organizations: event.target.checked,
                    target_class_names: event.target.checked ? [] : form.target_class_names,
                    responsible_user_ids: [],
                  })
                }
              />
              <span>Добавить сразу для всех ОО</span>
            </label>
          </div>
        ) : null}

        <Input
          label="Название мероприятия"
          required
          value={form.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <Input
          label="Тип мероприятия"
          required
          value={form.event_type}
          onChange={(event) => onChange({ event_type: event.target.value })}
        />
        <Select
          label="Направление"
          value={form.roadmap_direction}
          onChange={(event) => onChange({ roadmap_direction: event.target.value as EventEditorForm["roadmap_direction"] })}
          options={ROADMAP_OPTIONS}
        />
        <Input
          label="Учебный год"
          placeholder="2025/2026"
          value={form.academic_year}
          onChange={(event) => onChange({ academic_year: event.target.value })}
        />
        <Select
          label="Сроки выполнения"
          value={form.schedule_mode}
          onChange={(event) => onChange({ schedule_mode: event.target.value as EventEditorForm["schedule_mode"] })}
          options={SCHEDULE_MODE_OPTIONS}
        />
        <Input
          label="Организатор"
          value={form.organizer}
          onChange={(event) => onChange({ organizer: event.target.value })}
        />

        {form.schedule_mode === "range" ? (
          <>
            <Input
              label="Дата начала"
              type="datetime-local"
              required
              value={form.starts_at}
              onChange={(event) => onChange({ starts_at: event.target.value })}
            />
            <Input
              label="Дата окончания"
              type="datetime-local"
              required
              value={form.ends_at}
              onChange={(event) => onChange({ ends_at: event.target.value })}
            />
          </>
        ) : null}

        {!form.is_all_organizations ? (
          <div className="form-grid__full field">
            <span className="field__label">Целевая аудитория: классы ОО</span>
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
              <p className="field__hint">Для выбранной ОО еще не заведены классы.</p>
            )}
          </div>
        ) : null}

        <Input
          label={form.is_all_organizations ? "Целевая аудитория" : "Целевая аудитория (текстом, если нужно)"}
          className="form-grid__full"
          value={form.target_audience}
          onChange={(event) => onChange({ target_audience: event.target.value })}
        />

        <Input
          label="Уровень"
          value={form.event_level}
          onChange={(event) => onChange({ event_level: event.target.value })}
        />
        <Input
          label="Формат"
          value={form.event_format}
          onChange={(event) => onChange({ event_format: event.target.value })}
        />
        <Input
          label="План участников"
          type="number"
          min={0}
          value={form.participants_count}
          onChange={(event) => onChange({ participants_count: event.target.value })}
        />

        <div className="form-grid__full field">
          <span className="field__label">Ответственные</span>
          <Input
            label="Поиск по ФИО"
            value={responsibleSearch}
            onChange={(event) => setResponsibleSearch(event.target.value)}
            placeholder="Введите фамилию или имя"
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
          label="Описание"
          className="form-grid__full"
          value={form.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        <TextArea
          label="Примечания"
          className="form-grid__full"
          value={form.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
        />

        <div className="form-actions form-grid__full">
          <Button type="button" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Сохраняем..." : "Сохранить"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
