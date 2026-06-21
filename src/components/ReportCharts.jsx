import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Filler,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';

// Register all needed Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, Filler);

// Stable category color mapping
const CATEGORY_COLORS = [
  '#7c3aed', '#06b6d4', '#f59e0b', '#10b981', '#ef4444',
  '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1',
  '#84cc16', '#e879f9',
];

const categoryColorCache = {};

export function getCategoryColor(category) {
  if (!category) return CATEGORY_COLORS[0];
  if (categoryColorCache[category]) return categoryColorCache[category];
  const keys = Object.keys(categoryColorCache);
  const idx = keys.length % CATEGORY_COLORS.length;
  categoryColorCache[category] = CATEGORY_COLORS[idx];
  return categoryColorCache[category];
}

// --- Doughnut Chart ---
export function DoughnutChart({ data }) {
  const chartData = useMemo(() => {
    const labels = Object.keys(data);
    const values = Object.values(data).map((v) => (typeof v === 'number' ? v : v.minutes || v.hours || 0));
    const colors = labels.map((l) => getCategoryColor(l));

    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors.map((c) => `${c}cc`),
          borderColor: colors,
          borderWidth: 2,
          hoverOffset: 8,
          spacing: 2,
        },
      ],
    };
  }, [data]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: true,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#94a3b8',
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
          font: { family: 'Inter', size: 12 },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(18, 18, 31, 0.95)',
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        titleFont: { family: 'Inter', weight: '600' },
        bodyFont: { family: 'Inter' },
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toFixed(2)}h`,
        },
      },
    },
  }), []);

  return <Doughnut data={chartData} options={options} />;
}

// --- Stacked Bar Chart ---
export function StackedBarChart({ data }) {
  const chartData = useMemo(() => {
    // data is an array of { date, categories: { cat: minutes } }
    if (!data || data.length === 0) return { labels: [], datasets: [] };

    const labels = data.map((d) => {
      try { return format(new Date(d.date), 'EEE'); }
      catch { return d.date; }
    });

    const allCategories = new Set();
    data.forEach((d) => {
      const cats = d.hoursByGoal || d.categories || d.categoryBreakdown || {};
      Object.keys(cats).forEach((c) => allCategories.add(c));
    });

    const datasets = [...allCategories].map((cat) => ({
      label: cat,
      data: data.map((d) => {
        const cats = d.hoursByGoal || d.categories || d.categoryBreakdown || {};
        return cats[cat] || 0;
      }),
      backgroundColor: `${getCategoryColor(cat)}cc`,
      borderColor: getCategoryColor(cat),
      borderWidth: 1,
      borderRadius: 4,
    }));

    return { labels, datasets };
  }, [data]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      x: {
        stacked: true,
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
      },
      y: {
        stacked: true,
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: '#64748b',
          font: { family: 'Inter', size: 11 },
          callback: (v) => `${v}m`,
        },
        title: {
          display: true,
          text: 'Minutes',
          color: '#64748b',
          font: { family: 'Inter', size: 11 },
        },
      },
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#94a3b8',
          padding: 12,
          usePointStyle: true,
          pointStyleWidth: 8,
          font: { family: 'Inter', size: 11 },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(18, 18, 31, 0.95)',
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} min`,
        },
      },
    },
  }), []);

  if (chartData.labels.length === 0) return null;
  return <Bar data={chartData} options={options} />;
}

// --- Calendar Heatmap ---
export function CalendarHeatmap({ data, date }) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [date]);

  const dataMap = useMemo(() => {
    const map = {};
    if (Array.isArray(data)) {
      data.forEach((d) => {
        const key = d.date || format(new Date(d.date), 'yyyy-MM-dd');
        map[key] = d.tasksCompleted || d.actualMinutes || d.completedTasks || d.totalMinutes || d.value || 0;
      });
    }
    return map;
  }, [data]);

  const maxVal = useMemo(() => {
    const vals = Object.values(dataMap);
    return Math.max(...vals, 1);
  }, [dataMap]);

  // Calculate offset for first day of month
  const firstDayOffset = useMemo(() => {
    const d = getDay(days[0]);
    return d === 0 ? 6 : d - 1; // Monday = 0
  }, [days]);

  return (
    <div>
      <div className="calendar-grid" style={{ gap: 3, marginBottom: 8 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="calendar-day-label" style={{ fontSize: '0.65rem' }}>{d}</div>
        ))}

        {Array.from({ length: firstDayOffset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const val = dataMap[key] || 0;
          const intensity = val / maxVal;
          const bg = val > 0
            ? `rgba(124, 58, 237, ${0.15 + intensity * 0.7})`
            : 'rgba(255, 255, 255, 0.03)';

          return (
            <div
              key={key}
              className="calendar-day"
              style={{
                background: bg,
                fontSize: '0.7rem',
                aspectRatio: '1',
                borderRadius: 4,
                cursor: 'default',
              }}
              title={`${format(day, 'MMM d')}: ${val}`}
            >
              {format(day, 'd')}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-1 mt-2">
        <span className="text-xs text-muted">Less</span>
        {[0.1, 0.3, 0.55, 0.8, 1].map((o, i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: `rgba(124, 58, 237, ${0.1 + o * 0.75})`,
            }}
          />
        ))}
        <span className="text-xs text-muted">More</span>
      </div>
    </div>
  );
}
