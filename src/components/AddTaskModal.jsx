import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '../hooks/useApi.jsx';
import { X, Plus, Trash2, GripVertical, Clock, Target, CalendarClock } from 'lucide-react';

const DAYS = [
  { key: 0, label: 'Sun' },
  { key: 1, label: 'Mon' },
  { key: 2, label: 'Tue' },
  { key: 3, label: 'Wed' },
  { key: 4, label: 'Thu' },
  { key: 5, label: 'Fri' },
  { key: 6, label: 'Sat' },
];

export default function AddTaskModal({ task, onClose, onSaved, isTemplate = false }) {
  const api = useApi();
  const isEditing = !!task;

  const [name, setName] = useState(task?.name || '');
  const [taskType, setTaskType] = useState(task?.taskType || 'timed');
  const [duration, setDuration] = useState(task?.duration || 30);
  const [goalCategory, setGoalCategory] = useState(task?.goalCategory || '');
  const [recurrenceType, setRecurrenceType] = useState(task?.recurrenceType || 'one-time');
  const [recurrenceDays, setRecurrenceDays] = useState(task?.recurrenceDays || []);
  const [carryOver, setCarryOver] = useState(task?.carryOver || false);
  const [scheduledTime, setScheduledTime] = useState(task?.scheduledTime || '');
  const [subtasks, setSubtasks] = useState(task?.subtasks?.map((s) => (typeof s === 'string' ? s : s.name || s.title || '')) || []);
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);

  // Fetch existing categories for autocomplete
  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/api/tasks');
        const tasks = Array.isArray(data) ? data : data.tasks || [];
        const cats = [...new Set(tasks.map((t) => t.goalCategory).filter(Boolean))];
        setCategories(cats);
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCategories = useMemo(() => {
    if (!goalCategory.trim()) return categories;
    return categories.filter((c) => c.toLowerCase().includes(goalCategory.toLowerCase()));
  }, [goalCategory, categories]);

  const toggleDay = useCallback((day) => {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }, []);

  const addSubtask = useCallback(() => {
    const trimmed = newSubtask.trim();
    if (!trimmed) return;
    setSubtasks((prev) => [...prev, trimmed]);
    setNewSubtask('');
  }, [newSubtask]);

  const removeSubtask = useCallback((idx) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubtaskKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSubtask();
    }
  }, [addSubtask]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError('Task name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        name: name.trim(),
        taskType,
        duration: taskType === 'timed' ? (Number(duration) || 30) : 0,
        goalCategory: goalCategory.trim() || 'General',
        recurrenceType,
        recurrenceDays: recurrenceType === 'recurring' ? recurrenceDays : [],
        carryOver,
        subtasks: subtasks.map((s) => ({ name: s })),
        scheduledTime: taskType === 'scheduled' ? scheduledTime : null,
      };
      if (isEditing) {
        await api.put(`/api/tasks/${task.id}`, body);
      } else {
        await api.post('/api/tasks', body);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [name, taskType, duration, goalCategory, recurrenceType, recurrenceDays, carryOver, subtasks, scheduledTime, isEditing, task, api, onSaved]);

  // Close on escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container">
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Task' : 'New Task'}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-message">{error}</div>}

          {/* Name */}
          <div className="form-group">
            <label className="form-label">Task Name</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Morning Workout"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Task Type */}
          <div className="form-group">
            <label className="form-label">Task Type</label>
            <div className="flex gap-3">
              <button
                type="button"
                className={`btn btn-sm ${taskType === 'timed' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTaskType('timed')}
                style={{ flex: 1 }}
              >
                <Clock size={14} /> Timed
              </button>
              <button
                type="button"
                className={`btn btn-sm ${taskType === 'goal' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTaskType('goal')}
                style={{ flex: 1 }}
              >
                <Target size={14} /> Goal
              </button>
              <button
                type="button"
                className={`btn btn-sm ${taskType === 'scheduled' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setTaskType('scheduled'); setRecurrenceType('recurring'); }}
                style={{ flex: 1 }}
              >
                <CalendarClock size={14} /> Scheduled
              </button>
            </div>
            <span className="text-xs text-muted" style={{ marginTop: '4px' }}>
              {taskType === 'timed'
                ? 'Has a set duration you plan to spend'
                : taskType === 'goal'
                  ? 'No fixed time — just start the clock when you work on it'
                  : 'Happens at a specific time (e.g. meetings, classes)'}
            </span>
          </div>

          {/* Scheduled Time (only for scheduled tasks) */}
          {taskType === 'scheduled' && (
            <div className="form-group">
              <label className="form-label">Scheduled Time</label>
              <input
                className="form-input"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                style={{ maxWidth: '200px' }}
              />
            </div>
          )}

          {/* Duration (only for timed tasks) */}
          {taskType === 'timed' && (
            <div className="form-group">
              <label className="form-label">Estimated Duration (minutes)</label>
              <input
                className="form-input"
                type="number"
                min={1}
                max={480}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          )}

          {/* Goal Category */}
          <div className="form-group">
            <label className="form-label">Goal Category</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Health, Work, Learning"
              value={goalCategory}
              onChange={(e) => setGoalCategory(e.target.value)}
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              {filteredCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {/* Recurrence */}
          <div className="form-group">
            <label className="form-label">Recurrence</label>
            <div className="flex gap-3">
              <button
                type="button"
                className={`btn btn-sm ${recurrenceType === 'one-time' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRecurrenceType('one-time')}
              >
                One-time
              </button>
              <button
                type="button"
                className={`btn btn-sm ${recurrenceType === 'recurring' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRecurrenceType('recurring')}
              >
                Recurring
              </button>
            </div>
          </div>

          {/* Day pills */}
          {recurrenceType === 'recurring' && (
            <div className="form-group">
              <label className="form-label">Repeat on</label>
              <div className="day-pills">
                {DAYS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className={`day-pill ${recurrenceDays.includes(d.key) ? 'active' : ''}`}
                    onClick={() => toggleDay(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Carry over */}
          <div className="form-group">
            <div className="flex items-center justify-between">
              <label className="form-label" style={{ marginBottom: 0 }}>Carry over incomplete</label>
              <button
                type="button"
                className={`toggle-switch ${carryOver ? 'active' : ''}`}
                onClick={() => setCarryOver(!carryOver)}
                aria-label="Toggle carry over"
              />
            </div>
          </div>

          {/* Subtasks */}
          <div className="form-group">
            <label className="form-label">Subtasks</label>
            {subtasks.map((st, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <GripVertical size={14} className="text-muted" />
                <span className="flex-1 text-sm">{st}</span>
                <button
                  type="button"
                  className="btn btn-icon btn-ghost btn-sm"
                  onClick={() => removeSubtask(idx)}
                  aria-label="Remove subtask"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                className="form-input flex-1"
                type="text"
                placeholder="Add a subtask..."
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={handleSubtaskKeyDown}
              />
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={addSubtask}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <div className="spinner" style={{ width: 18, height: 18 }} /> : (isEditing ? 'Update' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}
