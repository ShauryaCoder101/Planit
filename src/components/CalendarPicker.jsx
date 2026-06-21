import React, { useMemo, useCallback } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, eachDayOfInterval, isSameDay, isSameMonth,
  isToday, isSameWeek, getDay
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPicker({ selected, onChange, mode = 'day' }) {
  const [viewMonth, setViewMonth] = React.useState(startOfMonth(selected));

  const handlePrev = useCallback(() => setViewMonth((m) => subMonths(m, 1)), []);
  const handleNext = useCallback(() => setViewMonth((m) => addMonths(m, 1)), []);

  const days = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [viewMonth]);

  const handleDayClick = useCallback((day) => {
    if (mode === 'month') {
      onChange(startOfMonth(day));
    } else {
      onChange(day);
    }
  }, [mode, onChange]);

  const isSelected = useCallback((day) => {
    if (mode === 'day') return isSameDay(day, selected);
    if (mode === 'month') return isSameMonth(day, selected) && isSameMonth(day, viewMonth);
    return false;
  }, [mode, selected, viewMonth]);

  const isInWeekRange = useCallback((day) => {
    if (mode !== 'week') return false;
    return isSameWeek(day, selected, { weekStartsOn: 1 });
  }, [mode, selected]);

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button className="btn btn-icon btn-ghost btn-sm" onClick={handlePrev} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <h3>{format(viewMonth, 'MMMM yyyy')}</h3>
        <button className="btn btn-icon btn-ghost btn-sm" onClick={handleNext} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="calendar-grid">
        {DAY_LABELS.map((d) => (
          <div key={d} className="calendar-day-label">{d}</div>
        ))}

        {days.map((day) => {
          const sameMonth = isSameMonth(day, viewMonth);
          const today = isToday(day);
          const sel = isSelected(day);
          const inRange = isInWeekRange(day);

          let cls = 'calendar-day';
          if (!sameMonth) cls += ' other-month';
          if (today) cls += ' today';
          if (sel) cls += ' selected';
          if (inRange && !sel) cls += ' in-range';

          return (
            <button
              key={day.toISOString()}
              className={cls}
              onClick={() => handleDayClick(day)}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
