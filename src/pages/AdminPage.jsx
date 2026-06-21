import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import {
  Shield, UserPlus, Trash2, Edit3, Save, X,
  Mail, User, Lock, Crown,
} from 'lucide-react';

export default function AdminPage() {
  const api = useApi();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState({ text: '', type: '' });

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);

  // Delete loading
  const [deleting, setDeleting] = useState({});

  // Guard: only admins
  useEffect(() => {
    if (!user?.isAdmin) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/api/admin/users');
      setUsers(data?.users || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (user?.isAdmin) fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = useCallback(async (e) => {
    e.preventDefault();
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) return;
    setCreating(true);
    setCreateMsg({ text: '', type: '' });
    try {
      await api.post('/api/admin/users', newUser);
      setCreateMsg({ text: 'User created successfully!', type: 'success' });
      setNewUser({ name: '', email: '', password: '' });
      fetchUsers();
    } catch (err) {
      setCreateMsg({ text: err.message, type: 'error' });
    } finally {
      setCreating(false);
    }
  }, [api, newUser, fetchUsers]);

  const handleDelete = useCallback(async (userId) => {
    if (userId === user?.id) return;
    setDeleting((prev) => ({ ...prev, [userId]: true }));
    try {
      await api.del(`/api/admin/users/${userId}`);
      fetchUsers();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting((prev) => ({ ...prev, [userId]: false }));
    }
  }, [api, user, fetchUsers]);

  const startEdit = useCallback((u) => {
    setEditingId(u.id);
    setEditData({ name: u.name || '', email: u.email || '', password: '' });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditData({ name: '', email: '', password: '' });
  }, []);

  const handleSaveEdit = useCallback(async (userId) => {
    setSaving(true);
    try {
      const body = { name: editData.name, email: editData.email };
      if (editData.password.trim()) {
        body.password = editData.password;
      }
      await api.put(`/api/admin/users/${userId}`, body);
      setEditingId(null);
      fetchUsers();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [api, editData, fetchUsers]);

  if (!user?.isAdmin) return null;

  return (
    <>
      <div className="flex items-center gap-2 mb-4" style={{ animation: 'fadeIn 0.3s var(--ease-out)' }}>
        <Shield size={22} style={{ color: 'var(--accent-amber)' }} />
        <h1 className="text-xl font-bold">Admin Panel</h1>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Create User */}
      <div className="glass-card mb-4" style={{ animation: 'fadeIn 0.3s var(--ease-out)' }}>
        <button
          className="flex items-center gap-2 w-full"
          onClick={() => setShowCreate(!showCreate)}
          style={{ minHeight: 36 }}
        >
          <UserPlus size={18} style={{ color: 'var(--primary-cyan)' }} />
          <span className="font-semibold text-sm">Create New User</span>
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
            {showCreate ? '−' : '+'}
          </span>
        </button>

        {showCreate && (
          <form onSubmit={handleCreate} className="mt-4" style={{ animation: 'fadeIn 0.2s var(--ease-out)' }}>
            <div className="form-group">
              <label className="form-label">
                <User size={12} style={{ display: 'inline', marginRight: 4 }} />Name
              </label>
              <input
                className="form-input"
                placeholder="Full name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                <Mail size={12} style={{ display: 'inline', marginRight: 4 }} />Email
              </label>
              <input
                type="email"
                className="form-input"
                placeholder="user@example.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                <Lock size={12} style={{ display: 'inline', marginRight: 4 }} />Password
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={creating}
            >
              {creating ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Create User'}
            </button>
            {createMsg.text && (
              <div
                className="mt-2 text-sm"
                style={{
                  color: createMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
                  padding: 'var(--sp-2) 0',
                }}
              >
                {createMsg.text}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Users list */}
      <div className="section-header">
        <h2 className="section-title">Users</h2>
        {!loading && <span className="text-sm text-muted">{users.length}</span>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center mt-6">
          <div className="spinner spinner-lg" />
        </div>
      ) : users.length === 0 ? (
        <div className="empty-state mt-4">
          <User size={48} />
          <p className="text-secondary">No users found</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u, idx) => {
            const isEditing = editingId === u.id;
            const isSelf = u.id === user?.id;

            return (
              <div
                key={u.id}
                className="glass-card"
                style={{ animation: `fadeIn ${0.2 + idx * 0.04}s var(--ease-out)` }}
              >
                {isEditing ? (
                  /* Edit mode */
                  <div className="flex flex-col gap-3">
                    <input
                      className="form-input"
                      value={editData.name}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      placeholder="Name"
                      style={{ minHeight: 40 }}
                    />
                    <input
                      type="email"
                      className="form-input"
                      value={editData.email}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      placeholder="Email"
                      style={{ minHeight: 40 }}
                    />
                    <input
                      type="password"
                      className="form-input"
                      value={editData.password}
                      onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                      placeholder="New password (leave blank to keep)"
                      style={{ minHeight: 40 }}
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSaveEdit(u.id)}
                        disabled={saving}
                        style={{ flex: 1 }}
                      >
                        {saving ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <><Save size={14} /> Save</>}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={cancelEdit}
                        style={{ flex: 1 }}
                      >
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: u.isAdmin ? 'var(--gradient-primary)' : 'rgba(255,255,255,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 'var(--text-sm)', fontWeight: 600,
                        color: u.isAdmin ? 'white' : 'var(--text-secondary)',
                        flexShrink: 0,
                      }}
                    >
                      {(u.name || u.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{u.name || 'Unnamed'}</span>
                        {u.isAdmin && (
                          <span
                            className="badge"
                            style={{
                              background: 'var(--accent-amber-dim)',
                              color: 'var(--accent-amber)',
                              border: '1px solid rgba(245,158,11,0.2)',
                            }}
                          >
                            <Crown size={9} /> Admin
                          </span>
                        )}
                        {isSelf && (
                          <span className="badge" style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--primary-cyan)' }}>
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted truncate">{u.email}</div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-icon btn-sm btn-ghost"
                        onClick={() => startEdit(u)}
                        aria-label="Edit user"
                      >
                        <Edit3 size={14} />
                      </button>
                      {!isSelf && (
                        <button
                          className="btn btn-icon btn-sm btn-danger"
                          onClick={() => handleDelete(u.id)}
                          disabled={deleting[u.id]}
                          aria-label="Delete user"
                        >
                          {deleting[u.id] ? (
                            <div className="spinner" style={{ width: 14, height: 14 }} />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
