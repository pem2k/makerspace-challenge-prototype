const { PRESET_DEFINITIONS } = require("./settings");

function intervalMilliseconds(intervalMinutes) {
  return intervalMinutes * 60_000;
}

function nextDueAt(intervalMinutes, now = new Date()) {
  const interval = intervalMilliseconds(intervalMinutes);
  return new Date((Math.floor(now.getTime() / interval) + 1) * interval);
}

function findDueReminders(settings, now = new Date(), graceMilliseconds = 15_000) {
  const delivered = new Set(settings.deliveredOccurrenceIds);
  const due = [];

  for (const [presetId, preset] of Object.entries(settings.presets)) {
    if (!preset.enabled) continue;

    const interval = intervalMilliseconds(preset.intervalMinutes);
    const scheduledAtMs = Math.floor(now.getTime() / interval) * interval;
    if (now.getTime() - scheduledAtMs > graceMilliseconds) continue;

    const scheduledAt = new Date(scheduledAtMs).toISOString();
    const occurrenceId = `${presetId}:${scheduledAt}`;
    if (delivered.has(occurrenceId)) continue;

    const definition = PRESET_DEFINITIONS[presetId];
    due.push({
      presetId,
      occurrenceId,
      scheduledAt,
      title: definition.title,
      message: definition.message,
    });
  }

  return due;
}

module.exports = { findDueReminders, nextDueAt };
