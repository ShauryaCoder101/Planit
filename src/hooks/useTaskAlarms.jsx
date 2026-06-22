import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook that fires browser notifications 15 minutes before scheduled tasks.
 * Checks every 60 seconds while the app is open.
 */
export function useTaskAlarms(dailyTasks) {
  const notifiedRef = useRef(new Set());

  const checkAlarms = useCallback(() => {
    if (!dailyTasks || dailyTasks.length === 0) return;
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (const task of dailyTasks) {
      if (task.taskType !== 'scheduled' || !task.scheduledTime) continue;
      if (task.status === 'completed') continue;

      const [h, m] = task.scheduledTime.split(':').map(Number);
      const taskMinutes = h * 60 + m;
      const diff = taskMinutes - nowMinutes;

      // Notify when task is 15 minutes away (window: 14-15 min to avoid double-firing)
      const taskKey = `${task.id}-${task.scheduledTime}`;
      if (diff >= 14 && diff <= 15 && !notifiedRef.current.has(taskKey)) {
        notifiedRef.current.add(taskKey);
        fireNotification(task);
      }

      // Also notify at exact time (0-1 min window)
      const atTimeKey = `${task.id}-now`;
      if (diff >= 0 && diff <= 1 && !notifiedRef.current.has(atTimeKey)) {
        notifiedRef.current.add(atTimeKey);
        fireNotification(task, true);
      }
    }
  }, [dailyTasks]);

  // Check every 60 seconds
  useEffect(() => {
    checkAlarms(); // Check immediately
    const interval = setInterval(checkAlarms, 60 * 1000);
    return () => clearInterval(interval);
  }, [checkAlarms]);

  // Reset notified set when date/tasks change
  useEffect(() => {
    notifiedRef.current.clear();
  }, [dailyTasks?.length]);
}

function fireNotification(task, isNow = false) {
  const [h, m] = task.scheduledTime.split(':');
  const hr = parseInt(h);
  const timeStr = `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;

  const title = isNow
    ? `⏰ ${task.name} — Starting now!`
    : `🔔 ${task.name} — in 15 minutes`;
  const body = isNow
    ? `Your scheduled task is starting now (${timeStr})`
    : `Upcoming at ${timeStr} — get ready!`;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.png',
      tag: `planit-${task.id}`,
      requireInteraction: true,
    });

    // Auto-close after 30 seconds
    setTimeout(() => notification.close(), 30000);

    // Play notification sound
    playAlarmSound();
  } catch (err) {
    console.error('Notification error:', err);
  }
}

function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const frequencies = [523, 659, 784]; // C5, E5, G5 chord

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.value = 0.15;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + 1.5);
    });
  } catch (err) {
    // AudioContext not available
  }
}

/**
 * Request notification permission. Call once on app mount.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}
