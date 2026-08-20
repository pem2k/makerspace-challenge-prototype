const assert = require("node:assert/strict");
const test = require("node:test");

const { findDueCalendarReminders } = require("../src/calendar-reminders");

test("a timed calendar event becomes one reminder inside its lead-time window", () => {
  const events = [{
    id: "event-1",
    status: "confirmed",
    summary: "Project check-in",
    start: { dateTime: "2026-08-19T10:30:00.000Z" },
  }];
  const settings = {
    googleCalendar: { notificationsEnabled: true, reminderMinutesBefore: 10 },
    deliveredOccurrenceIds: [],
  };

  const reminders = findDueCalendarReminders(events, settings, new Date("2026-08-19T10:20:30.000Z"));

  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].occurrenceId, "google:event-1:2026-08-19T10:30:00.000Z");
  assert.equal(reminders[0].title, "Project check-in");
  assert.match(reminders[0].message, /10 minutes/);

  settings.deliveredOccurrenceIds.push(reminders[0].occurrenceId);
  assert.deepEqual(
    findDueCalendarReminders(events, settings, new Date("2026-08-19T10:20:45.000Z")),
    [],
  );
});

test("calendar reminders ignore all-day, cancelled, declined, and stale events", () => {
  const settings = {
    googleCalendar: { notificationsEnabled: true, reminderMinutesBefore: 10 },
    deliveredOccurrenceIds: [],
  };
  const events = [
    { id: "all-day", summary: "Holiday", start: { date: "2026-08-19" } },
    { id: "cancelled", status: "cancelled", start: { dateTime: "2026-08-19T10:30:00.000Z" } },
    {
      id: "declined",
      status: "confirmed",
      attendees: [{ self: true, responseStatus: "declined" }],
      start: { dateTime: "2026-08-19T10:30:00.000Z" },
    },
    { id: "stale", status: "confirmed", start: { dateTime: "2026-08-19T10:00:00.000Z" } },
  ];

  assert.deepEqual(
    findDueCalendarReminders(events, settings, new Date("2026-08-19T10:20:30.000Z")),
    [],
  );
});

test("calendar notifications can be paused without disconnecting", () => {
  const settings = {
    googleCalendar: { notificationsEnabled: false, reminderMinutesBefore: 10 },
    deliveredOccurrenceIds: [],
  };
  const events = [{
    id: "event-1",
    status: "confirmed",
    start: { dateTime: "2026-08-19T10:30:00.000Z" },
  }];

  assert.deepEqual(
    findDueCalendarReminders(events, settings, new Date("2026-08-19T10:20:30.000Z")),
    [],
  );
});

test("an event discovered 45 seconds after its lead time is not missed", () => {
  const settings = {
    googleCalendar: { notificationsEnabled: true, reminderMinutesBefore: 10 },
    deliveredOccurrenceIds: [],
  };
  const events = [{
    id: "event-1",
    status: "confirmed",
    start: { dateTime: "2026-08-19T10:30:00.000Z" },
  }];

  assert.equal(
    findDueCalendarReminders(events, settings, new Date("2026-08-19T10:20:45.000Z")).length,
    1,
  );
  assert.deepEqual(
    findDueCalendarReminders(events, settings, new Date("2026-08-19T10:22:00.000Z")),
    [],
  );
});
