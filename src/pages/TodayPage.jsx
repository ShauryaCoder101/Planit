import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { useApi } from '../hooks/useApi.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTimer } from '../hooks/useTimer.jsx';
import { useTaskAlarms, requestNotificationPermission } from '../hooks/useTaskAlarms.jsx';
import TaskCard from '../components/TaskCard.jsx';
import SleepLogger from '../components/SleepLogger.jsx';
import DaySummary from '../components/DaySummary.jsx';
import AddTaskModal from '../components/AddTaskModal.jsx';
import { Plus, RefreshCw, Sun, Moon, CloudSun } from 'lucide-react';
import { getCategoryColor } from '../components/ReportCharts.jsx';

export default function TodayPage() {
  const api = useApi();
  const { user } = useAuth();
  const { refreshTimer } = useTimer();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Task alarms — fires notifications 15 min before scheduled tasks
  useTaskAlarms(tasks);

  const today = format(new Date(), 'yyyy-MM-dd');
  const dateDisplay = format(new Date(), 'EEEE, MMMM d');

  const getGreeting = useCallback(() => {
    const h = new Date().getHours();
    if (h < 12) return { text: 'Good Morning', Icon: Sun };
    if (h < 17) return { text: 'Good Afternoon', Icon: CloudSun };
    return { text: 'Good Evening', Icon: Moon };
  }, []);

  const greeting = getGreeting();

  const fetchTasks = useCallback(async () => {
    try {
      const data = await api.get(`/api/daily?date=${today}`);
      setTasks(data.dailyTasks || data.tasks || (Array.isArray(data) ? data : []));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, today]);

  useEffect(() => {
    fetchTasks();
    requestNotificationPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks();
    await refreshTimer();
  }, [fetchTasks, refreshTimer]);

  const groupedTasks = useMemo(() => {
    const groups = {};
    tasks.forEach((t) => {
      const cat = t.goalCategory || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  const handleTaskUpdate = useCallback(() => {
    fetchTasks();
    refreshTimer();
  }, [fetchTasks, refreshTimer]);

  const handleTaskAdded = useCallback(() => {
    setShowAdd(false);
    fetchTasks();
  }, [fetchTasks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <greeting.Icon size={20} className="text-secondary" />
            <span className="text-sm text-secondary">{greeting.text}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</span>
          </div>
          <h1 className="text-xl font-bold">{dateDisplay}</h1>
        </div>
        <button
          className="btn btn-icon btn-ghost"
          onClick={handleRefresh}
          aria-label="Refresh"
        >
          <RefreshCw size={20} className={refreshing ? 'spin-animation' : ''} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      </div>

      {error && <div className="error-message mb-4">{error}</div>}

      {/* Sleep Logger */}
      <SleepLogger date={today} />

      {/* Tasks by category */}
      {groupedTasks.length === 0 && !loading && (
        <div className="empty-state mt-6">
          <Sun size={48} />
          <p className="text-secondary">No tasks for today</p>
          <p className="text-muted text-sm">Add a task template or tap + to get started</p>
        </div>
      )}

      {groupedTasks.map(([category, catTasks]) => {
        const color = getCategoryColor(category);
        return (
          <div key={category}>
            <div className="category-header">
              <div className="category-dot" style={{ background: color }} />
              <h3>{category}</h3>
              <span className="text-muted text-xs">({catTasks.length})</span>
            </div>
            <div className="flex flex-col gap-3">
              {catTasks.map((task) => (
                <TaskCard key={task.id} task={task} onUpdate={handleTaskUpdate} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Day Summary */}
      {tasks.length > 0 && <DaySummary tasks={tasks} />}

      {/* FAB */}
      <button className="fab" onClick={() => setShowAdd(true)} aria-label="Add task">
        <Plus size={24} />
      </button>

      {/* Add Task Modal */}
      {showAdd && (
        <AddTaskModal
          onClose={() => setShowAdd(false)}
          onSaved={handleTaskAdded}
        />
      )}
    </>
  );
}
