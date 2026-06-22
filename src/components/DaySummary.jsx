import React, { useMemo } from 'react';
import { getCategoryColor } from './ReportCharts.jsx';
import { Clock, CheckCircle2, Zap } from 'lucide-react';

export default function DaySummary({ tasks }) {
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const inProgress = tasks.filter((t) => t.status === 'in-progress').length;

    // Count actual time from ALL tasks that have been worked on (completed + in-progress)
    const totalMinutes = tasks.reduce((sum, t) => {
      const actual = t.actualDuration || 0;
      if (actual > 0) return sum + actual;
      return sum;
    }, 0);

    const byCategory = {};
    tasks.forEach((t) => {
      const cat = t.goalCategory || 'Uncategorized';
      if (!byCategory[cat]) byCategory[cat] = { total: 0, completed: 0, inProgress: 0, minutes: 0 };
      byCategory[cat].total += 1;
      if (t.status === 'completed') byCategory[cat].completed += 1;
      if (t.status === 'in-progress') byCategory[cat].inProgress += 1;
      // Count actual time from any task that has been worked on
      const actual = t.actualDuration || 0;
      if (actual > 0) byCategory[cat].minutes += actual;
    });

    const maxMinutes = Math.max(...Object.values(byCategory).map((c) => c.minutes), 1);

    return { total, completed, inProgress, totalMinutes, byCategory, maxMinutes };
  }, [tasks]);

  return (
    <div className="glass-card mt-6">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Zap size={16} style={{ color: 'var(--accent-amber)' }} />
        Day Summary
      </h3>

      <div className="flex gap-4 mb-4">
        <div className="flex-1 text-center">
          <div className="text-lg font-bold gradient-text" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {stats.completed}/{stats.total}
          </div>
          <div className="text-xs text-muted flex items-center justify-center gap-1">
            <CheckCircle2 size={10} /> Tasks
          </div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-lg font-bold gradient-text" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {(stats.totalMinutes / 60).toFixed(1)}h
          </div>
          <div className="text-xs text-muted flex items-center justify-center gap-1">
            <Clock size={10} /> Productive
          </div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-lg font-bold gradient-text" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
          </div>
          <div className="text-xs text-muted">Completion</div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="flex flex-col gap-3">
        {Object.entries(stats.byCategory)
          .sort(([, a], [, b]) => b.minutes - a.minutes)
          .map(([cat, data]) => {
            const color = getCategoryColor(cat);
            const pct = (data.minutes / stats.maxMinutes) * 100;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="category-dot" style={{ background: color, width: 8, height: 8 }} />
                    <span className="text-sm">{cat}</span>
                  </div>
                  <span className="text-xs text-secondary">
                    {data.completed}/{data.total} · {data.minutes >= 60 ? `${Math.floor(data.minutes / 60)}h ${data.minutes % 60}m` : `${data.minutes}m`}
                  </span>
                </div>
                <div className="h-bar-track">
                  <div
                    className="h-bar-fill"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
