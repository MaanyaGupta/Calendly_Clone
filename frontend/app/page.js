'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { buildApiUrl } from '../lib/api';

const COLORS = [
  '#0069ff', '#6c3cf0', '#ff6b00', '#00a86b',
  '#e74c3c', '#f5a623', '#1abc9c', '#e91e63',
];

export default function SchedulingPage() {
  return (
    <Suspense fallback={<div className="loading"><div className="loading-spinner"></div></div>}>
      <SchedulingPageContent />
    </Suspense>
  );
}

function SchedulingPageContent() {
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [toast, setToast] = useState(null);
  const [userName, setUserName] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    setIsMounted(true);
    fetchEventTypes();
  }, []);

  useEffect(() => {
    if (searchParams.get('create') !== 'true') {
      return;
    }

    setEditingEvent(null);
    setShowCreateModal(true);

    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
    }
  }, [searchParams]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchEventTypes() {
    try {
      const res = await fetch(buildApiUrl('/event-types'));
      const data = await res.json();
      setEventTypes(data);
      if (data.length > 0 && data[0].user) {
        setUserName(data[0].user.name);
      }
    } catch (error) {
      console.error('Error fetching event types:', error);
    } finally {
      setLoading(false);
    }
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (!success) {
      throw new Error('Clipboard copy failed');
    }
  }

  async function handleCopyLink(slug) {
    const link = `${window.location.origin}/${slug}`;
    try {
      await copyTextToClipboard(link);
      showToast('Link copied to clipboard!');
    } catch {
      showToast('Failed to copy link', 'error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this event type?')) return;
    try {
      await fetch(buildApiUrl(`/event-types/${id}`), { method: 'DELETE' });
      setEventTypes((prev) => prev.filter((e) => e.id !== id));
      setOpenMenuId(null);
      showToast('Event type deleted');
    } catch (error) {
      showToast('Failed to delete', 'error');
    }
  }

  async function handleToggle(id) {
    try {
      const res = await fetch(buildApiUrl(`/event-types/${id}/toggle`), { method: 'PATCH' });
      const updated = await res.json();
      setEventTypes((prev) => prev.map((e) => (e.id === id ? { ...e, isActive: updated.isActive } : e)));
      setOpenMenuId(null);
    } catch (error) {
      showToast('Failed to toggle', 'error');
    }
  }

  function handleEdit(eventType) {
    setEditingEvent(eventType);
    setShowCreateModal(true);
    setOpenMenuId(null);
  }

  const filteredEvents = eventTypes.filter((e) =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const initials = userName ? userName.split(' ').map((n) => n[0]).join('').toUpperCase() : 'U';

  return (
    <main className="main-content">
      {/* Header Bar */}
      <div className="header-bar">
        <div className="header-avatar">{initials}</div>
      </div>

      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">
          Scheduling
          <span className="help-icon">?</span>
        </h1>
        <button className="btn-create" onClick={() => { setEditingEvent(null); setShowCreateModal(true); }}>
          + Create
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className="tab active">Event types</button>
        <button className="tab">Single-use links</button>
        <button className="tab">Meeting polls</button>
      </div>

      {/* Search */}
      <div className="search-bar" style={{ position: 'relative' }}>
        <span className="search-icon">🔍</span>
        {!isMounted ? (
          <input
            key="server-search"
            type="text"
            placeholder="Search event types"
            defaultValue=""
            readOnly
            style={{ paddingLeft: '36px' }}
            suppressHydrationWarning
          />
        ) : (
          <input
            key="client-search"
            type="text"
            placeholder="Search event types"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px' }}
            suppressHydrationWarning
          />
        )}
      </div>

      {/* User Section */}
      <div className="user-section">
        <div className="user-info">
          <div className="user-avatar">{initials}</div>
          <span className="user-name">{userName || 'User'}</span>
        </div>
        <button className="view-landing-btn">
          ↗ View landing page
        </button>
      </div>

      {/* Event Types List */}
      <div className="event-types-list">
        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <h3 className="empty-state-title">No event types yet</h3>
            <p className="empty-state-text">Create your first event type to start scheduling meetings</p>
          </div>
        ) : (
          filteredEvents.map((event) => (
            <div
              key={event.id}
              className="event-type-card"
              style={{
                borderLeftColor: event.color || '#0069ff',
                opacity: event.isActive ? 1 : 0.6,
              }}
            >
              <div className="event-card-left">
                <input
                  type="checkbox"
                  className="event-card-checkbox"
                  checked={event.isActive}
                  onChange={() => handleToggle(event.id)}
                />
                <div className="event-card-info" onClick={() => handleEdit(event)}>
                  <div className="event-card-name">{event.name}</div>
                  <div className="event-card-details">
                    <div className="event-card-meta">
                      <span>{event.duration} min</span>
                      <span className="meta-separator">·</span>
                      <span>{event.description || 'One-on-One'}</span>
                    </div>
                    <div className="event-card-meta" style={{ color: 'var(--text-muted)' }}>
                      Mon, Tue, Wed, Thu, Fri, Sun, 9 am - 5 pm
                    </div>
                  </div>
                </div>
              </div>
              <div className="event-card-right">
                <button className="btn-copy-link" onClick={() => handleCopyLink(event.slug)}>
                  <span className="link-icon">🔗</span>
                  Copy link
                </button>
                <div style={{ position: 'relative' }} ref={openMenuId === event.id ? menuRef : null}>
                  <button className="btn-more" onClick={() => setOpenMenuId(openMenuId === event.id ? null : event.id)}>
                    ⋮
                  </button>
                  {openMenuId === event.id && (
                    <div className="dropdown-menu">
                      <button className="dropdown-item" onClick={() => { window.open(`/${event.slug}`, '_blank'); setOpenMenuId(null); }}>
                        📄 View booking page
                      </button>
                      <button className="dropdown-item" onClick={() => handleEdit(event)}>
                        ✏️ Edit
                      </button>
                      <button className="dropdown-item" onClick={() => handleCopyLink(event.slug)}>
                        🔗 Copy link
                      </button>
                      <button className="dropdown-item" onClick={() => handleToggle(event.id)}>
                        {event.isActive ? '⏸️ Turn off' : '▶️ Turn on'}
                      </button>
                      <button className="dropdown-item danger" onClick={() => handleDelete(event.id)}>
                        🗑️ Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <EventTypeModal
          event={editingEvent}
          onClose={() => { setShowCreateModal(false); setEditingEvent(null); }}
          onSave={() => { 
            setShowCreateModal(false); 
            setEditingEvent(null); 
            fetchEventTypes(); 
            showToast(editingEvent ? 'Event type updated!' : 'Event type created!');
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </main>
  );
}

const EVENT_TYPE_CATEGORIES = [
  {
    name: 'One-on-one',
    desc: '1 host → 1 invitee',
    sub: 'Good for coffee chats, 1:1 interviews, etc.',
    icon: '👤',
  },
  {
    name: 'Group',
    desc: '1 host → Multiple invitees',
    sub: 'Webinars, online classes, etc.',
    icon: '👥',
  },
  {
    name: 'Round robin',
    desc: 'Rotating hosts → 1 invitee',
    sub: 'Distribute meetings between team members',
    icon: '🔄',
    highlight: true,
  },
  {
    name: 'Collective',
    desc: 'Multiple hosts → 1 invitee',
    sub: 'Panel interviews, group sales calls, etc.',
    icon: '🤝',
  },
];

const MORE_WAYS = [
  {
    name: 'One-off meeting',
    desc: 'Offer time outside your normal schedule',
    icon: '📅',
  },
  {
    name: 'Meeting poll',
    desc: 'Let invitees vote on a time to meet',
    icon: '📊',
  },
];

function EventTypeModal({ event, onClose, onSave }) {
  const [step, setStep] = useState(event ? 'form' : 'select');
  const [selectedType, setSelectedType] = useState('One-on-one');
  const [name, setName] = useState(event?.name || '');
  const [slug, setSlug] = useState(event?.slug || '');
  const [duration, setDuration] = useState(event?.duration?.toString() || '30');
  const [description, setDescription] = useState(event?.description || '');
  const [color, setColor] = useState(event?.color || '#0069ff');
  const [customQuestions, setCustomQuestions] = useState(event?.customQuestions || []);
  const [saving, setSaving] = useState(false);

  function handleNameChange(value) {
    setName(value);
    if (!event) {
      setSlug(value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
    }
  }

  function handleSelectType(typeName) {
    setSelectedType(typeName);
    setStep('form');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    
    setSaving(true);
    try {
      const url = event 
        ? buildApiUrl(`/event-types/${event.id}`)
        : buildApiUrl('/event-types');
      
      const res = await fetch(url, {
        method: event ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          duration: parseInt(duration),
          description,
          color,
          customQuestions,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to save');
        return;
      }

      onSave();
    } catch (error) {
      alert('Failed to save event type');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'select') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content event-type-selector" onClick={(e) => e.stopPropagation()}>
          <h2 className="modal-title" style={{ marginBottom: '4px' }}>Event type</h2>
          <div className="ets-list">
            {EVENT_TYPE_CATEGORIES.map((cat) => (
              <button
                key={cat.name}
                className={`ets-item${cat.highlight ? ' ets-highlight' : ''}`}
                onClick={() => handleSelectType(cat.name)}
              >
                <div className="ets-item-content">
                  <div className="ets-name">{cat.name}</div>
                  <div className="ets-desc">{cat.desc}</div>
                  <div className="ets-sub">{cat.sub}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="ets-divider" />
          <div className="ets-more-label">More ways to meet</div>
          <div className="ets-list">
            {MORE_WAYS.map((item) => (
              <button
                key={item.name}
                className="ets-item"
                onClick={() => handleSelectType(item.name)}
              >
                <div className="ets-item-content">
                  <div className="ets-name">{item.name}</div>
                  <div className="ets-sub">{item.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {event ? 'Edit Event Type' : `New ${selectedType}`}
        </h2>
        {!event && (
          <button
            className="ets-back-btn"
            onClick={() => setStep('select')}
          >
            ← Back to event types
          </button>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Event name *</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. 30 Minute Meeting"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">URL slug</label>
            <input
              type="text"
              className="form-input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. 30-minute-meeting"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Duration</label>
            <select className="form-select" value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
              <option value="90">90 minutes</option>
              <option value="120">120 minutes</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of this meeting type"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Custom Questions</label>
            {customQuestions.map((q, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-start' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Question text (e.g. LinkedIn URL)"
                  value={q.question}
                  onChange={(e) => {
                    const newQ = [...customQuestions];
                    newQ[i].question = e.target.value;
                    setCustomQuestions(newQ);
                  }}
                  required
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', marginTop: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={q.isRequired}
                    onChange={(e) => {
                      const newQ = [...customQuestions];
                      newQ[i].isRequired = e.target.checked;
                      setCustomQuestions(newQ);
                    }}
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const newQ = [...customQuestions];
                    newQ.splice(i, 1);
                    setCustomQuestions(newQ);
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--danger-color, #e74c3c)', cursor: 'pointer', marginTop: '8px', padding: '0 4px' }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '14px', width: 'fit-content' }}
              onClick={() => {
                setCustomQuestions([...customQuestions, { question: '', isRequired: false, type: 'text' }]);
              }}
            >
              + Add Question
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Color</label>
            <div className="color-options">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-option ${color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Saving...' : event ? 'Save changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
