const assert = require("node:assert/strict");
const test = require("node:test");

const { createDefaultSettings, normalizeSettings } = require("../src/settings");

test("default settings provide the three presentation presets", () => {
  const settings = createDefaultSettings(new Date("2026-08-19T17:00:00.000Z"));

  assert.deepEqual(Object.keys(settings.presets), ["eyeRest", "stand", "hydration"]);
  assert.equal(settings.presets.eyeRest.intervalMinutes, 20);
  assert.equal(settings.presets.stand.intervalMinutes, 60);
  assert.equal(settings.presets.hydration.intervalMinutes, 60);
  assert.equal(settings.showPet, false);
  assert.deepEqual(settings.googleCalendar, {
    notificationsEnabled: true,
    reminderMinutesBefore: 10,
  });
});

test("settings validation accepts toggles and rejects unsafe intervals", () => {
  const normalized = normalizeSettings({
    presets: {
      eyeRest: { enabled: false, intervalMinutes: 25 },
      stand: { enabled: true, intervalMinutes: 45 },
      hydration: { enabled: true, intervalMinutes: 90 },
    },
    showPet: true,
  });

  assert.equal(normalized.presets.eyeRest.enabled, false);
  assert.equal(normalized.presets.stand.intervalMinutes, 45);
  assert.equal(normalized.showPet, true);
  assert.deepEqual(normalized.googleCalendar, {
    notificationsEnabled: true,
    reminderMinutesBefore: 10,
  });
  assert.throws(
    () => normalizeSettings({ presets: { eyeRest: { enabled: true, intervalMinutes: 0 } } }),
    /between 1 and 480 minutes/,
  );
  assert.throws(
    () => normalizeSettings({ googleCalendar: { reminderMinutesBefore: 121 } }),
    /between 0 and 120 minutes/,
  );
});

test("delivery history keeps enough calendar occurrences to avoid restart duplicates", () => {
  const deliveredOccurrenceIds = Array.from({ length: 1200 }, (_, index) => `event-${index}`);
  const settings = normalizeSettings({ deliveredOccurrenceIds });

  assert.equal(settings.deliveredOccurrenceIds.length, 1000);
  assert.equal(settings.deliveredOccurrenceIds[0], "event-200");
});
