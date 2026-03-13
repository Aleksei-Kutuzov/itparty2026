import type { EventItem, Student } from "../../types/models";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";
import { Select } from "../../shared/ui/Select";
import { StatusView } from "../../shared/ui/StatusView";
import { formatStudentClass } from "../../shared/utils/studentClass";

export type ParticipationMark = "none" | "participant" | "prize" | "winner";

const participationMarkOptions: Array<{ value: ParticipationMark; label: string }> = [
  { value: "none", label: "Не участвовал" },
  { value: "participant", label: "Участник" },
  { value: "prize", label: "Призер" },
  { value: "winner", label: "Победитель" },
];

type Props = {
  event: EventItem;
  loading: boolean;
  saving: boolean;
  classNames: string[];
  selectedClass: string;
  students: Student[];
  marksByStudentId: Record<number, ParticipationMark>;
  onClose: () => void;
  onSave: () => void;
  onClassChange: (className: string) => void;
  onMarkChange: (studentId: number, mark: ParticipationMark) => void;
};

export const EventParticipationModal = ({
  event,
  loading,
  saving,
  classNames,
  selectedClass,
  students,
  marksByStudentId,
  onClose,
  onSave,
  onClassChange,
  onMarkChange,
}: Props) => {
  const classOptions = classNames.map((className) => ({ value: className, label: className }));

  return (
    <Modal title={`Отметка участия: ${event.title}`} onClose={onClose} width="lg">
      {loading ? (
        <StatusView state="loading" title="Загружаем список класса" />
      ) : classNames.length === 0 || students.length === 0 ? (
        <StatusView
          state="empty"
          title="Нет учеников для отметки"
          description="Для выбранного мероприятия не найден список учеников."
        />
      ) : (
        <div className="participation-modal">
          <Select
            label="Класс"
            value={selectedClass}
            onChange={(eventTarget) => onClassChange(eventTarget.target.value)}
            options={classOptions}
          />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Ученик</th>
                  <th>Класс</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>{student.full_name}</td>
                    <td>{formatStudentClass(student.school_class) || "-"}</td>
                    <td>
                      <select
                        className="field__control participation-modal__status"
                        value={marksByStudentId[student.id] ?? "none"}
                        onChange={(eventTarget) => onMarkChange(student.id, eventTarget.target.value as ParticipationMark)}
                      >
                        {participationMarkOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={onClose}>
              Закрыть
            </Button>
            <Button type="button" onClick={onSave} disabled={saving}>
              {saving ? "Сохраняем..." : "Сохранить"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

