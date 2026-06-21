import React, { useCallback, useState } from 'react';
import { useApi } from '../hooks/useApi.jsx';
import { Check } from 'lucide-react';

export default function SubtaskList({ dailyTaskId, subtasks, expanded, onUpdate }) {
  const api = useApi();
  const [toggling, setToggling] = useState(null);

  const handleToggle = useCallback(async (subtaskId) => {
    setToggling(subtaskId);
    try {
      await api.put(`/api/daily/${dailyTaskId}/subtasks/${subtaskId}`, {});
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setToggling(null);
    }
  }, [api, dailyTaskId, onUpdate]);

  return (
    <div className={`subtask-list ${expanded ? 'expanded' : 'collapsed'}`}>
      {subtasks.map((st) => {
        const id = st.id || st._id || st.name;
        const completed = st.completed || st.done;
        return (
          <div key={id} className="subtask-item">
            <button
              className="checkbox-wrapper"
              onClick={() => handleToggle(id)}
              disabled={toggling === id}
              style={{ padding: 0 }}
            >
              <div className={`checkbox-custom ${completed ? 'checked' : ''}`}>
                {completed && <Check size={14} />}
              </div>
              <span className={`subtask-text ${completed ? 'completed' : ''}`}>
                {st.name || st.title}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
