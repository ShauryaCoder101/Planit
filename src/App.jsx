import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { TimerProvider } from './hooks/useTimer.jsx';
import LoginPage from './pages/LoginPage.jsx';
import TodayPage from './pages/TodayPage.jsx';
import TasksPage from './pages/TasksPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import FriendsPage from './pages/FriendsPage.jsx';
import FriendProfilePage from './pages/FriendProfilePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import BottomNav from './components/BottomNav.jsx';
import TimerBanner from './components/TimerBanner.jsx';
import { useTimer } from './hooks/useTimer.jsx';

function AuthenticatedApp() {
  const { activeTimer } = useTimer();
  const hasTimer = !!activeTimer;

  return (
    <div className="app-layout">
      {hasTimer && <TimerBanner />}
      <div className={`page-content ${hasTimer ? 'has-timer' : ''}`}>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/friends/:friendId" element={<FriendProfilePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BottomNav />
    </div>
  );
}

function AppInner() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <TimerProvider>
      <AuthenticatedApp />
    </TimerProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
