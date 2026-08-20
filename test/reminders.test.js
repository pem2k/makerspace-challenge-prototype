const assert = require("node:assert/strict");
const test = require("node:test");

const { findDueReminders, nextDueAt } = require("../src/reminders");
const { createDefaultSettings } = require("../src/settings");

test("an enabled preset becomes due once per interval bucket", () => {
  const settings = createDefaultSettings();
  settings.presets.stand.enabled = false;
  settings.presets.hydration.enabled = false;
  const now = new Date("2026-08-19T10:40:05.000Z");

  const first = findDueReminders(settings, now, 15_000);
  assert.equal(first.length, 1);
  assert.equal(first[0].presetId, "eyeRest");

  settings.deliveredOccurrenceIds.push(first[0].occurrenceId);
  assert.deepEqual(findDueReminders(settings, now, 15_000), []);
});

test("the next reminder aligns to a predictable wall-clock interval", () => {
  const next = nextDueAt(20, new Date("2026-08-19T10:07:00.000Z"));
  assert.equal(next.toISOString(), "2026-08-19T10:20:00.000Z");
});
