import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.jsx';
import {
  ArrowLeft, BookOpen, Brain, RotateCcw, ChevronDown, ChevronRight,
  CheckCircle2, Circle, Send, ImagePlus, Loader2, Eye, EyeOff,
  ChevronLeft, ChevronRight as ChevronRightIcon, Trash2, X
} from 'lucide-react';

const SUBJECTS = [
  { key: 'maths', label: 'MATHS', color: '#6366f1', emoji: '📐' },
  { key: 'lrdi', label: 'LRDI', color: '#f59e0b', emoji: '📊' },
  { key: 'english', label: 'ENGLISH', color: '#10b981', emoji: '📖' },
];

export default function CatPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', paddingBottom: '20px' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(245,158,11,0.10))',
        borderBottom: '1px solid var(--border)'
      }}>
        <button className="btn btn-icon btn-ghost" onClick={() => navigate('/tasks')} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontFamily: 'Outfit, sans-serif', fontWeight: 700, margin: 0 }}>
            🎯 CAT — Focussed
          </h1>
          <span className="text-xs text-muted">Prepare. Practice. Revise.</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 0, padding: '12px 16px 0', borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'dashboard', label: 'Dashboard', Icon: BookOpen },
          { key: 'ai', label: 'AI Helper', Icon: Brain },
          { key: 'revision', label: 'Revision', Icon: RotateCcw },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer',
              background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontSize: '0.85rem', fontWeight: activeTab === key ? 700 : 500,
              color: activeTab === key ? 'var(--primary-cyan)' : 'var(--text-secondary)',
              borderBottom: activeTab === key ? '2px solid var(--primary-cyan)' : '2px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ padding: '16px' }}>
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'ai' && <AiHelperTab />}
        {activeTab === 'revision' && <RevisionTab />}
      </div>
    </div>
  );
}

// ─── DASHBOARD TAB ──────────────────────────────────────────────────────────

function DashboardTab() {
  const api = useApi();
  const [topics, setTopics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedSubject, setExpandedSubject] = useState(null);
  const [expandedTopic, setExpandedTopic] = useState(null);

  const fetchTopics = useCallback(async () => {
    try {
      const data = await api.get('/api/cat/topics');
      setTopics(data.topics || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { fetchTopics(); }, []);

  const toggleTopic = useCallback(async (id) => {
    try {
      await api.put(`/api/cat/topics/${id}/toggle`);
      fetchTopics();
    } catch (err) {
      console.error(err);
    }
  }, [api, fetchTopics]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {SUBJECTS.map(({ key, label, color, emoji }) => {
        const subjectTopics = topics?.[key] || {};
        const allItems = Object.values(subjectTopics).flat();
        const completed = allItems.filter(t => t.completed).length;
        const total = allItems.length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const isExpanded = expandedSubject === key;

        return (
          <div key={key} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              onClick={() => setExpandedSubject(isExpanded ? null : key)}
              style={{
                width: '100%', padding: '18px 20px', border: 'none', cursor: 'pointer',
                background: `linear-gradient(135deg, ${color}18, ${color}08)`,
                display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
              }}
            >
              <span style={{ fontSize: '1.8rem' }}>{emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                  {label}
                </div>
                <div style={{ marginTop: 4 }}>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
                  </div>
                  <span className="text-xs text-muted" style={{ marginTop: 2, display: 'block' }}>
                    {completed}/{total} topics · {pct}%
                  </span>
                </div>
              </div>
              {isExpanded ? <ChevronDown size={20} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={20} style={{ color: 'var(--text-muted)' }} />}
            </button>

            {isExpanded && (
              <div style={{ padding: '8px 16px 16px' }}>
                {Object.entries(subjectTopics).map(([topicName, items]) => {
                  const topicKey = `${key}-${topicName}`;
                  const topicExpanded = expandedTopic === topicKey;
                  const topicCompleted = items.filter(i => i.completed).length;

                  return (
                    <div key={topicName} style={{ marginBottom: 4 }}>
                      <button
                        onClick={() => setExpandedTopic(topicExpanded ? null : topicKey)}
                        style={{
                          width: '100%', padding: '10px 8px', border: 'none', cursor: 'pointer',
                          background: 'none', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                        }}
                      >
                        {topicExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {topicName}
                        </span>
                        <span className="text-xs" style={{ color, fontWeight: 600 }}>
                          {topicCompleted}/{items.length}
                        </span>
                      </button>

                      {topicExpanded && (
                        <div style={{ paddingLeft: 28 }}>
                          {items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => toggleTopic(item.id)}
                              style={{
                                width: '100%', padding: '8px 6px', border: 'none', cursor: 'pointer',
                                background: 'none', display: 'flex', alignItems: 'center', gap: 10,
                                textAlign: 'left', transition: 'opacity 0.2s',
                                opacity: item.completed ? 0.55 : 1,
                              }}
                            >
                              {item.completed
                                ? <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                : <Circle size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                              }
                              <span
                                className="text-sm"
                                style={item.completed ? { textDecoration: 'line-through', color: 'var(--text-muted)' } : {}}
                              >
                                {item.subtopic || item.topic}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── AI HELPER TAB ──────────────────────────────────────────────────────────

function AiHelperTab() {
  const api = useApi();
  const [questionText, setQuestionText] = useState('');
  const [questionImage, setQuestionImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleImageUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setQuestionImage(reader.result);
      setImagePreview(URL.createObjectURL(file));
    };
    reader.readAsDataURL(file);
  }, []);

  const removeImage = useCallback(() => {
    setQuestionImage(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleAsk = useCallback(async () => {
    if (!questionText.trim() && !questionImage) {
      setError('Type a question or upload an image');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.post('/api/cat/ask', { questionText: questionText.trim(), questionImage });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, questionText, questionImage]);

  const subjectInfo = result?.subject ? SUBJECTS.find(s => s.key === result.subject) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="glass-card">
        <h3 style={{ fontWeight: 700, fontSize: '1rem', fontFamily: 'Outfit, sans-serif', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={18} style={{ color: 'var(--primary-cyan)' }} /> Ask a Question
        </h3>

        <textarea
          className="form-input"
          placeholder="Type your CAT question here..."
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          rows={4}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />

        {imagePreview && (
          <div style={{ position: 'relative', marginTop: 10, display: 'inline-block' }}>
            <img src={imagePreview} alt="Question" style={{ maxHeight: 200, borderRadius: 8, border: '1px solid var(--border)' }} />
            <button
              onClick={removeImage}
              style={{
                position: 'absolute', top: -8, right: -8, background: 'var(--danger)',
                border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={14} color="white" />
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <input type="file" accept="image/*" ref={fileRef} onChange={handleImageUpload} style={{ display: 'none' }} />
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} /> Upload Image
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAsk}
            disabled={loading}
            style={{ marginLeft: 'auto' }}
          >
            {loading ? <><Loader2 size={16} className="spinning" /> Solving...</> : <><Send size={16} /> Solve</>}
          </button>
        </div>

        {error && <div className="error-message" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {result && (
        <div className="glass-card" style={{ borderLeft: `3px solid ${subjectInfo?.color || 'var(--primary-cyan)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{
              padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700,
              background: `${subjectInfo?.color}20`, color: subjectInfo?.color,
              textTransform: 'uppercase',
            }}>
              {subjectInfo?.emoji} {subjectInfo?.label || result.subject}
            </span>
            <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>✓ Saved to Revision</span>
          </div>
          <div style={{ fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
            {result.solution}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── REVISION TAB ───────────────────────────────────────────────────────────

function RevisionTab() {
  const api = useApi();
  const [counts, setCounts] = useState({ maths: 0, lrdi: 0, english: 0 });
  const [activeSubject, setActiveSubject] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    try {
      const data = await api.get('/api/cat/revision');
      setCounts(data.counts || { maths: 0, lrdi: 0, english: 0 });
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { fetchCounts(); }, []);

  const openSubject = useCallback(async (subject) => {
    try {
      const data = await api.get(`/api/cat/revision/${subject}`);
      setQuestions(data.questions || []);
      setCurrentIdx(0);
      setShowSolution(false);
      setActiveSubject(subject);
    } catch (err) { console.error(err); }
  }, [api]);

  const handleDelete = useCallback(async (id) => {
    try {
      await api.delete(`/api/cat/revision/${id}`);
      setQuestions(prev => prev.filter(q => q.id !== id));
      if (currentIdx >= questions.length - 1) setCurrentIdx(Math.max(0, currentIdx - 1));
      fetchCounts();
    } catch (err) { console.error(err); }
  }, [api, currentIdx, questions.length, fetchCounts]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>;

  // Subject selection view
  if (!activeSubject) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SUBJECTS.map(({ key, label, color, emoji }) => (
          <button
            key={key}
            className="glass-card glass-card-hover"
            onClick={() => openSubject(key)}
            style={{
              cursor: 'pointer', border: 'none', textAlign: 'left',
              background: `linear-gradient(135deg, ${color}18, ${color}08)`,
              display: 'flex', alignItems: 'center', gap: 16, padding: '20px',
            }}
          >
            <span style={{ fontSize: '2rem' }}>{emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', fontFamily: 'Outfit, sans-serif', color: 'var(--text-primary)' }}>
                {label}
              </div>
              <span className="text-sm text-muted">{counts[key]} question{counts[key] !== 1 ? 's' : ''} saved</span>
            </div>
            <ChevronRightIcon size={20} style={{ color: 'var(--text-muted)' }} />
          </button>
        ))}
        {counts.maths + counts.lrdi + counts.english === 0 && (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
            No questions yet. Use the AI Helper to solve questions — they'll appear here for revision.
          </div>
        )}
      </div>
    );
  }

  // Flashcard view
  const subjectInfo = SUBJECTS.find(s => s.key === activeSubject);
  const question = questions[currentIdx];

  if (questions.length === 0) {
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => setActiveSubject(null)} style={{ marginBottom: 16 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No {subjectInfo?.label} questions saved yet.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setActiveSubject(null)}>
          <ArrowLeft size={16} /> Back
        </button>
        <span style={{ fontWeight: 700, color: subjectInfo?.color, fontFamily: 'Outfit, sans-serif' }}>
          {subjectInfo?.emoji} {subjectInfo?.label}
        </span>
        <span className="text-sm text-muted" style={{ marginLeft: 'auto' }}>
          {currentIdx + 1} / {questions.length}
        </span>
      </div>

      <div className="glass-card" style={{ borderTop: `3px solid ${subjectInfo?.color}` }}>
        {/* Question */}
        <div style={{ marginBottom: 16 }}>
          <span className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Question</span>
          {question.questionImage && (
            <img
              src={question.questionImage}
              alt="Question"
              style={{ display: 'block', maxWidth: '100%', maxHeight: 300, borderRadius: 8, margin: '10px 0', border: '1px solid var(--border)' }}
            />
          )}
          {question.questionText && (
            <p style={{ fontSize: '0.95rem', lineHeight: 1.7, marginTop: 8, color: 'var(--text-primary)' }}>
              {question.questionText}
            </p>
          )}
        </div>

        {/* Solution toggle */}
        {showSolution ? (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Eye size={14} style={{ color: 'var(--success)' }} />
              <span className="text-xs" style={{ color: 'var(--success)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Solution</span>
            </div>
            <div style={{ fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
              {question.solution}
            </div>
          </div>
        ) : null}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${showSolution ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => setShowSolution(!showSolution)}
          >
            {showSolution ? <><EyeOff size={14} /> Hide Solution</> : <><Eye size={14} /> Show Solution</>}
          </button>

          <button
            className="btn btn-sm btn-secondary"
            onClick={() => { setCurrentIdx((currentIdx + 1) % questions.length); setShowSolution(false); }}
          >
            Next <ChevronRightIcon size={14} />
          </button>

          {currentIdx > 0 && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => { setCurrentIdx(currentIdx - 1); setShowSolution(false); }}
            >
              <ChevronLeft size={14} /> Prev
            </button>
          )}

          <button
            className="btn btn-sm btn-ghost"
            onClick={() => handleDelete(question.id)}
            style={{ marginLeft: 'auto', color: 'var(--danger)' }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
        {questions.map((_, i) => (
          <button
            key={i}
            onClick={() => { setCurrentIdx(i); setShowSolution(false); }}
            style={{
              width: 10, height: 10, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: i === currentIdx ? subjectInfo?.color : 'var(--bg-tertiary)',
              transition: 'all 0.2s',
            }}
          />
        ))}
      </div>
    </div>
  );
}
