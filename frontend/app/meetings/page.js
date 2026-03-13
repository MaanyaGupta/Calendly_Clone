'use client';

import { useState, useEffect, useCallback } from 'react';
import './meetings.css';
import { buildApiUrl } from '../../lib/api';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDateTime(isoStr, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(isoStr)).replace(',', ' ·');
}

function formatTimeRange(startISO, endISO, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  });

  const fmt = (isoStr) => formatter.format(new Date(isoStr))
    .replace(' AM', 'am')
    .replace(' PM', 'pm');

  return `${fmt(startISO)} - ${fmt(endISO)}`;
}

function formatTime(dateInput, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  })
    .format(new Date(dateInput))
    .replace(' AM', 'am')
    .replace(' PM', 'pm');
}

function getTimeZoneLabel(timeZone) {
  if (!timeZone) return 'Local time';

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'long',
    }).formatToParts(new Date());

    return parts.find((part) => part.type === 'timeZoneName')?.value || timeZone;
  } catch {
    return timeZone;
  }
}

function parseGuestEmails(guests) {
  if (typeof guests !== 'string') {
    return [];
  }

  return guests
    .split(',')
    .map((guest) => guest.trim())
    .filter(Boolean);
}

function formatDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDatePartsInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parseInt(parts.find((p) => p.type === 'year')?.value);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value) - 1;
  const day = parseInt(parts.find((p) => p.type === 'day')?.value);
  const dateKey = formatDateKey(year, month, day);

  return { year, month, day, dateKey };
}

function formatDateHeader(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${days[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

// ─── Reschedule Modal ─────────────────────────────────────────────────
function RescheduleModal({ meeting, onClose, onSuccess }) {
  const slug = meeting.eventType?.slug;
  const timeZone = meeting.inviteeTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const todayInfo = getDatePartsInTimeZone(timeZone);

  const [currentMonth, setCurrentMonth] = useState(todayInfo.month);
  const [currentYear, setCurrentYear] = useState(todayInfo.year);
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableDates, setAvailableDates] = useState(new Set());
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Fetch month availability
  useEffect(() => {
    if (!slug) return;
    setCalendarLoading(true);
    setAvailableDates(new Set());
    const params = new URLSearchParams({
      month: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
      timezone: timeZone,
    });
    fetch(`${buildApiUrl(`/booking/${slug}/availability`)}?${params}`)
      .then((r) => r.json())
      .then((data) => setAvailableDates(new Set(Array.isArray(data) ? data : [])))
      .catch(() => setAvailableDates(new Set()))
      .finally(() => setCalendarLoading(false));
  }, [slug, currentYear, currentMonth, timeZone]);

  function handleDateSelect(day) {
    const date = new Date(currentYear, currentMonth, day);
    setSelectedDate(date);
    setSelectedSlot(null);
    setSlotsLoading(true);
    setSlots([]);
    const dateStr = formatDateKey(currentYear, currentMonth, day);
    const params = new URLSearchParams({ date: dateStr, timezone: timeZone });
    fetch(`${buildApiUrl(`/booking/${slug}/slots`)}?${params}`)
      .then((r) => r.json())
      .then((data) => setSlots(data))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }

  async function handleConfirmReschedule() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl(`/meetings/${meeting.id}/reschedule`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newStartTime: selectedSlot.startTime,
          newEndTime: selectedSlot.endTime,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to reschedule');
        return;
      }
      onSuccess();
    } catch {
      setError('Failed to reschedule. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Calendar helpers
  function getDaysInMonth(m, y) {
    return new Date(y, m + 1, 0).getDate();
  }
  function getFirstDayOfMonth(m, y) {
    const d = new Date(y, m, 1).getDay();
    return d === 0 ? 6 : d - 1;
  }
  function canGoPrev() {
    return currentYear > todayInfo.year || (currentYear === todayInfo.year && currentMonth > todayInfo.month);
  }
  function handlePrevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  }
  function handleNextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  }

  function renderCalendar() {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`e-${i}`} className="rs-cal-day" />);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = formatDateKey(currentYear, currentMonth, day);
      const past = dateKey < todayInfo.dateKey;
      const bookable = !past && availableDates.has(dateKey);
      const isSelected = selectedDate && day === selectedDate.getDate() && currentMonth === selectedDate.getMonth() && currentYear === selectedDate.getFullYear();
      const isToday = dateKey === todayInfo.dateKey;
      cells.push(
        <div key={day} className="rs-cal-day">
          <button
            className={`rs-cal-day-btn${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${bookable ? ' available' : ''}`}
            disabled={past || calendarLoading || !bookable}
            onClick={() => handleDateSelect(day)}
          >
            {day}
          </button>
        </div>
      );
    }
    return cells;
  }

  if (!slug) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content rs-modal" onClick={(e) => e.stopPropagation()}>
          <h2 className="modal-title">Cannot Reschedule</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
            The original event type has been deleted, so this meeting cannot be rescheduled.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content rs-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Reschedule Meeting</h2>
        <p className="rs-current-time">
          Current time: <strong>{formatTimeRange(meeting.startTime, meeting.endTime, timeZone)}</strong>
        </p>

        {error && <div className="rs-error">{error}</div>}

        <div className="rs-body">
          {/* Calendar */}
          <div className="rs-calendar">
            <div className="rs-cal-nav">
              <button className="rs-cal-nav-btn" onClick={handlePrevMonth} disabled={!canGoPrev()}>‹</button>
              <span className="rs-cal-month">{MONTHS[currentMonth]} {currentYear}</span>
              <button className="rs-cal-nav-btn" onClick={handleNextMonth}>›</button>
            </div>
            <div className="rs-cal-grid">
              {DAYS.map((d) => <div key={d} className="rs-cal-header">{d}</div>)}
              {renderCalendar()}
            </div>
          </div>

          {/* Time slots */}
          {selectedDate && (
            <div className="rs-slots">
              <div className="rs-slots-header">{formatDateHeader(selectedDate)}</div>
              {slotsLoading ? (
                <div className="loading" style={{ padding: '20px 0' }}>
                  <div className="loading-spinner" />
                </div>
              ) : slots.length === 0 ? (
                <div className="rs-no-slots">No available times</div>
              ) : (
                <div className="rs-slots-list">
                  {slots.map((slot, idx) => (
                    <button
                      key={idx}
                      className={`rs-slot-btn${selectedSlot?.startTime === slot.startTime ? ' selected' : ''}`}
                      onClick={() => setSelectedSlot(slot)}
                    >
                      {formatTime(slot.startTime, timeZone)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!selectedSlot || submitting}
            onClick={handleConfirmReschedule}
          >
            {submitting ? 'Rescheduling...' : 'Confirm Reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Meetings Page ─────────────────────────────────────────────────────
export default function MeetingsPage() {
  const [tab, setTab] = useState('upcoming');
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${buildApiUrl('/meetings')}?type=${tab}`);
      const data = await res.json();
      setMeetings(data);
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  async function handleCancel(id) {
    if (!confirm('Are you sure you want to cancel this meeting?')) return;
    setCancellingId(id);
    try {
      await fetch(buildApiUrl(`/meetings/${id}/cancel`), { method: 'PATCH' });
      fetchMeetings();
    } catch (err) {
      alert('Failed to cancel meeting');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <main className="main-content">
      <div className="meetings-header">
        <h1 className="meetings-title">Scheduled Events</h1>
      </div>

      <div className="meetings-tabs">
        <button
          className={`meetings-tab ${tab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Upcoming
        </button>
        <button
          className={`meetings-tab ${tab === 'past' ? 'active' : ''}`}
          onClick={() => setTab('past')}
        >
          Past
        </button>
      </div>

      <div className="meetings-list">
        {loading ? (
          <div className="loading">
            <div className="loading-spinner" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="meetings-empty">
            <div className="meetings-empty-icon">📅</div>
            <h3>No {tab} meetings</h3>
            <p>
              {tab === 'upcoming'
                ? 'When someone books a meeting with you, it will appear here.'
                : 'Your past meetings will appear here.'}
            </p>
          </div>
        ) : (
          meetings.map((meeting) => {
            const bookedTimeZone = meeting.inviteeTimezone || null;
            const eventName = meeting.eventType?.name || meeting.eventTypeName || 'Meeting';
            const eventDuration = meeting.eventType?.duration || meeting.eventTypeDuration || 30;
            const eventColor = meeting.eventType?.color || meeting.eventTypeColor || '#0069ff';
            const guestEmails = parseGuestEmails(meeting.guestEmails);

            return (
              <div
                key={meeting.id}
                className="meeting-card"
                style={{
                  borderLeftColor: eventColor,
                }}
              >
                <div className="meeting-card-top">
                  <div className="meeting-date">
                    {formatDateTime(meeting.startTime, bookedTimeZone)}
                  </div>
                  <div className="meeting-status-row">
                    <span className={`meeting-status-badge ${meeting.status}`}>
                      {meeting.status === 'scheduled' ? '● Scheduled' : '○ Cancelled'}
                    </span>
                  </div>
                </div>

                <div className="meeting-card-body">
                  <div className="meeting-info">
                    <h3 className="meeting-event-name">
                      {eventName}
                    </h3>
                    <div className="meeting-meta">
                      <span className="meeting-meta-item">
                        <span className="meeting-meta-icon">👤</span>
                        {meeting.inviteeName}
                      </span>
                      <span className="meeting-meta-item">
                        <span className="meeting-meta-icon">✉️</span>
                        {meeting.inviteeEmail}
                      </span>
                      <span className="meeting-meta-item">
                        <span className="meeting-meta-icon">🕐</span>
                        {formatTimeRange(meeting.startTime, meeting.endTime, bookedTimeZone)}
                      </span>
                      <span className="meeting-meta-item">
                        <span className="meeting-meta-icon">🌐</span>
                        {getTimeZoneLabel(bookedTimeZone)}
                      </span>
                      <span className="meeting-meta-item">
                        <span className="meeting-meta-icon">⏱️</span>
                        {eventDuration} min
                      </span>
                      {guestEmails.length > 0 && (
                        <span className="meeting-meta-item meeting-meta-item-guests">
                          <span className="meeting-meta-icon" aria-hidden="true">&#128101;</span>
                          {guestEmails.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {meeting.status === 'scheduled' && tab === 'upcoming' && (
                    <div className="meeting-actions">
                      <button
                        className="meeting-reschedule-btn"
                        onClick={() => setRescheduleTarget(meeting)}
                      >
                        Reschedule
                      </button>
                      <button
                        className="meeting-cancel-btn"
                        onClick={() => handleCancel(meeting.id)}
                        disabled={cancellingId === meeting.id}
                      >
                        {cancellingId === meeting.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </div>
                  )}
                </div>

                {meeting.cancelReason && (
                  <div className="meeting-cancel-reason">
                    <strong>Cancel reason:</strong> {meeting.cancelReason}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {rescheduleTarget && (
        <RescheduleModal
          meeting={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onSuccess={() => {
            setRescheduleTarget(null);
            fetchMeetings();
          }}
        />
      )}
    </main>
  );
}
