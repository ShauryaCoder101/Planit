import React, { useMemo, useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Title,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { format } from 'date-fns';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Title);

// Plugin to draw a horizontal reference line at 7h
const recommendedLinePlugin = {
  id: 'recommendedLine',
  afterDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!scales.y) return;
    const y = scales.y.getPixelForValue(7);
    if (y < chartArea.top || y > chartArea.bottom) return;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.7)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    ctx.fillText('7h recommended', chartArea.right, y - 4);
    ctx.restore();
  },
};

export default function SleepChart({ data, mode = 'week' }) {
  const chartRef = useRef(null);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return { labels: [], datasets: [] };

    const labels = data.map((d) => {
      try {
        const dateObj = new Date(d.date);
        return mode === 'week'
          ? format(dateObj, 'EEE')
          : format(dateObj, 'd');
      } catch {
        return d.date;
      }
    });

    const values = data.map((d) => d.hours ?? d.sleepHours ?? 0);

    return {
      labels,
      datasets: [
        {
          label: 'Sleep (hours)',
          data: values,
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: canvasCtx, chartArea } = chart;
            if (!chartArea) return '#7c3aedcc';
            const gradient = canvasCtx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, 'rgba(124, 58, 237, 0.8)');
            gradient.addColorStop(1, 'rgba(6, 182, 212, 0.8)');
            return gradient;
          },
          borderColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: canvasCtx, chartArea } = chart;
            if (!chartArea) return '#7c3aed';
            const gradient = canvasCtx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, '#7c3aed');
            gradient.addColorStop(1, '#06b6d4');
            return gradient;
          },
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 32,
        },
      ],
    };
  }, [data, mode]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: true,
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: '#64748b',
          font: { family: 'Inter', size: 11 },
        },
      },
      y: {
        min: 0,
        max: 12,
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: '#64748b',
          font: { family: 'Inter', size: 11 },
          stepSize: 2,
          callback: (v) => `${v}h`,
        },
        title: {
          display: true,
          text: 'Hours',
          color: '#64748b',
          font: { family: 'Inter', size: 11 },
        },
      },
    },
    plugins: {
      legend: { display: false },
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
          label: (ctx) => ` ${ctx.parsed.y.toFixed(1)} hours`,
        },
      },
    },
  }), []);

  if (!data || data.length === 0) return null;

  return (
    <Bar
      ref={chartRef}
      data={chartData}
      options={options}
      plugins={[recommendedLinePlugin]}
    />
  );
}
