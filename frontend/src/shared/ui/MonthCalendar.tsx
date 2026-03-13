import type { EventItem } from "../../types/models";
import { addDays, isSameDay, monthTitle, startOfMonthGrid } from "../utils/date";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

type Props = {
  month: Date;
  events: EventItem[];
  onEventClick?: (event: EventItem) => void;
  onMonthShift: (delta: number) => void;
};

export const MonthCalendar = ({ month, events, onMonthShift, onEventClick }: Props) => {
  const start = startOfMonthGrid(month);
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const getEventAnchors = (event: EventItem) => {
    if (event.schedule_mode === "quarterly" && event.schedule_dates.length > 0) {
      return event.schedule_dates.map((item) => item.starts_at);
    }
    return [event.starts_at];
  };

  return (
    <div className="calendar">
      <header className="calendar__header">
        <button type="button" className="calendar__nav" onClick={() => onMonthShift(-1)}>
          ←
        </button>
        <strong>{monthTitle(month)}</strong>
        <button type="button" className="calendar__nav" onClick={() => onMonthShift(1)}>
          →
        </button>
      </header>

      <div className="calendar__weekdays">
        {weekDays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="calendar__grid">
        {days.map((day) => {
          const dayEvents = events.filter((event) => getEventAnchors(event).some((value) => isSameDay(value, day)));
          const inCurrentMonth = day.getMonth() === month.getMonth();
          return (
            <article key={day.toISOString()} className={`calendar__day ${inCurrentMonth ? "" : "calendar__day--muted"}`}>
              <span className="calendar__day-number">{day.getDate()}</span>
              <div className="calendar__events">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="calendar__chip"
                    onClick={() => onEventClick?.(event)}
                  >
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 ? <span className="calendar__more">+{dayEvents.length - 3}</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
