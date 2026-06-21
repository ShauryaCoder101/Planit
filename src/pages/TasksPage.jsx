import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '../hooks/useApi.jsx';
import AddTaskModal from '../components/AddTaskModal.jsx';
import { Plus, Trash2, Edit3, Repeat, ArrowRightCircle, ListTodo, Target } from 'lucide-react';
import { getCategoryColor } from '../components/ReportCharts.jsx';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TasksPage() {
  const api = useApi();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await api.get('/api/tasks');
      setTemplates(Array.isArray(data) ? data : data.tasks || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const g = {};
    templates.forEach((t) => {
      const cat = t.goalCategory || 'Uncategorized';
      if (!g[cat]) g[cat] = [];
      g[cat].push(t);
    });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [templates]);

  const handleEdit = useCallback((task) => {
    setEditTask(task);
    setShowModal(true);
  }, []);

  const handleDelete = useCallback(async (id) => {
    try {
      await api.del(`/api/tasks/${id}`);
      setDeleteConfirm(null);
      fetchTemplates();
    } catch (err) {
      setError(err.message);
    }
  }, [api, fetchTemplates]);

  const handleSaved = useCallback(() => {
    setShowModal(false);
    setEditTask(null);
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setEditTask(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <>
      <h1 className="text-xl font-bold mb-2">Task Templates</h1>
      <p className="text-secondary text-sm mb-4">
        Manage recurring and one-time task templates
      </p>

      {error && <div className="error-message mb-4">{error}</div>}

      {grouped.length === 0 && (
        <div className="empty-state mt-6">
          <ListTodo size={48} />
          <p className="text-secondary">No task templates yet</p>
          <p className="text-muted text-sm">Tap + to create your first template</p>
        </div>
      )}

      {grouped.map(([category, catTasks]) => {
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
                <div key={task.id} className="glass-card glass-card-hover">
                  <div className="flex items-center justify-between">
                    <div className="flex-1" style={{ minWidth: 0 }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold truncate">{task.name}</span>
                        {task.taskType === 'goal' ? (
                          <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--primary-cyan)' }}>
                            <Target size={10} /> Goal
                          </span>
                        ) : (
                          <span className="badge badge-duration">{task.duration}m</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {task.recurrenceType === 'recurring' ? (
                          <span className="flex items-center gap-1 text-xs text-secondary">
                            <Repeat size={12} />
                            {(task.recurrenceDays || []).map((d) => DAYS_SHORT[d] || d).join(', ')}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">One-time</span>
                        )}
                        {task.carryOver && (
                          <span className="badge badge-carry-over">
                            <ArrowRightCircle size={10} /> Carry over
                          </span>
                        )}
                      </div>
                      {task.subtasks && task.subtasks.length > 0 && (
                        <span className="text-xs text-muted mt-1" style={{ display: 'block' }}>
                          {task.subtasks.length} subtask{task.subtasks.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-icon btn-ghost btn-sm"
                        onClick={() => handleEdit(task)}
                        aria-label="Edit"
                      >
                        <Edit3 size={16} />
                      </button>
                      {deleteConfirm === task.id ? (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleDelete(task.id)}
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          className="btn btn-icon btn-ghost btn-sm"
                          onClick={() => setDeleteConfirm(task.id)}
                          aria-label="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* FAB */}
      <button className="fab" onClick={() => setShowModal(true)} aria-label="Add task template">
        <Plus size={24} />
      </button>

      {/* Modal */}
      {showModal && (
        <AddTaskModal
          task={editTask}
          onClose={handleCloseModal}
          onSaved={handleSaved}
          isTemplate
        />
      )}
    </>
  );
}
