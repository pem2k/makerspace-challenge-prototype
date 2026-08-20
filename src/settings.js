const PRESET_DEFINITIONS = Object.freeze({
  eyeRest: Object.freeze({
    title: "Eye rest",
    message: "Look about 20 feet away for 20 seconds.",
    description: "A simple 20-20-20 screen break.",
    defaultIntervalMinutes: 20,
  }),
  stand: Object.freeze({
    title: "Stand and move",
    message: "Stand up, stretch, or take a short walk.",
    description: "A gentle movement nudge during desk time.",
    defaultIntervalMinutes: 60,
  }),
  hydration: Object.freeze({
    title: "Hydration",
    message: "Take a moment for some water.",
    description: "A configurable hydration check-in.",
    defaultIntervalMinutes: 60,
  }),
});

function createDefaultSettings(now = new Date()) {
  return {
    version: 1,
    showPet: false,
    googleCalendar: {
      notificationsEnabled: true,
      reminderMinutesBefore: 10,
    },
    createdAt: now.toISOString(),
    presets: Object.fromEntries(
      Object.entries(PRESET_DEFINITIONS).map(([id, definition]) => [
        id,
        {
          enabled: id !== "hydration",
          intervalMinutes: definition.defaultIntervalMinutes,
        },
      ]),
    ),
    deliveredOccurrenceIds: [],
    petPosition: null,
  };
}

function normalizePreset(input, definition) {
  const candidate = input ?? {};
  const enabled = candidate.enabled ?? true;
  const intervalMinutes = candidate.intervalMinutes ?? definition.defaultIntervalMinutes;

  if (typeof enabled !== "boolean") {
    throw new TypeError("preset enabled values must be true or false");
  }
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 480) {
    throw new RangeError("preset intervals must be between 1 and 480 minutes");
  }

  return { enabled, intervalMinutes };
}

function normalizeSettings(input = {}, now = new Date()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("settings must be an object");
  }

  const defaults = createDefaultSettings(now);
  const showPet = input.showPet ?? defaults.showPet;
  if (typeof showPet !== "boolean") {
    throw new TypeError("showPet must be true or false");
  }
  const delivered = Array.isArray(input.deliveredOccurrenceIds)
    ? input.deliveredOccurrenceIds.filter((id) => typeof id === "string").slice(-1000)
    : defaults.deliveredOccurrenceIds;
  const petPosition = input.petPosition;
  const validPetPosition = petPosition
    && Number.isInteger(petPosition.x)
    && Number.isInteger(petPosition.y)
    ? { x: petPosition.x, y: petPosition.y }
    : null;
  const calendarInput = input.googleCalendar ?? {};
  const notificationsEnabled = calendarInput.notificationsEnabled ?? defaults.googleCalendar.notificationsEnabled;
  const reminderMinutesBefore = calendarInput.reminderMinutesBefore ?? defaults.googleCalendar.reminderMinutesBefore;
  if (typeof notificationsEnabled !== "boolean") {
    throw new TypeError("Google Calendar notificationsEnabled must be true or false");
  }
  if (!Number.isInteger(reminderMinutesBefore) || reminderMinutesBefore < 0 || reminderMinutesBefore > 120) {
    throw new RangeError("Google Calendar reminder time must be between 0 and 120 minutes");
  }

  return {
    ...defaults,
    showPet,
    googleCalendar: { notificationsEnabled, reminderMinutesBefore },
    createdAt: typeof input.createdAt === "string" ? input.createdAt : defaults.createdAt,
    presets: Object.fromEntries(
      Object.entries(PRESET_DEFINITIONS).map(([id, definition]) => [
        id,
        normalizePreset(input.presets?.[id], definition),
      ]),
    ),
    deliveredOccurrenceIds: delivered,
    petPosition: validPetPosition,
  };
}

module.exports = { PRESET_DEFINITIONS, createDefaultSettings, normalizeSettings };
