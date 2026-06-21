import React, { useState, useCallback } from 'react';
import { useApi } from '../hooks/useApi.jsx';
import { useTimer } from '../hooks/useTimer.jsx';
import SubtaskList from './SubtaskList.jsx';
import { getCategoryColor } from './ReportCharts.jsx';
import {
  Play, Pause, Square, CheckCircle2, Circle,
  ChevronDown, ChevronUp, Clock, ArrowRightCircle, Target
} from 'lucide-react';

export default function TaskCard({ task, onUpdate }) {
  const api = useApi();
  const { activeTimer, startTimer, pauseTimer, resumeTimer, finishTimer } = useTimer();
  const [expanded, setExpanded] = useState(false);
  const [timerLoading, setTimerLoading] = useState(false);

  const isTimerForThis = activeTimer && activeTimer.dailyTaskId === task.id;
  const isRunning = isTimerForThis && activeTimer.status === 'running';
  const isPaused = isTimerForThis && activeTimer.status === 'paused';
  const isCompleted = task.status === 'completed';
  const isInProgress = task.status === 'in-progress' || isTimerForThis;
  const hasSubtasks = task.subtasks && task.subtasks.length > 0;
  const categoryColor = getCategoryColor(task.goalCategory || 'Uncategorized');

  const handleComplete = useCallback(async () => {
    try {
      await api.post(`/api/daily/${task.id}/complete`);
      if (isTimerForThis) await finishTimer();
      onUpdate();
    } catch (err) {
      console.error(err);
    }
  }, [api, task.id, isTimerForThis, finishTimer, onUpdate]);

  const handleTimerAction = useCallback(async () => {
    setTimerLoading(true);
    try {
      if (isRunning) {
        await pauseTimer();
      } else if (isPaused) {
        await resumeTimer();
      } else if (!activeTimer) {
        await startTimer(task.id);
      } else {
        // Another timer is running
        await finishTimer();
        await startTimer(task.id);
      }
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setTimerLoading(false);
    }
  }, [isRunning, isPaused, activeTimer, task.id, pauseTimer, resumeTimer, startTimer, finishTimer, onUpdate]);

  const handleFinish = useCallback(async () => {
    setTimerLoading(true);
    try {
      await finishTimer();
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setTimerLoading(false);
    }
  }, [finishTimer, onUpdate]);

  return (
    <div
      className={`glass-card glass-card-hover ${isCompleted ? '' : ''}`}
      style={isCompleted ? { opacity: 0.65 } : {}}
    >
      {/* Main row */}
      <div className="flex items-center gap-3">
        {/* Completion checkbox */}
        <button
          className="btn-icon"
          onClick={handleComplete}
          aria-label={isCompleted ? 'Completed' : 'Mark complete'}
          style={{ minWidth: 32, minHeight: 32 }}
        >
          {isCompleted ? (
            <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
          ) : (
            <Circle size={22} style={{ color: 'var(--text-muted)' }} />
          )}
        </button>

        {/* Task info */}
        <div className="flex-1" style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`font-medium truncate ${isCompleted ? '' : ''}`}
              style={isCompleted ? { textDecoration: 'line-through', color: 'var(--text-muted)' } : {}}
            >
              {task.name}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="category-chip"
              style={{
                background: `${categoryColor}20`,
                color: categoryColor,
              }}
            >
              {task.goalCategory || 'General'}
            </span>
            {task.taskType === 'goal' ? (
              <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--primary-cyan)' }}>
                <Target size={10} /> Goal
              </span>
            ) : (
              <span className="badge badge-duration">
                <Clock size={10} /> {task.duration || 30}m
              </span>
            )}
            {isInProgress && !isCompleted && (
              <span className="badge badge-status-in-progress">In progress</span>
            )}
            {isCompleted && (
              <span className="badge badge-status-completed">Done</span>
            )}
          </div>
        </div>

        {/* Timer controls */}
        {!isCompleted && (
          <div className="flex items-center gap-1">
            <button
              className="btn btn-icon btn-sm btn-secondary"
              onClick={handleTimerAction}
              disabled={timerLoading}
              aria-label={isRunning ? 'Pause' : isPaused ? 'Resume' : 'Start timer'}
            >
              {timerLoading ? (
                <div className="spinner" style={{ width: 16, height: 16 }} />
              ) : isRunning ? (
                <Pause size={16} />
              ) : (
                <Play size={16} />
              )}
            </button>
            {isTimerForThis && (
              <button
                className="btn btn-icon btn-sm btn-danger"
                onClick={handleFinish}
                disabled={timerLoading}
                aria-label="Stop timer"
              >
                <Square size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Carried-over badge */}
      {(task.isCarriedOver || task.carriedFrom) && (
        <div className="mt-2">
          <span className="badge badge-carry-over">
            <ArrowRightCircle size={10} />
            Carried over from {task.carriedFrom}
          </span>
        </div>
      )}

      {/* Subtasks toggle */}
      {hasSubtasks && (
        <button
          className="flex items-center gap-1 mt-2 text-xs text-secondary"
          onClick={() => setExpanded(!expanded)}
          style={{ minHeight: 32 }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {task.subtasks.length} subtask{task.subtasks.length !== 1 ? 's' : ''}
        </button>
      )}

      {/* Subtask list */}
      {hasSubtasks && (
        <SubtaskList
          dailyTaskId={task.id}
          subtasks={task.subtasks}
          expanded={expanded}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}
