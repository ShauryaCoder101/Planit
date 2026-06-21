import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card glass-card" onSubmit={handleSubmit}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <img src="/favicon.png" alt="Planit" style={{ width: '64px', height: '64px', borderRadius: '16px' }} />
        </div>
        <h1 className="login-title gradient-text">Planit</h1>
        <p className="login-subtitle">Track your time, goals & productivity</p>

        {error && (
          <div className="error-message" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            className="form-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            className="form-input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            padding: '14px 20px',
            marginTop: '16px',
            background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
            color: 'white',
            fontSize: '16px',
            fontWeight: '600',
            border: 'none',
            borderRadius: '12px',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            minHeight: '52px',
            boxShadow: '0 4px 16px rgba(124, 58, 237, 0.3)',
            transition: 'all 0.2s ease',
          }}
        >
          {loading ? (
            <div className="spinner" style={{ width: 20, height: 20 }} />
          ) : (
            <>
              <LogIn size={20} />
              <span>Sign In</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
