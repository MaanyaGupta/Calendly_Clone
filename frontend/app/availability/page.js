'use client';

import { useState, useEffect, useCallback } from 'react';
import './availability.css';
import { buildApiUrl } from '../../lib/api';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_HEADERS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DEFAULT_OVERRIDE_FORM = {
  startTime: '09:00',
  endTime: '17:00',
  isUnavailable: false,
};

const TIMEZONES = [
  'Pacific/Midway', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
  'America/Denver', 'America/Chicago', 'America/New_York', 'America/Caracas',
  'America/Halifax', 'America/St_Johns', 'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo', 'Atlantic/Azores', 'Europe/London', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Moscow', 'Asia/Dubai', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Shanghai',
  'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    TIME_OPTIONS.push(`${hh}:${mm}`);
  }
}

function formatTime12(value) {
  if (!value) return '';

  const [hh, mm] = value.split(':');
  let hour = parseInt(hh, 10);
  const meridiem = hour >= 12 ? 'pm' : 'am';
  hour = hour % 12 || 12;

  return `${hour}:${mm}${meridiem}`;
}

function normalizeDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function formatDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = normalizeDateKey(dateKey).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isValidTimeRange(startTime, endTime) {
  return Boolean(startTime) && Boolean(endTime) && startTime < endTime;
}

export default function AvailabilityPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [schedule, setSchedule] = useState(null);
  const [rules, setRules] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('schedules');
  const [viewMode, setViewMode] = useState('list');
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [scheduleCalendarMonth, setScheduleCalendarMonth] = useState(today.getMonth());
  const [scheduleCalendarYear, setScheduleCalendarYear] = useState(today.getFullYear());
  const [overrideForm, setOverrideForm] = useState(DEFAULT_OVERRIDE_FORM);
  const [overrideSavingIds, setOverrideSavingIds] = useState([]);
  const [toast, setToast] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [eventTypesCount, setEventTypesCount] = useState(0);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    fetchAvailability();
    fetchEventTypesCount();
  }, []);

  async function fetchEventTypesCount() {
    try {
      const res = await fetch(buildApiUrl('/event-types'));
      const data = await res.json();
      setEventTypesCount(data.length);
    } catch (error) {
      console.error('Error fetching event types:', error);
    }
  }

  async function fetchAvailability() {
    try {
      const res = await fetch(buildApiUrl('/availability'));
      const data = await res.json();

      if (data.length > 0) {
        const sched = data[0];
        setSchedule(sched);
        setTimezone(sched.timezone);

        const grouped = Array.from({ length: 7 }, () => []);
        sched.rules.forEach((rule) => {
          grouped[rule.dayOfWeek].push({
            startTime: rule.startTime,
            endTime: rule.endTime,
            isAvailable: rule.isAvailable,
          });
        });

        const rulesState = grouped.map((slots, day) => {
          if (slots.length === 0) {
            return { day, active: false, slots: [{ startTime: '09:00', endTime: '17:00' }] };
          }

          return {
            day,
            active: slots.some((slot) => slot.isAvailable),
            slots: slots.map((slot) => ({
              startTime: slot.startTime,
              endTime: slot.endTime,
            })),
          };
        });

        setRules(rulesState);
        setOverrides(
          (sched.dateOverrides || []).map((override) => ({
            ...override,
            date: normalizeDateKey(override.date),
          }))
        );
      }
    } catch (error) {
      console.error('Error fetching availability:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!schedule) return;

    setSaving(true);
    try {
      const allRules = [];
      rules.forEach((dayRule) => {
        if (dayRule.active) {
          dayRule.slots.forEach((slot) => {
            allRules.push({
              dayOfWeek: dayRule.day,
              startTime: slot.startTime,
              endTime: slot.endTime,
              isAvailable: true,
            });
          });
        }
      });

      await fetch(buildApiUrl(`/availability/${schedule.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone,
          rules: allRules,
        }),
      });

      setDirty(false);
      showToast('Availability saved successfully!');
    } catch (error) {
      console.error('Error saving availability:', error);
      showToast('Failed to save availability', 'error');
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(dayIndex) {
    setRules((prev) =>
      prev.map((rule) =>
        rule.day === dayIndex
          ? { ...rule, active: !rule.active }
          : rule
      )
    );
    setDirty(true);
  }

  function updateSlotTime(dayIndex, slotIndex, field, value) {
    setRules((prev) =>
      prev.map((rule) =>
        rule.day === dayIndex
          ? {
              ...rule,
              slots: rule.slots.map((slot, index) =>
                index === slotIndex ? { ...slot, [field]: value } : slot
              ),
            }
          : rule
      )
    );
    setDirty(true);
  }

  function addSlot(dayIndex) {
    setRules((prev) =>
      prev.map((rule) =>
        rule.day === dayIndex
          ? {
              ...rule,
              active: true,
              slots: [...rule.slots, { startTime: '09:00', endTime: '17:00' }],
            }
          : rule
      )
    );
    setDirty(true);
  }

  function removeSlot(dayIndex, slotIndex) {
    setRules((prev) =>
      prev.map((rule) =>
        rule.day === dayIndex
          ? {
              ...rule,
              slots: rule.slots.length > 1 ? rule.slots.filter((_, index) => index !== slotIndex) : rule.slots,
              active: rule.slots.length > 1 ? rule.active : false,
            }
          : rule
      )
    );
    setDirty(true);
  }

  function copyDay(dayIndex) {
    const source = rules[dayIndex];
    setRules((prev) =>
      prev.map((rule) =>
        rule.day !== dayIndex
          ? {
              ...rule,
              active: source.active,
              slots: source.slots.map((slot) => ({ ...slot })),
            }
          : rule
      )
    );
    setDirty(true);
    showToast(`Copied ${DAY_NAMES[dayIndex]} hours to all days`);
  }

  function openOverrideModal() {
    setSelectedDates([]);
    setOverrideForm(DEFAULT_OVERRIDE_FORM);
    setCalendarMonth(today.getMonth());
    setCalendarYear(today.getFullYear());
    setShowCalendarModal(true);
  }

  async function handleAddOverrides() {
    if (!schedule || selectedDates.length === 0) return;

    if (!overrideForm.isUnavailable && !isValidTimeRange(overrideForm.startTime, overrideForm.endTime)) {
      showToast('End time must be after start time', 'error');
      return;
    }

    try {
      for (const date of selectedDates) {
        const existingOverride = overrides.find((override) => override.date === date);
        const endpoint = existingOverride
          ? `/availability/overrides/${existingOverride.id}`
          : '/availability/overrides';
        const method = existingOverride ? 'PUT' : 'POST';

        await fetch(buildApiUrl(endpoint), {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduleId: schedule.id,
            date,
            startTime: overrideForm.isUnavailable ? null : overrideForm.startTime,
            endTime: overrideForm.isUnavailable ? null : overrideForm.endTime,
            isUnavailable: overrideForm.isUnavailable,
          }),
        });
      }

      setShowCalendarModal(false);
      setSelectedDates([]);
      setOverrideForm(DEFAULT_OVERRIDE_FORM);
      await fetchAvailability();
      showToast('Date-specific hours added!');
    } catch (error) {
      console.error('Error adding overrides:', error);
      showToast('Failed to add overrides', 'error');
    }
  }

  function updateOverrideField(overrideId, field, value) {
    setOverrides((prev) =>
      prev.map((override) =>
        override.id === overrideId ? { ...override, [field]: value } : override
      )
    );
  }

  async function handleUpdateOverride(overrideId) {
    const override = overrides.find((item) => item.id === overrideId);
    if (!override) return;

    if (!override.isUnavailable && !isValidTimeRange(override.startTime, override.endTime)) {
      showToast('End time must be after start time', 'error');
      return;
    }

    setOverrideSavingIds((prev) => [...prev, overrideId]);
    try {
      const res = await fetch(buildApiUrl(`/availability/overrides/${overrideId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: override.isUnavailable ? null : override.startTime,
          endTime: override.isUnavailable ? null : override.endTime,
          isUnavailable: override.isUnavailable,
        }),
      });
      const updated = await res.json();

      setOverrides((prev) =>
        prev.map((item) =>
          item.id === overrideId
            ? { ...item, ...updated, date: normalizeDateKey(updated.date) }
            : item
        )
      );
      showToast('Date-specific hours updated');
    } catch (error) {
      console.error('Error updating override:', error);
      showToast('Failed to update override', 'error');
    } finally {
      setOverrideSavingIds((prev) => prev.filter((id) => id !== overrideId));
    }
  }

  async function handleDeleteOverride(overrideId) {
    try {
      await fetch(buildApiUrl(`/availability/overrides/${overrideId}`), {
        method: 'DELETE',
      });
      setOverrides((prev) => prev.filter((override) => override.id !== overrideId));
      showToast('Override removed');
    } catch (error) {
      console.error('Error deleting override:', error);
      showToast('Failed to remove override', 'error');
    }
  }

  function toggleCalendarDate(dateKey) {
    setSelectedDates((prev) =>
      prev.includes(dateKey) ? prev.filter((date) => date !== dateKey) : [...prev, dateKey]
    );
  }

  function formatOverrideDate(dateKey) {
    const date = parseDateKey(dateKey);
    return `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
  }

  function getOverrideYear(dateKey) {
    return parseDateKey(dateKey).getFullYear();
  }

  function getScheduleSummary(dateKey) {
    const override = overrides.find((item) => item.date === dateKey);
    if (override) {
      if (override.isUnavailable) {
        return { type: 'override-unavailable', slots: [] };
      }

      return {
        type: 'override',
        slots: [{ startTime: override.startTime, endTime: override.endTime }],
      };
    }

    const date = parseDateKey(dateKey);
    const dayRule = rules[date.getDay()];
    if (!dayRule || !dayRule.active) {
      return { type: 'inactive', slots: [] };
    }

    return {
      type: 'default',
      slots: dayRule.slots,
    };
  }

  function renderDatePickerCalendar() {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells = [];

    for (let index = 0; index < firstDay; index++) {
      cells.push(<div key={`empty-${index}`} className="calendar-day empty" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(calendarYear, calendarMonth, day);
      const dateKey = formatDateKey(calendarYear, calendarMonth, day);
      const isPast = date < today;
      const isToday = date.getTime() === today.getTime();
      const isSelected = selectedDates.includes(dateKey);

      cells.push(
        <button
          key={dateKey}
          className={`calendar-day${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}${isPast ? ' past' : ''}`}
          onClick={() => !isPast && toggleCalendarDate(dateKey)}
          disabled={isPast}
        >
          {day}
        </button>
      );
    }

    return cells;
  }

  function renderScheduleCalendar() {
    const firstDay = new Date(scheduleCalendarYear, scheduleCalendarMonth, 1).getDay();
    const daysInMonth = new Date(scheduleCalendarYear, scheduleCalendarMonth + 1, 0).getDate();
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const cells = [];

    for (let index = 0; index < totalCells; index++) {
      const day = index - firstDay + 1;
      if (day <= 0 || day > daysInMonth) {
        cells.push(<div key={`calendar-empty-${index}`} className="schedule-calendar-cell empty" />);
        continue;
      }

      const dateKey = formatDateKey(scheduleCalendarYear, scheduleCalendarMonth, day);
      const summary = getScheduleSummary(dateKey);
      const isToday = dateKey === normalizeDateKey(today);
      const visibleSlots = summary.slots.slice(0, 2);

      cells.push(
        <div
          key={dateKey}
          className={`schedule-calendar-cell${isToday ? ' today' : ''}${summary.type === 'override' || summary.type === 'override-unavailable' ? ' override' : ''}`}
        >
          <div className="schedule-calendar-day-number">{day}</div>

          {summary.type === 'override-unavailable' && (
            <div className="schedule-calendar-unavailable">Unavailable</div>
          )}

          {visibleSlots.map((slot, index) => (
            <div key={`${dateKey}-${index}`} className="schedule-calendar-slot">
              {formatTime12(slot.startTime)} - {formatTime12(slot.endTime)}
            </div>
          ))}

          {summary.slots.length > 2 && (
            <div className="schedule-calendar-more">+{summary.slots.length - 2} more</div>
          )}

          {(summary.type === 'override' || summary.type === 'override-unavailable') && (
            <div className="schedule-calendar-badge">Specific hours</div>
          )}
        </div>
      );
    }

    return cells;
  }

  function renderWeeklyHoursSection() {
    return (
      <div className="weekly-hours">
        <div className="weekly-section-header">
          <h3>Weekly hours</h3>
        </div>
        <p className="section-desc">Set when you are typically available for meetings</p>

        {rules.map((dayRule) => (
          <div key={dayRule.day} className="day-row">
            <button
              className={`day-toggle${dayRule.active ? ' active' : ''}`}
              onClick={() => toggleDay(dayRule.day)}
              title={DAY_NAMES[dayRule.day]}
            >
              {DAY_LABELS[dayRule.day]}
            </button>

            <div className="day-slots">
              {!dayRule.active ? (
                <span className="slot-unavailable">Unavailable</span>
              ) : (
                dayRule.slots.map((slot, slotIndex) => (
                  <div key={slotIndex} className="slot-row">
                    <select
                      className="time-input"
                      value={slot.startTime}
                      onChange={(event) => updateSlotTime(dayRule.day, slotIndex, 'startTime', event.target.value)}
                    >
                      {TIME_OPTIONS.map((time) => (
                        <option key={time} value={time}>{formatTime12(time)}</option>
                      ))}
                    </select>

                    <span className="slot-separator">-</span>

                    <select
                      className="time-input"
                      value={slot.endTime}
                      onChange={(event) => updateSlotTime(dayRule.day, slotIndex, 'endTime', event.target.value)}
                    >
                      {TIME_OPTIONS.map((time) => (
                        <option key={time} value={time}>{formatTime12(time)}</option>
                      ))}
                    </select>

                    <div className="slot-actions">
                      <button
                        className="slot-action-btn delete"
                        onClick={() => removeSlot(dayRule.day, slotIndex)}
                        title="Remove slot"
                      >
                        x
                      </button>
                      <button
                        className="slot-action-btn"
                        onClick={() => addSlot(dayRule.day)}
                        title="Add time slot"
                      >
                        +
                      </button>
                      <button
                        className="slot-action-btn"
                        onClick={() => copyDay(dayRule.day)}
                        title="Copy to all days"
                      >
                        C
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderDateSpecificHoursSection(extraClassName = '') {
    return (
      <div className={`date-specific-hours ${extraClassName}`.trim()}>
        <div className="date-section-header">
          <div className="date-section-left">
            <h3>Date-specific hours</h3>
            <p className="section-desc">Adjust hours for specific days</p>
          </div>

          <button className="btn-add-hours" onClick={openOverrideModal}>
            + Hours
          </button>
        </div>

        <div className="date-overrides-list">
          {overrides.length === 0 ? (
            <p className="no-overrides">No date-specific hours set</p>
          ) : (
            (() => {
              let lastYear = null;
              return overrides.map((override) => {
                const year = getOverrideYear(override.date);
                const showYear = year !== lastYear;
                lastYear = year;

                return (
                  <div key={override.id}>
                    {showYear && <div className="override-year">{year}</div>}

                    <div className="override-item">
                      <div className="override-main">
                        <span className="override-date">{formatOverrideDate(override.date)}</span>

                        <div className="override-editor">
                          <label className="override-unavailable-toggle">
                            <input
                              type="checkbox"
                              checked={override.isUnavailable}
                              onChange={(event) => updateOverrideField(override.id, 'isUnavailable', event.target.checked)}
                            />
                            Unavailable
                          </label>

                          <div className="override-time-controls">
                            <select
                              className="time-input"
                              value={override.startTime || '09:00'}
                              disabled={override.isUnavailable}
                              onChange={(event) => updateOverrideField(override.id, 'startTime', event.target.value)}
                            >
                              {TIME_OPTIONS.map((time) => (
                                <option key={time} value={time}>{formatTime12(time)}</option>
                              ))}
                            </select>

                            <span className="slot-separator">-</span>

                            <select
                              className="time-input"
                              value={override.endTime || '17:00'}
                              disabled={override.isUnavailable}
                              onChange={(event) => updateOverrideField(override.id, 'endTime', event.target.value)}
                            >
                              {TIME_OPTIONS.map((time) => (
                                <option key={time} value={time}>{formatTime12(time)}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="override-actions">
                        <button
                          className="override-save"
                          onClick={() => handleUpdateOverride(override.id)}
                          disabled={overrideSavingIds.includes(override.id)}
                        >
                          {overrideSavingIds.includes(override.id) ? 'Saving...' : 'Save'}
                        </button>

                        <button
                          className="override-remove"
                          onClick={() => handleDeleteOverride(override.id)}
                          title="Remove override"
                        >
                          x
                        </button>
                      </div>
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="main-content">
        <div className="loading">
          <div className="loading-spinner" />
        </div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <div className="avail-page">
        <div className="avail-header">
          <h1>Availability</h1>
        </div>

        <div className="avail-tabs">
          <button
            className={`avail-tab${activeTab === 'schedules' ? ' active' : ''}`}
            onClick={() => setActiveTab('schedules')}
          >
            Schedules
          </button>
          <button
            className={`avail-tab${activeTab === 'calendar' ? ' active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            Calendar settings
          </button>
          <button
            className={`avail-tab${activeTab === 'advanced' ? ' active' : ''}`}
            onClick={() => setActiveTab('advanced')}
          >
            Advanced settings
          </button>
        </div>

        {activeTab === 'schedules' && (
          <>
            <div className="schedule-header">
              <button className="schedule-name">
                Working hours (default)
                <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" /></svg>
              </button>

              <div className="view-toggle">
                <button
                  className={`view-btn${viewMode === 'list' ? ' active' : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
                <button
                  className={`view-btn${viewMode === 'calendar' ? ' active' : ''}`}
                  onClick={() => setViewMode('calendar')}
                >
                  Calendar
                </button>
              </div>
            </div>

            <div className="schedule-active-info">
              Active on: {eventTypesCount} event types
            </div>

            {viewMode === 'list' ? (
              <div className="avail-grid">
                {renderWeeklyHoursSection()}
                {renderDateSpecificHoursSection()}
              </div>
            ) : (
              <div className="calendar-view-layout">
                <div className="schedule-calendar-panel">
                  <div className="schedule-calendar-toolbar">
                    <div className="schedule-calendar-month-group">
                      <button
                        className="calendar-nav-btn"
                        onClick={() => {
                          if (scheduleCalendarMonth === 0) {
                            setScheduleCalendarMonth(11);
                            setScheduleCalendarYear((year) => year - 1);
                          } else {
                            setScheduleCalendarMonth((month) => month - 1);
                          }
                        }}
                      >
                        &lt;
                      </button>

                      <div className="schedule-calendar-title">
                        {MONTHS[scheduleCalendarMonth]} {scheduleCalendarYear}
                      </div>

                      <button
                        className="calendar-nav-btn"
                        onClick={() => {
                          if (scheduleCalendarMonth === 11) {
                            setScheduleCalendarMonth(0);
                            setScheduleCalendarYear((year) => year + 1);
                          } else {
                            setScheduleCalendarMonth((month) => month + 1);
                          }
                        }}
                      >
                        &gt;
                      </button>
                    </div>

                    <div className="schedule-calendar-timezone">{timezone}</div>
                  </div>

                  <div className="schedule-calendar-weekdays">
                    {WEEKDAY_HEADERS.map((label) => (
                      <div key={label} className="schedule-calendar-weekday">{label}</div>
                    ))}
                  </div>

                  <div className="schedule-calendar-grid">
                    {renderScheduleCalendar()}
                  </div>
                </div>

                {renderDateSpecificHoursSection('date-specific-hours-full')}
              </div>
            )}

            <div className="timezone-section">
              <label className="timezone-label">
                Timezone
              </label>
              <select
                className="timezone-select"
                value={timezone}
                onChange={(event) => {
                  setTimezone(event.target.value);
                  setDirty(true);
                }}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {activeTab === 'calendar' && (
          <div style={{ padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Calendar settings will be available in a future update.
          </div>
        )}

        {activeTab === 'advanced' && (
          <div style={{ padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Advanced settings will be available in a future update.
          </div>
        )}

        {dirty && (
          <div className="save-bar">
            <button
              className="btn btn-secondary"
              onClick={() => {
                fetchAvailability();
                setDirty(false);
              }}
            >
              Discard
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        )}
      </div>

      {showCalendarModal && (
        <div className="calendar-modal-overlay" onClick={() => setShowCalendarModal(false)}>
          <div className="calendar-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Select the date(s) you want to assign specific hours</h2>

            <div className="calendar-nav">
              <button
                className="calendar-nav-btn"
                onClick={() => {
                  if (calendarMonth === 0) {
                    setCalendarMonth(11);
                    setCalendarYear((year) => year - 1);
                  } else {
                    setCalendarMonth((month) => month - 1);
                  }
                }}
              >
                &lt;
              </button>

              <span className="calendar-nav-month">
                {MONTHS[calendarMonth]} {calendarYear}
              </span>

              <button
                className="calendar-nav-btn"
                onClick={() => {
                  if (calendarMonth === 11) {
                    setCalendarMonth(0);
                    setCalendarYear((year) => year + 1);
                  } else {
                    setCalendarMonth((month) => month + 1);
                  }
                }}
              >
                &gt;
              </button>
            </div>

            <div className="calendar-grid">
              {WEEKDAY_HEADERS.map((label) => (
                <div key={label} className="calendar-weekday">{label}</div>
              ))}
              {renderDatePickerCalendar()}
            </div>

            <div className="selected-dates-summary">
              {selectedDates.length} date{selectedDates.length === 1 ? '' : 's'} selected
            </div>

            <div className="override-form">
              <div className="override-mode-toggle">
                <label className={`override-mode-option${!overrideForm.isUnavailable ? ' active' : ''}`}>
                  <input
                    type="radio"
                    name="override-mode"
                    checked={!overrideForm.isUnavailable}
                    onChange={() => setOverrideForm((prev) => ({ ...prev, isUnavailable: false }))}
                  />
                  Specific hours
                </label>

                <label className={`override-mode-option${overrideForm.isUnavailable ? ' active' : ''}`}>
                  <input
                    type="radio"
                    name="override-mode"
                    checked={overrideForm.isUnavailable}
                    onChange={() => setOverrideForm((prev) => ({ ...prev, isUnavailable: true }))}
                  />
                  Unavailable
                </label>
              </div>

              {!overrideForm.isUnavailable && (
                <div className="override-time-picker">
                  <select
                    className="time-input"
                    value={overrideForm.startTime}
                    onChange={(event) => setOverrideForm((prev) => ({ ...prev, startTime: event.target.value }))}
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time} value={time}>{formatTime12(time)}</option>
                    ))}
                  </select>

                  <span className="slot-separator">-</span>

                  <select
                    className="time-input"
                    value={overrideForm.endTime}
                    onChange={(event) => setOverrideForm((prev) => ({ ...prev, endTime: event.target.value }))}
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time} value={time}>{formatTime12(time)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="calendar-modal-actions">
              <button className="btn-cancel" onClick={() => setShowCalendarModal(false)}>
                Cancel
              </button>
              <button
                className="btn-apply"
                onClick={handleAddOverrides}
                disabled={selectedDates.length === 0}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`avail-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </main>
  );
}
