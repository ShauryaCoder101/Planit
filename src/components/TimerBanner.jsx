import React from 'react';
import { useTimer } from '../hooks/useTimer.jsx';
import { Pause, Play, Square } from 'lucide-react';

export default function TimerBanner() {
  const { activeTimer, elapsed, formattedTime, pauseTimer, resumeTimer, finishTimer } = useTimer();

  if (!activeTimer) return null;

  const isRunning = activeTimer.status === 'running';
  const isGoalTask = activeTimer.taskType === 'goal' || (!activeTimer.estimatedDuration && !activeTimer.duration);
  const estimatedMin = activeTimer.estimatedDuration || activeTimer.duration || 30;
  const estimatedSec = estimatedMin * 60;
  const progress = isGoalTask ? null : Math.min((elapsed / estimatedSec) * 100, 100);
  const isOvertime = !isGoalTask && elapsed > estimatedSec;

  const handleToggle = async () => {
    try {
      if (isRunning) {
        await pauseTimer();
      } else {
        await resumeTimer();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFinish = async () => {
    try {
      await finishTimer();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="timer-banner" style={isOvertime ? { animation: 'glow 2s ease-in-out infinite' } : {}}>
      <div className="timer-banner-info">
        <span className="timer-banner-time">{formattedTime}</span>
        <span className="timer-banner-name">{activeTimer.taskName || 'Timer'}</span>
      </div>
      <div className="timer-banner-actions">
        <button className="btn" onClick={handleToggle} aria-label={isRunning ? 'Pause' : 'Resume'}>
          {isRunning ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="btn" onClick={handleFinish} aria-label="Finish">
          <Square size={16} />
        </button>
      </div>
      {progress !== null && (
        <div className="timer-banner-progress" style={{ width: `${progress}%` }} />
      )}
    </div>
  );
}
