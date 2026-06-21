import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { useApi } from '../hooks/useApi.jsx';
import CalendarPicker from '../components/CalendarPicker.jsx';
import { DoughnutChart, StackedBarChart, CalendarHeatmap } from '../components/ReportCharts.jsx';
import { Download, Moon, CheckCircle2, Clock, BarChart3 } from 'lucide-react';

export default function ReportsPage() {
  const api = useApi();
  const [tab, setTab] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reportRef = useRef(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let data;
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      if (tab === 'daily') {
        data = await api.get(`/api/reports/daily?date=${dateStr}`);
      } else if (tab === 'weekly') {
        data = await api.get(`/api/reports/weekly?date=${dateStr}`);
      } else {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth() + 1;
        data = await api.get(`/api/reports/monthly?year=${year}&month=${month}`);
      }
      // Backend wraps in { report: { summary, dayBreakdown, sleepData } }
      setReport(data?.report || data || null);
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [api, tab, selectedDate]);

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedDate]);

  const handleExportPDF = useCallback(async () => {
    if (!reportRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#0a0a1a',
        scale: 2,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`planit-report-${format(selectedDate, 'yyyy-MM-dd')}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    }
  }, [selectedDate]);

  const calendarMode = tab === 'daily' ? 'day' : tab === 'weekly' ? 'week' : 'month';

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Reports</h1>
        <button className="btn btn-sm btn-secondary" onClick={handleExportPDF}>
          <Download size={16} /> PDF
        </button>
      </div>

      {/* Tabs */}
      <div className="tab-selector">
        {['daily', 'weekly', 'monthly'].map((t) => (
          <button
            key={t}
            className={`tab-item ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Calendar */}
      <CalendarPicker
        selected={selectedDate}
        onChange={setSelectedDate}
        mode={calendarMode}
      />

      {error && <div className="error-message mt-4">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center mt-6">
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <div ref={reportRef} className="mt-4 flex flex-col gap-4">
          {tab === 'daily' && report && <DailyReport report={report} />}
          {tab === 'weekly' && report && <WeeklyReport report={report} />}
          {tab === 'monthly' && report && <MonthlyReport report={report} date={selectedDate} />}
          {!report && !loading && (
            <div className="empty-state mt-4">
              <BarChart3 size={48} />
              <p className="text-secondary">No data for this period</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DailyReport({ report }) {
  const summary = report.summary || {};
  const categoryBreakdown = summary.totalHoursByGoal || {};
  const completedTasks = summary.tasksCompleted || 0;
  const totalTasks = summary.tasksTotal || 0;
  const totalMinutes = (summary.totalActualHours || 0) * 60;
  const sleepData = report.sleepData || [];
  const sleep = sleepData.length > 0 ? sleepData[0] : null;

  return (
    <>
      <div className="report-stat-grid">
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{completedTasks}/{totalTasks}</div>
          <div className="report-stat-label"><CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />Tasks Done</div>
        </div>
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{(totalMinutes / 60).toFixed(1)}h</div>
          <div className="report-stat-label"><Clock size={12} style={{ display: 'inline', marginRight: 4 }} />Productive</div>
        </div>
        <div className="glass-card report-stat-card">
          <div className="report-stat-value" style={{ color: sleep && sleep.hours >= 7 ? 'var(--success)' : 'var(--accent-amber)' }}>
            {sleep ? `${sleep.hours}h` : '—'}
          </div>
          <div className="report-stat-label"><Moon size={12} style={{ display: 'inline', marginRight: 4 }} />Sleep</div>
        </div>
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">
            {totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%
          </div>
          <div className="report-stat-label">Completion</div>
        </div>
      </div>

      {Object.keys(categoryBreakdown).length > 0 && (
        <div className="glass-card mt-4">
          <h3 className="font-semibold mb-3">Hours by Goal</h3>
          <div className="chart-container">
            <DoughnutChart data={categoryBreakdown} />
          </div>
        </div>
      )}
    </>
  );
}

function WeeklyReport({ report }) {
  const summary = report.summary || {};
  const dayBreakdown = report.dayBreakdown || [];
  const categoryTotals = summary.totalHoursByGoal || {};

  const numDays = dayBreakdown.length || 7;
  const averages = {
    tasksPerDay: (summary.tasksTotal || 0) / numDays,
    hoursPerDay: summary.averageDailyHours || 0,
    completionRate: summary.completionRate || 0,
    sleepPerDay: summary.averageSleepHours || null,
  };

  return (
    <>
      <div className="report-stat-grid">
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{averages.tasksPerDay?.toFixed(1) || '0'}</div>
          <div className="report-stat-label">Avg Tasks/Day</div>
        </div>
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{averages.hoursPerDay?.toFixed(1) || '0'}h</div>
          <div className="report-stat-label">Avg Hours/Day</div>
        </div>
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{averages.completionRate?.toFixed(0) || '0'}%</div>
          <div className="report-stat-label">Avg Completion</div>
        </div>
        <div className="glass-card report-stat-card">
          <div className="report-stat-value" style={{ color: 'var(--success)' }}>{averages.sleepPerDay?.toFixed(1) || '—'}h</div>
          <div className="report-stat-label">Avg Sleep</div>
        </div>
      </div>

      {dayBreakdown.length > 0 && (
        <div className="glass-card mt-4">
          <h3 className="font-semibold mb-3">Weekly Breakdown</h3>
          <div className="chart-container">
            <StackedBarChart data={dayBreakdown} />
          </div>
        </div>
      )}

      {Object.keys(categoryTotals).length > 0 && (
        <div className="glass-card mt-4">
          <h3 className="font-semibold mb-3">Time by Category</h3>
          <div className="chart-container">
            <DoughnutChart data={categoryTotals} />
          </div>
        </div>
      )}
    </>
  );
}

function MonthlyReport({ report, date }) {
  const summary = report.summary || {};
  const categoryTotals = summary.totalHoursByGoal || {};
  const dailyData = report.dayBreakdown || [];
  const totalTasks = summary.tasksTotal || 0;
  const completedTasks = summary.tasksCompleted || 0;
  const totalMinutes = (summary.totalActualHours || 0) * 60;

  return (
    <>
      <div className="report-stat-grid">
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{completedTasks}/{totalTasks}</div>
          <div className="report-stat-label">Tasks Completed</div>
        </div>
        <div className="glass-card report-stat-card">
          <div className="report-stat-value gradient-text">{(totalMinutes / 60).toFixed(1)}h</div>
          <div className="report-stat-label">Total Hours</div>
        </div>
      </div>

      {dailyData.length > 0 && (
        <div className="glass-card mt-4">
          <h3 className="font-semibold mb-3">Activity Heatmap</h3>
          <CalendarHeatmap data={dailyData} date={date} />
        </div>
      )}

      {Object.keys(categoryTotals).length > 0 && (
        <div className="glass-card mt-4">
          <h3 className="font-semibold mb-3">Totals by Category</h3>
          <div className="chart-container">
            <DoughnutChart data={categoryTotals} />
          </div>
        </div>
      )}
    </>
  );
}
