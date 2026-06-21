import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi.jsx';
import { Moon, Check } from 'lucide-react';

export default function SleepLogger({ date }) {
  const api = useApi();
  const [hours, setHours] = useState(7);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get(`/api/sleep/${date}`);
        if (data?.sleep?.hours != null) {
          setHours(data.sleep.hours);
          setFetched(true);
        }
      } catch {
        // No sleep logged yet
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const handleSave = useCallback(async () => {
    setLoading(true);
    setSaved(false);
    try {
      await api.post('/api/sleep', { date, hours: Number(hours) });
      setSaved(true);
      setFetched(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [api, date, hours]);

  const getSleepColor = useCallback((h) => {
    if (h >= 7) return 'var(--success)';
    if (h >= 5) return 'var(--accent-amber)';
    return 'var(--danger)';
  }, []);

  const sleepQuality = hours >= 7 ? 'Great' : hours >= 5 ? 'Fair' : 'Low';

  return (
    <div className="glass-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Moon size={18} style={{ color: 'var(--primary-cyan)' }} />
          <span className="font-medium text-sm">Sleep</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-2xl font-bold"
            style={{ color: getSleepColor(hours), fontFamily: 'Outfit, sans-serif' }}
          >
            {hours}h
          </span>
          <span className="text-xs text-muted">{sleepQuality}</span>
        </div>
      </div>

      <input
        type="range"
        className="sleep-slider"
        min={0}
        max={12}
        step={0.5}
        value={hours}
        onChange={(e) => {
          setHours(Number(e.target.value));
          setSaved(false);
        }}
        style={{
          background: `linear-gradient(to right, ${getSleepColor(hours)} ${(hours / 12) * 100}%, rgba(255,255,255,0.1) ${(hours / 12) * 100}%)`,
        }}
      />

      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-muted">0h</span>
        <span className="text-xs text-muted">12h</span>
      </div>

      <button
        className={`btn btn-sm w-full mt-3 ${saved ? 'btn-secondary' : 'btn-primary'}`}
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? (
          <div className="spinner" style={{ width: 16, height: 16 }} />
        ) : saved ? (
          <><Check size={14} /> Saved</>
        ) : (
          fetched ? 'Update Sleep' : 'Log Sleep'
        )}
      </button>
    </div>
  );
}
