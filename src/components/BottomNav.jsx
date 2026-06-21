import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarDays, ListTodo, Users, BarChart3, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function BottomNav() {
  const { logout, user } = useAuth();

  const tabs = useMemo(() => {
    const items = [
      { to: '/', label: 'Today', Icon: CalendarDays },
      { to: '/tasks', label: 'Tasks', Icon: ListTodo },
      { to: '/friends', label: 'Friends', Icon: Users },
      { to: '/reports', label: 'Reports', Icon: BarChart3 },
    ];
    if (user?.isAdmin) {
      items.push({ to: '/admin', label: 'Admin', Icon: Shield });
    }
    return items;
  }, [user?.isAdmin]);

  return (
    <nav className="bottom-nav">
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `bottom-nav-item ${isActive ? 'active' : ''}`
          }
        >
          <Icon size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
      <button
        className="bottom-nav-item"
        onClick={logout}
        style={{ border: 'none', background: 'none', cursor: 'pointer' }}
        aria-label="Logout"
      >
        <LogOut size={20} />
        <span>Logout</span>
      </button>
    </nav>
  );
}
