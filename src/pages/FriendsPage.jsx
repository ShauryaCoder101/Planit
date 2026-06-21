import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useApi } from '../hooks/useApi.jsx';
import {
  Users, UserPlus, Send, ChevronDown, ChevronUp,
  Check, X, Clock, Mail, Inbox, ArrowUpRight,
} from 'lucide-react';

export default function FriendsPage() {
  const api = useApi();
  const navigate = useNavigate();

  // Friends list
  const [friends, setFriends] = useState([]);
  const [friendActivities, setFriendActivities] = useState({});
  const [loadingFriends, setLoadingFriends] = useState(true);

  // Friend requests
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [requestsOpen, setRequestsOpen] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // Add friend form
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Action loading states
  const [actionLoading, setActionLoading] = useState({});

  const fetchFriends = useCallback(async () => {
    setLoadingFriends(true);
    try {
      const data = await api.get('/api/friends');
      const list = data?.friends || data || [];
      setFriends(list);

      // Fetch activity for each friend
      const today = format(new Date(), 'yyyy-MM-dd');
      const activities = {};
      await Promise.allSettled(
        list.map(async (f) => {
          try {
            const act = await api.get(`/api/friends/${f.id}/activity?period=day&date=${today}`);
            activities[f.id] = act;
          } catch {
            // Friend may not have activity
          }
        })
      );
      setFriendActivities(activities);
    } catch (err) {
      console.error('Failed to load friends:', err);
    } finally {
      setLoadingFriends(false);
    }
  }, [api]);

  const fetchRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const data = await api.get('/api/friends/requests');
      setRequests({
        incoming: data?.incoming || [],
        outgoing: data?.outgoing || [],
      });
    } catch (err) {
      console.error('Failed to load requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  }, [api]);

  useEffect(() => {
    fetchFriends();
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendRequest = useCallback(async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setMessage({ text: '', type: '' });
    try {
      await api.post('/api/friends/request', { email: email.trim() });
      setMessage({ text: 'Friend request sent!', type: 'success' });
      setEmail('');
      fetchRequests();
    } catch (err) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSending(false);
    }
  }, [api, email, fetchRequests]);

  const handleAccept = useCallback(async (requestId) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await api.post(`/api/friends/requests/${requestId}/accept`);
      fetchRequests();
      fetchFriends();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  }, [api, fetchRequests, fetchFriends]);

  const handleReject = useCallback(async (requestId) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await api.post(`/api/friends/requests/${requestId}/reject`);
      fetchRequests();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  }, [api, fetchRequests]);

  const getInitial = (name) => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  const getCurrentActivity = (friendId) => {
    const activity = friendActivities[friendId];
    if (!activity) return null;
    // Check for active timer / current task
    const activeTask = activity.activeTask || activity.currentTask;
    if (activeTask) {
      return activeTask.name || activeTask.taskName || 'Working on something';
    }
    return null;
  };

  const totalRequests = requests.incoming.length + requests.outgoing.length;

  return (
    <>
      <h1 className="text-xl font-bold mb-4">Friends</h1>

      {/* Add Friend */}
      <div className="glass-card mb-4" style={{ animation: 'fadeIn 0.3s var(--ease-out)' }}>
        <div className="flex items-center gap-2 mb-3">
          <UserPlus size={18} style={{ color: 'var(--primary-cyan)' }} />
          <h3 className="font-semibold text-sm">Add Friend</h3>
        </div>
        <form onSubmit={handleSendRequest} className="flex gap-2">
          <input
            type="email"
            className="form-input"
            placeholder="Enter email address..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ flex: 1, minHeight: 42 }}
            required
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={sending || !email.trim()}
            style={{ minHeight: 42, minWidth: 42 }}
          >
            {sending ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <Send size={16} />}
          </button>
        </form>
        {message.text && (
          <div
            className={`mt-2 text-sm ${message.type === 'success' ? '' : ''}`}
            style={{
              color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
              padding: 'var(--sp-2) 0',
            }}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Friend Requests */}
      {(loadingRequests || totalRequests > 0) && (
        <div className="glass-card mb-4" style={{ animation: 'fadeIn 0.4s var(--ease-out)' }}>
          <button
            className="flex items-center justify-between w-full"
            onClick={() => setRequestsOpen(!requestsOpen)}
            style={{ minHeight: 36 }}
          >
            <div className="flex items-center gap-2">
              <Inbox size={18} style={{ color: 'var(--accent-amber)' }} />
              <span className="font-semibold text-sm">Requests</span>
              {totalRequests > 0 && (
                <span
                  className="badge"
                  style={{
                    background: 'var(--gradient-primary)',
                    color: 'white',
                    fontSize: 'var(--text-xs)',
                    padding: '1px 8px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  {totalRequests}
                </span>
              )}
            </div>
            {requestsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {requestsOpen && (
            <div className="mt-3" style={{ animation: 'fadeIn 0.2s var(--ease-out)' }}>
              {loadingRequests ? (
                <div className="flex items-center justify-center p-4">
                  <div className="spinner" />
                </div>
              ) : (
                <>
                  {/* Incoming */}
                  {requests.incoming.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-muted mb-2" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Incoming
                      </div>
                      <div className="flex flex-col gap-2">
                        {requests.incoming.map((req) => (
                          <div
                            key={req.id}
                            className="flex items-center gap-3"
                            style={{
                              padding: 'var(--sp-2) var(--sp-3)',
                              background: 'rgba(255,255,255,0.03)',
                              borderRadius: 'var(--radius-md)',
                            }}
                          >
                            <div
                              style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'var(--gradient-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 'var(--text-sm)', fontWeight: 600, color: 'white', flexShrink: 0,
                              }}
                            >
                              {getInitial(req.fromName || req.fromEmail)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="text-sm font-medium truncate">{req.fromName || req.fromEmail}</div>
                              {req.fromEmail && req.fromName && (
                                <div className="text-xs text-muted truncate">{req.fromEmail}</div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button
                                className="btn btn-sm"
                                onClick={() => handleAccept(req.id)}
                                disabled={actionLoading[req.id]}
                                style={{
                                  background: 'var(--success-dim)', color: 'var(--success)',
                                  border: '1px solid rgba(16,185,129,0.2)',
                                  minWidth: 32, minHeight: 32, padding: 'var(--sp-1)',
                                }}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => handleReject(req.id)}
                                disabled={actionLoading[req.id]}
                                style={{ minWidth: 32, minHeight: 32, padding: 'var(--sp-1)' }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Outgoing */}
                  {requests.outgoing.length > 0 && (
                    <div>
                      <div className="text-xs text-muted mb-2" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Outgoing
                      </div>
                      <div className="flex flex-col gap-2">
                        {requests.outgoing.map((req) => (
                          <div
                            key={req.id}
                            className="flex items-center gap-3"
                            style={{
                              padding: 'var(--sp-2) var(--sp-3)',
                              background: 'rgba(255,255,255,0.03)',
                              borderRadius: 'var(--radius-md)',
                            }}
                          >
                            <div
                              style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0,
                              }}
                            >
                              {getInitial(req.toName || req.toEmail)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="text-sm font-medium truncate">{req.toName || req.toEmail}</div>
                              {req.toEmail && req.toName && (
                                <div className="text-xs text-muted truncate">{req.toEmail}</div>
                              )}
                            </div>
                            <span className="badge" style={{ background: 'var(--accent-amber-dim)', color: 'var(--accent-amber)' }}>
                              <Clock size={10} /> Pending
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {totalRequests === 0 && (
                    <div className="text-sm text-muted text-center p-3">No pending requests</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Friends List */}
      <div className="section-header">
        <h2 className="section-title">Your Friends</h2>
        {!loadingFriends && friends.length > 0 && (
          <span className="text-sm text-muted">{friends.length}</span>
        )}
      </div>

      {loadingFriends ? (
        <div className="flex items-center justify-center mt-6">
          <div className="spinner spinner-lg" />
        </div>
      ) : friends.length === 0 ? (
        <div className="empty-state mt-4">
          <Users size={48} />
          <p className="text-secondary">No friends yet</p>
          <p className="text-xs text-muted">Send a friend request to get started</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {friends.map((friend, idx) => {
            const currentActivity = getCurrentActivity(friend.id);
            return (
              <button
                key={friend.id}
                className="glass-card glass-card-hover"
                onClick={() => navigate(`/friends/${friend.id}`)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                  animation: `fadeIn ${0.2 + idx * 0.05}s var(--ease-out)`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: 'var(--gradient-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 'var(--text-base)', fontWeight: 700, color: 'white', flexShrink: 0,
                    }}
                  >
                    {getInitial(friend.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="font-medium truncate">{friend.name}</div>
                    <div className="text-xs text-muted truncate flex items-center gap-1">
                      <Mail size={10} /> {friend.email}
                    </div>
                    {currentActivity && (
                      <div
                        className="text-xs mt-1 flex items-center gap-1 truncate"
                        style={{ color: 'var(--primary-cyan)' }}
                      >
                        <Clock size={10} style={{ flexShrink: 0 }} />
                        <span className="truncate">{currentActivity}</span>
                      </div>
                    )}
                  </div>
                  <ArrowUpRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
