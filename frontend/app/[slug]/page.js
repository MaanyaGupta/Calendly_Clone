'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import './booking.css';
import { buildApiUrl } from '../../lib/api';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const FALLBACK_TIME_ZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
];
const TIME_ZONE_OPTIONS = getAvailableTimeZones();

function formatDateHeader(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${days[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
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

function formatTimeRange(startISO, endISO, timeZone) {
  return `${formatTime(startISO, timeZone)} - ${formatTime(endISO, timeZone)}`;
}

function formatDateFull(dateInput, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(dateInput));
}

function getResolvedTimeZone() {
  if (typeof Intl === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function getTimeZoneLabel(timeZone) {
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

function getAvailableTimeZones() {
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    return Intl.supportedValuesOf('timeZone');
  }

  return FALLBACK_TIME_ZONES;
}

function parseGuestEmails(guests) {
  return guests
    .split(',')
    .map((guest) => guest.trim())
    .filter(Boolean);
}

function formatDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getTodayDateKey(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function getDatePartsInTimeZone(timeZone) {
  const dateKey = getTodayDateKey(timeZone);
  const [year, month, day] = dateKey.split('-').map(Number);

  return {
    year,
    month: month - 1,
    day,
    dateKey,
  };
}

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug;
  const initialTimeZone = getResolvedTimeZone();
  const initialToday = getDatePartsInTimeZone(initialTimeZone);

  const [eventType, setEventType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Step management: 'select' | 'form' | 'confirmed'
  const [step, setStep] = useState('select');

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(initialToday.month);
  const [currentYear, setCurrentYear] = useState(initialToday.year);
  const [selectedDate, setSelectedDate] = useState(null);

  // Slots
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [availableDates, setAvailableDates] = useState(new Set());
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Form
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formGuests, setFormGuests] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [showGuests, setShowGuests] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customAnswers, setCustomAnswers] = useState({});

  // Confirmation data
  const [confirmedMeeting, setConfirmedMeeting] = useState(null);
  const [selectedTimeZone, setSelectedTimeZone] = useState(initialTimeZone);
  const slotsRequestRef = useRef(0);
  const monthAvailabilityRequestRef = useRef(0);

  const timeZoneLabel = getTimeZoneLabel(selectedTimeZone);
  const timeZoneTime = formatTime(new Date(), selectedTimeZone);
  const guestEmails = parseGuestEmails(formGuests);
  const todayInfo = getDatePartsInTimeZone(selectedTimeZone);
  const todayDateKey = todayInfo.dateKey;

  // Fetch event type
  useEffect(() => {
    if (!slug) return;
    async function fetchEvent() {
      try {
        const res = await fetch(buildApiUrl(`/event-types/slug/${slug}`));
        if (!res.ok) throw new Error('Event type not found');
        const data = await res.json();
        setEventType(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchEvent();
  }, [slug]);

  // Fetch slots when date changes
  const fetchSlots = useCallback(async (dateStr, timeZone = selectedTimeZone) => {
    const requestId = ++slotsRequestRef.current;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);
    try {
      const params = new URLSearchParams({
        date: dateStr,
        timezone: timeZone,
      });
      const res = await fetch(`${buildApiUrl(`/booking/${slug}/slots`)}?${params.toString()}`);
      const data = await res.json();
      if (requestId === slotsRequestRef.current) {
        setSlots(data);
      }
    } catch (err) {
      if (requestId === slotsRequestRef.current) {
        console.error('Failed to fetch slots:', err);
      }
    } finally {
      if (requestId === slotsRequestRef.current) {
        setSlotsLoading(false);
      }
    }
  }, [selectedTimeZone, slug]);

  const fetchMonthAvailability = useCallback(async (year, month, timeZone = selectedTimeZone) => {
    const requestId = ++monthAvailabilityRequestRef.current;
    setCalendarLoading(true);
    setAvailableDates(new Set());
    try {
      const params = new URLSearchParams({
        month: `${year}-${String(month + 1).padStart(2, '0')}`,
        timezone: timeZone,
      });
      const res = await fetch(`${buildApiUrl(`/booking/${slug}/availability`)}?${params.toString()}`);
      const data = await res.json();
      if (requestId === monthAvailabilityRequestRef.current) {
        setAvailableDates(new Set(Array.isArray(data) ? data : []));
      }
    } catch (err) {
      if (requestId === monthAvailabilityRequestRef.current) {
        console.error('Failed to fetch month availability:', err);
        setAvailableDates(new Set());
      }
    } finally {
      if (requestId === monthAvailabilityRequestRef.current) {
        setCalendarLoading(false);
      }
    }
  }, [selectedTimeZone, slug]);

  useEffect(() => {
    if (!slug) return;
    fetchMonthAvailability(currentYear, currentMonth);
  }, [currentMonth, currentYear, fetchMonthAvailability, slug]);

  useEffect(() => {
    if (!selectedDate) return;

    const selectedDateKey = formatDateKey(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate()
    );

    if (selectedDate.getFullYear() === currentYear
      && selectedDate.getMonth() === currentMonth
      && !availableDates.has(selectedDateKey)) {
      setSelectedDate(null);
      setSelectedSlot(null);
      setSlots([]);
    }
  }, [availableDates, currentMonth, currentYear, selectedDate]);

  function handleDateSelect(day) {
    const date = new Date(currentYear, currentMonth, day);
    setSelectedDate(date);
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    fetchSlots(dateStr);
  }

  function handleSlotSelect(slot) {
    setSelectedSlot(slot);
  }

  function handleNext() {
    if (selectedSlot) {
      setStep('form');
    }
  }

  function handleBackToSelect() {
    setStep('select');
  }

  function handleTimeZoneChange(e) {
    const nextTimeZone = e.target.value;
    setSelectedTimeZone(nextTimeZone);
    setSelectedSlot(null);

    if (selectedDate) {
      const dateStr = formatDateKey(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate()
      );
      fetchSlots(dateStr, nextTimeZone);
    }
  }

  async function handleSubmitBooking(e) {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !selectedSlot) return;

    if (eventType.customQuestions?.length > 0) {
      for (const q of eventType.customQuestions) {
        if (q.isRequired && !customAnswers[q.question]?.trim()) {
          alert(`Please answer the required question: "${q.question}"`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(buildApiUrl(`/booking/${slug}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteeName: formName,
          inviteeEmail: formEmail,
          inviteeTimezone: selectedTimeZone,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          notes: formNotes,
          guests: formGuests,
          customAnswers,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to schedule event');
        return;
      }

      const meeting = await res.json();
      setConfirmedMeeting(meeting);
      setStep('confirmed');
    } catch (err) {
      alert('Failed to schedule event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Calendar helpers
  function getDaysInMonth(month, year) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(month, year) {
    const d = new Date(year, month, 1).getDay();
    // Convert from Sunday=0 to Monday=0
    return d === 0 ? 6 : d - 1;
  }

  function canGoPrev() {
    return currentYear > todayInfo.year ||
      (currentYear === todayInfo.year && currentMonth > todayInfo.month);
  }

  function handlePrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function handleNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  function isToday(day) {
    return formatDateKey(currentYear, currentMonth, day) === todayDateKey;
  }

  function isPast(day) {
    return formatDateKey(currentYear, currentMonth, day) < todayDateKey;
  }

  function isSelected(day) {
    if (!selectedDate) return false;
    return day === selectedDate.getDate() &&
      currentMonth === selectedDate.getMonth() &&
      currentYear === selectedDate.getFullYear();
  }

  // Render calendar grid
  function renderCalendar() {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const cells = [];

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="calendar-day" />);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = formatDateKey(currentYear, currentMonth, day);
      const past = isPast(day);
      const bookable = !past && availableDates.has(dateKey);
      const todayClass = isToday(day) ? 'today' : '';
      const selectedClass = isSelected(day) ? 'selected' : '';
      const availableClass = bookable ? 'available' : '';
      const disabled = past || calendarLoading || !bookable;

      cells.push(
        <div key={day} className="calendar-day">
          <button
            className={`calendar-day-btn ${todayClass} ${selectedClass} ${availableClass}`}
            disabled={disabled}
            onClick={() => handleDateSelect(day)}
          >
            {day}
          </button>
        </div>
      );
    }

    return cells;
  }

  // --- Loading / Error states ---
  if (loading) {
    return (
      <div className="booking-page">
        <div className="booking-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div className="loading">
            <div className="loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !eventType) {
    return (
      <div className="booking-page">
        <div className="booking-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '60px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4 }}>📅</div>
            <h2 style={{ marginBottom: '8px' }}>Event Not Found</h2>
            <p style={{ color: 'var(--text-secondary)' }}>This event type does not exist or has been removed.</p>
          </div>
        </div>
      </div>
    );
  }

  // --- Confirmation Step ---
  if (step === 'confirmed') {
    return (
      <div className="confirmation-page">
        <div className="confirmation-card">
          <div className="confirmation-check">✓</div>
          <h2 className="confirmation-title">You are scheduled</h2>
          <p className="confirmation-subtitle">
            A calendar invitation has been sent to your email address.
          </p>
          <div className="confirmation-details">
            <div className="confirmation-detail-row">
              <span className="detail-icon">📅</span>
              <div>
                <div className="confirmation-detail-label">{eventType.name}</div>
              </div>
            </div>
            <div className="confirmation-detail-row">
              <span className="detail-icon">🕐</span>
              <div>
                {selectedSlot && (
                  <>
                    <div>{formatTimeRange(selectedSlot.startTime, selectedSlot.endTime, selectedTimeZone)}</div>
                    <div>{formatDateFull(selectedSlot.startTime, selectedTimeZone)}</div>
                  </>
                )}
              </div>
            </div>
            <div className="confirmation-detail-row">
              <span className="detail-icon">🌐</span>
              <div>{timeZoneLabel}</div>
            </div>
            <div className="confirmation-detail-row">
              <span className="detail-icon">👤</span>
              <div>{formName} ({formEmail})</div>
            </div>
            {guestEmails.length > 0 && (
              <div className="confirmation-detail-row">
                <span className="detail-icon" aria-hidden="true">&#128101;</span>
                <div>{guestEmails.join(', ')}</div>
              </div>
            )}
            {confirmedMeeting?.customAnswers && Object.entries(confirmedMeeting.customAnswers).length > 0 && (
              <div className="confirmation-detail-row" style={{ alignItems: 'flex-start' }}>
                <span className="detail-icon">💬</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(confirmedMeeting.customAnswers).map(([q, a]) => (
                    <div key={q}>
                      <div className="confirmation-detail-label" style={{ fontWeight: 600 }}>{q}</div>
                      <div>{String(a)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="confirmation-actions">
            <button
              className="confirmation-btn confirmation-btn-primary"
              onClick={() => router.push('/')}
            >
              Go to Dashboard
            </button>
            <button
              className="confirmation-btn confirmation-btn-secondary"
              onClick={() => {
                setStep('select');
                setSelectedDate(null);
                setSelectedSlot(null);
                setSlots([]);
                setFormName('');
                setFormEmail('');
                setFormGuests('');
                setFormNotes('');
                setShowGuests(false);
                setCustomAnswers({});
              }}
            >
              Schedule Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Form Step ---
  if (step === 'form') {
    return (
      <div className="booking-page">
        <div className="booking-container">
          {/* Powered badge */}
          <div className="powered-badge">
            <div className="powered-badge-inner">Powered by Calendly</div>
          </div>

          {/* Left Panel — Event Info with selected time */}
          <div className="booking-left">
            <button className="booking-back-btn" onClick={handleBackToSelect}>
              ←
            </button>
            <div className="booking-host-name">{eventType.user?.name || 'Host'}</div>
            <h1 className="booking-event-name">{eventType.name}</h1>
            <div className="booking-detail">
              <span className="booking-detail-icon">🕐</span>
              <span>{eventType.duration} min</span>
            </div>
            {eventType.description && (
              <div className="booking-detail">
                <span className="booking-detail-icon">📍</span>
                <span>{eventType.description}</span>
              </div>
            )}
            {selectedSlot && (
              <>
                <div className="booking-detail">
                  <span className="booking-detail-icon">📅</span>
                  <span>{formatTimeRange(selectedSlot.startTime, selectedSlot.endTime, selectedTimeZone)}, {formatDateFull(selectedSlot.startTime, selectedTimeZone)}</span>
                </div>
                <div className="booking-detail">
                  <span className="booking-detail-icon">🌐</span>
                  <span>{timeZoneLabel}</span>
                </div>
              </>
            )}
          </div>

          {/* Right Panel — Booking Form */}
          <div className="booking-form-container">
            <h2 className="booking-form-header">Enter Details</h2>
            <form onSubmit={handleSubmitBooking}>
              <div className="booking-form-group">
                <label className="booking-form-label">
                  Name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className="booking-form-input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="booking-form-group">
                <label className="booking-form-label">
                  Email <span className="required">*</span>
                </label>
                <input
                  type="email"
                  className="booking-form-input"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                />
              </div>

              {!showGuests ? (
                <button
                  type="button"
                  className="add-guests-btn"
                  onClick={() => setShowGuests(true)}
                >
                  Add Guests
                </button>
              ) : (
                <div className="booking-form-group">
                  <label className="booking-form-label">Guest Email(s)</label>
                  <input
                    type="text"
                    className="booking-form-input"
                    value={formGuests}
                    onChange={(e) => setFormGuests(e.target.value)}
                    placeholder="Separate multiple emails with commas"
                  />
                </div>
              )}

              {eventType.customQuestions?.map((q, i) => (
                <div key={i} className="booking-form-group" style={{ marginTop: '16px' }}>
                  <label className="booking-form-label">
                    {q.question} {q.isRequired && <span className="required">*</span>}
                  </label>
                  <input
                    type="text"
                    className="booking-form-input"
                    value={customAnswers[q.question] || ''}
                    onChange={(e) => setCustomAnswers({ ...customAnswers, [q.question]: e.target.value })}
                    required={q.isRequired}
                  />
                </div>
              ))}

              <div className="booking-form-group" style={{ marginTop: '16px' }}>
                <label className="booking-form-label" style={{ fontWeight: 400 }}>
                  Please share anything that will help prepare for our meeting.
                </label>
                <textarea
                  className="booking-form-textarea"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>

              <div className="booking-form-terms">
                By proceeding, you confirm that you have read and agree to{' '}
                <a href="#">Calendly&apos;s Terms of Use</a> and{' '}
                <a href="#">Privacy Notice</a>.
              </div>

              <button
                type="submit"
                className="booking-schedule-btn"
                disabled={submitting || !formName.trim() || !formEmail.trim()}
              >
                {submitting ? 'Scheduling...' : 'Schedule Event'}
              </button>
            </form>
          </div>
        </div>

        <div className="booking-footer-links">
          <a href="#">Cookie settings</a>
          <a href="#">Privacy Policy</a>
        </div>
      </div>
    );
  }

  // --- Select Date & Time Step (default) ---
  return (
    <div className="booking-page">
      <div className="booking-container">
        {/* Powered badge */}
        <div className="powered-badge">
          <div className="powered-badge-inner">Powered by Calendly</div>
        </div>

        {/* Left Panel — Event Info */}
        <div className="booking-left">
          <div className="booking-host-name">{eventType.user?.name || 'Host'}</div>
          <h1 className="booking-event-name">{eventType.name}</h1>
          <div className="booking-detail">
            <span className="booking-detail-icon">🕐</span>
            <span>{eventType.duration} min</span>
          </div>
          {eventType.description && (
            <div className="booking-detail">
              <span className="booking-detail-icon">📍</span>
              <span>{eventType.description}</span>
            </div>
          )}
          <div className="booking-footer">
            <a href="#">Cookie settings</a>
            <a href="#">Privacy Policy</a>
          </div>
        </div>

        {/* Right Panel — Calendar + Slots */}
        <div className="booking-right">
          <h2 className="booking-right-header">Select a Date &amp; Time</h2>

          <div className="booking-calendar-slots">
            {/* Calendar */}
            <div className="booking-calendar-section">
              <div className="calendar-nav">
                <button
                  className="calendar-nav-btn"
                  onClick={handlePrevMonth}
                  disabled={!canGoPrev()}
                >
                  ‹
                </button>
                <span className="calendar-month-label">
                  {MONTHS[currentMonth]} {currentYear}
                </span>
                <button className="calendar-nav-btn" onClick={handleNextMonth}>
                  ›
                </button>
              </div>

              <div className="calendar-grid">
                {DAYS.map((d) => (
                  <div key={d} className="calendar-day-header">{d}</div>
                ))}
                {renderCalendar()}
              </div>

              <div className="booking-timezone">
                <div className="booking-timezone-label">Time zone</div>
                <div className="booking-timezone-value booking-timezone-picker">
                  <span className="booking-timezone-icon">🌐</span>
                  <select
                    className="booking-timezone-select"
                    value={selectedTimeZone}
                    onChange={handleTimeZoneChange}
                  >
                    {TIME_ZONE_OPTIONS.map((timeZone) => (
                      <option key={timeZone} value={timeZone}>
                        {timeZone}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="booking-timezone-current">
                  <span>{timeZoneLabel} ({timeZoneTime})</span>
                </div>
              </div>
            </div>

            {/* Time Slots */}
            {selectedDate && (
              <div className="booking-slots-section">
                <div className="slots-date-header">
                  {formatDateHeader(selectedDate)}
                </div>

                {slotsLoading ? (
                  <div className="loading" style={{ padding: '20px 0' }}>
                    <div className="loading-spinner" />
                  </div>
                ) : slots.length === 0 ? (
                  <div className="no-slots">No available times</div>
                ) : (
                  slots.map((slot, idx) => (
                    <div key={idx} className="slot-wrapper">
                      {selectedSlot?.startTime === slot.startTime ? (
                        <div className="slot-selected-row">
                          <button className="slot-btn">{formatTime(slot.startTime, selectedTimeZone)}</button>
                          <button className="slot-confirm-btn" onClick={handleNext}>
                            Next
                          </button>
                        </div>
                      ) : (
                        <button
                          className="slot-btn"
                          onClick={() => handleSlotSelect(slot)}
                        >
                          {formatTime(slot.startTime, selectedTimeZone)}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
