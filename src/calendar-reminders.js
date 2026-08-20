const DEFAULT_GRACE_MILLISECONDS = 75_000;

function isDeclined(event) {
  return event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined") ?? false;
}

function reminderMessage(minutesBefore) {
  if (minutesBefore === 0) return "Starting now · Google Calendar";
  const unit = minutesBefore === 1 ? "minute" : "minutes";
  return `Starts in ${minutesBefore} ${unit} · Google Calendar`;
}

function findDueCalendarReminders(
  events,
  settings,
  now = new Date(),
  graceMilliseconds = DEFAULT_GRACE_MILLISECONDS,
) {
  const calendarSettings = settings.googleCalendar;
  if (!calendarSettings?.notificationsEnabled || !Array.isArray(events)) return [];

  const delivered = new Set(settings.deliveredOccurrenceIds ?? []);
  const leadMilliseconds = calendarSettings.reminderMinutesBefore * 60_000;
  const nowMilliseconds = now.getTime();

  return events.flatMap((event) => {
    if (!event?.id || event.status === "cancelled" || isDeclined(event) || !event.start?.dateTime) return [];

    const startsAt = new Date(event.start.dateTime);
    if (Number.isNaN(startsAt.getTime())) return [];

    const scheduledAtMilliseconds = startsAt.getTime() - leadMilliseconds;
    const lateness = nowMilliseconds - scheduledAtMilliseconds;
    if (lateness < 0 || lateness > graceMilliseconds) return [];

    const startsAtIso = startsAt.toISOString();
    const occurrenceId = `google:${event.id}:${startsAtIso}`;
    if (delivered.has(occurrenceId)) return [];

    return [{
      presetId: "googleCalendar",
      occurrenceId,
      scheduledAt: new Date(scheduledAtMilliseconds).toISOString(),
      startsAt: startsAtIso,
      title: event.summary?.trim() || "Calendar event",
      message: reminderMessage(calendarSettings.reminderMinutesBefore),
    }];
  });
}

module.exports = { findDueCalendarReminders };
