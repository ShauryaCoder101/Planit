import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { useApi } from '../hooks/useApi.jsx';
import CalendarPicker from '../components/CalendarPicker.jsx';
import { DoughnutChart, StackedBarChart, CalendarHeatmap } from '../components/ReportCharts.jsx';
import SleepChart from '../components/SleepChart.jsx';
import { getCategoryColor } from '../components/ReportCharts.jsx';
import {
  ArrowLeft, Moon, CheckCircle2, Clock, BarChart3,
  Circle, Target, Mail,
} from 'lucide-react';

export default function FriendProfilePage() {
  const { friendId } = useParams();
  const navigate = useNavigate();
  const api = useApi();

  const [tab, setTab] = useState('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activity, setActivity] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [friendInfo, setFriendInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const actData = await api.get(`/api/friends/${friendId}/activity?period=${tab}&date=${dateStr}`);
      // The backend returns { report: { summary, sleepData, dayBreakdown, tasks, ... }, friend: { name, email } }
      // Unwrap the report object so DayView/WeekView/MonthView can access data directly
      const report = actData?.report || actData;
      const combined = { ...report, friend: actData?.friend || null };
      setActivity(combined);
      setFriendInfo(actData?.friend || report?.friend || null);

      if (tab === 'day') {
        try {
          const plannerData = await api.get(`/api/friends/${friendId}/planner?date=${dateStr}`);
          setTasks(plannerData?.tasks || plannerData?.dailyTasks || []);
          // Planner endpoint reliably returns friend info
          if (plannerData?.friend) {
            setFriendInfo(plannerData.friend);
          }
        } catch {
          setTasks([]);
        }
      } else {
        setTasks([]);
      }
    } catch (err) {
      setError(err.message);
      setActivity(null);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [api, friendId, tab, selectedDate]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedDate, friendId]);

  const calendarMode = tab === 'day' ? 'day' : tab === 'week' ? 'week' : 'month';
  const friendName = friendInfo?.name || activity?.friend?.name || 'Friend';
  const friendEmail = friendInfo?.email || activity?.friend?.email || '';

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3" style={{ animation: 'fadeIn 0.3s var(--ease-out)' }}>
        <button
          className="btn btn-icon btn-ghost btn-sm"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="text-lg font-bold truncate">{friendName}</h1>
          {friendEmail && (
            <div className="text-xs text-muted truncate flex items-center gap-1">
              <Mail size={10} /> {friendEmail}
            </div>
          )}
        </div>
      </div>

      {/* Period tabs */}
      <div className="tab-selector">
        {['day', 'week', 'month'].map((t) => (
          <button
            key={t}
            className={`tab-item ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Calendar */}
      <CalendarPicker
        selected={selectedDate}
        onChange={setSelectedDate}
        mode={calendarMode}
      />

      {error && <div className="error-message mt-4">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center mt-6">
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4" style={{ animation: 'fadeIn 0.3s var(--ease-out)' }}>
          {tab === 'day' && activity && <DayView activity={activity} tasks={tasks} />}
          {tab === 'week' && activity && <WeekView activity={activity} />}
          {tab === 'month' && activity && <MonthView activity={activity} selectedDate={selectedDate} />}
          {!activity && !loading && (
            <div className="empty-state mt-4">
              <BarChart3 size={48} />
              <p className="text-secondary">No activity data for this period</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ========== Day View ========== */
function DayView({ activity, tasks }) {
  const summary = activity.summary || activity;
  const categoryBreakdown = summary.totalHoursByGoal || summary.hoursByGoal || {};
  const completedTasks = summary.tasksCompleted || 0;
  const totalTasks = summary.tasksTotal || summary.totalTasks || 0;
  const totalHours = summary.totalActualHours || summary.totalHours || 0;
  const sleepData = activity.sleepData || [];
  const sleep = sleepData.length > 0 ? sleepData[0] : null;
  const sleepHours = sleep?.hours ?? sleep?.sleepHours ?? null;

  return (
    <>
      {/* Stats grid */}
      <div className="report-stat-grid">
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{completedTasks}/{totalTasks}</div>
          <div className="report-stat-label"><CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />Tasks Done</div>
        </div>
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{totalHours.toFixed(1)}h</div>
          <div className="report-stat-label"><Clock size={12} style={{ display: 'inline', marginRight: 4 }} />Productive</div>
        </div>
      </div>

      {/* Sleep */}
      {sleepHours !== null && (
        <div className="glass-card flex items-center gap-4" style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
          <Moon size={24} style={{ color: 'var(--primary-purple)', flexShrink: 0 }} />
          <div>
            <div
              className="font-bold text-2xl"
              style={{
                color: sleepHours >= 7 ? 'var(--success)' : 'var(--accent-amber)',
                fontFamily: 'Outfit, sans-serif',
                animation: 'countUp 0.5s var(--ease-out)',
              }}
            >
              {sleepHours}h
            </div>
            <div className="text-xs text-muted">Sleep</div>
          </div>
        </div>
      )}

      {/* Pie chart */}
      {Object.keys(categoryBreakdown).length > 0 && (
        <div className="glass-card">
          <h3 className="font-semibold mb-3">Hours by Goal</h3>
          <div className="chart-container">
            <DoughnutChart data={categoryBreakdown} />
          </div>
        </div>
      )}

      {/* Tasks list */}
      {tasks.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Daily Tasks</h3>
          <div className="flex flex-col gap-2">
            {tasks.map((task, idx) => (
              <ReadOnlyTaskCard key={task.id || idx} task={task} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ========== Read-only task card ========== */
function ReadOnlyTaskCard({ task }) {
  const isCompleted = task.status === 'completed';
  const isInProgress = task.status === 'in-progress';
  const categoryColor = getCategoryColor(task.goalCategory || 'Uncategorized');

  return (
    <div
      className="glass-card"
      style={isCompleted ? { opacity: 0.65 } : {}}
    >
      <div className="flex items-center gap-3">
        <div style={{ minWidth: 24 }}>
          {isCompleted ? (
            <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
          ) : (
            <Circle size={20} style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="font-medium truncate text-sm"
            style={isCompleted ? { textDecoration: 'line-through', color: 'var(--text-muted)' } : {}}
          >
            {task.name}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span
              className="category-chip"
              style={{ background: `${categoryColor}20`, color: categoryColor }}
            >
              {task.goalCategory || 'General'}
            </span>
            {task.taskType === 'goal' ? (
              <span className="badge" style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--primary-cyan)' }}>
                <Target size={10} /> Goal
              </span>
            ) : (
              <span className="badge badge-duration">
                <Clock size={10} /> {task.duration || 30}m
              </span>
            )}
            {isInProgress && <span className="badge badge-status-in-progress">In progress</span>}
            {isCompleted && <span className="badge badge-status-completed">Done</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== Week View ========== */
function WeekView({ activity }) {
  const summary = activity.summary || activity;
  const dayBreakdown = activity.dayBreakdown || [];
  const categoryTotals = summary.totalHoursByGoal || {};
  const sleepData = activity.sleepData || [];

  const numDays = dayBreakdown.length || 7;
  const averages = {
    tasksPerDay: ((summary.tasksTotal || 0) / numDays).toFixed(1),
    hoursPerDay: (summary.averageDailyHours || ((summary.totalActualHours || 0) / numDays)).toFixed(1),
    sleepPerDay: summary.averageSleepHours ?? (
      sleepData.length > 0
        ? (sleepData.reduce((s, d) => s + (d.hours ?? d.sleepHours ?? 0), 0) / sleepData.length).toFixed(1)
        : null
    ),
  };

  return (
    <>
      <div className="report-stat-grid">
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{averages.tasksPerDay}</div>
          <div className="report-stat-label">Avg Tasks/Day</div>
        </div>
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{averages.hoursPerDay}h</div>
          <div className="report-stat-label">Avg Hours/Day</div>
        </div>
        <div className="glass-card report-stat-card" style={{ gridColumn: 'span 2' }}>
          <div className="report-stat-value" style={{ color: 'var(--success)' }}>
            {averages.sleepPerDay ? `${averages.sleepPerDay}h` : '—'}
          </div>
          <div className="report-stat-label"><Moon size={12} style={{ display: 'inline', marginRight: 4 }} />Avg Sleep</div>
        </div>
      </div>

      {/* Pie chart */}
      {Object.keys(categoryTotals).length > 0 && (
        <div className="glass-card">
          <h3 className="font-semibold mb-3">Time by Category</h3>
          <div className="chart-container">
            <DoughnutChart data={categoryTotals} />
          </div>
        </div>
      )}

      {/* Stacked bar */}
      {dayBreakdown.length > 0 && (
        <div className="glass-card">
          <h3 className="font-semibold mb-3">Daily Breakdown</h3>
          <div className="chart-container">
            <StackedBarChart data={dayBreakdown} />
          </div>
        </div>
      )}

      {/* Sleep chart */}
      {sleepData.length > 0 && (
        <div className="glass-card">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Moon size={16} style={{ color: 'var(--primary-purple)' }} /> Sleep
          </h3>
          <div className="chart-container">
            <SleepChart data={sleepData} mode="week" />
          </div>
        </div>
      )}
    </>
  );
}

/* ========== Month View ========== */
function MonthView({ activity, selectedDate }) {
  const summary = activity.summary || activity;
  const categoryTotals = summary.totalHoursByGoal || {};
  const dailyData = activity.dayBreakdown || [];
  const sleepData = activity.sleepData || [];
  const completedTasks = summary.tasksCompleted || 0;
  const totalTasks = summary.tasksTotal || 0;
  const totalHours = summary.totalActualHours || summary.totalHours || 0;

  const avgSleep = useMemo(() => {
    if (!sleepData.length) return null;
    return (sleepData.reduce((s, d) => s + (d.hours ?? d.sleepHours ?? 0), 0) / sleepData.length).toFixed(1);
  }, [sleepData]);

  return (
    <>
      <div className="report-stat-grid">
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{completedTasks}/{totalTasks}</div>
          <div className="report-stat-label">Tasks Completed</div>
        </div>
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{totalHours.toFixed(1)}h</div>
          <div className="report-stat-label">Total Hours</div>
        </div>
        <div className="glass-card report-stat-card" style={{ gridColumn: 'span 2' }}>
          <div className="report-stat-value" style={{ color: 'var(--success)' }}>
            {avgSleep ? `${avgSleep}h` : '—'}
          </div>
          <div className="report-stat-label"><Moon size={12} style={{ display: 'inline', marginRight: 4 }} />Avg Sleep</div>
        </div>
      </div>

      {/* Pie chart */}
      {Object.keys(categoryTotals).length > 0 && (
        <div className="glass-card">
          <h3 className="font-semibold mb-3">Category Totals</h3>
          <div className="chart-container">
            <DoughnutChart data={categoryTotals} />
          </div>
        </div>
      )}

      {/* Sleep chart */}
      {sleepData.length > 0 && (
        <div className="glass-card">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Moon size={16} style={{ color: 'var(--primary-purple)' }} /> Sleep
          </h3>
          <div className="chart-container">
            <SleepChart data={sleepData} mode="month" />
          </div>
        </div>
      )}

      {/* Calendar heatmap */}
      {dailyData.length > 0 && (
        <div className="glass-card">
          <h3 className="font-semibold mb-3">Activity Heatmap</h3>
          <CalendarHeatmap data={dailyData} date={selectedDate} />
        </div>
      )}
    </>
  );
}
