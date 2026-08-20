const path = require("node:path");
const fs = require("node:fs");

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  safeStorage,
  shell,
  Tray,
} = require("electron");

const { findDueCalendarReminders } = require("./calendar-reminders");
const {
  GoogleCalendarClient,
  connectWithDesktopOAuth,
  parseDesktopClientCredentials,
} = require("./google-calendar");
const { findDueReminders } = require("./reminders");
const { SecureStore } = require("./secure-store");
const { SettingsStore } = require("./settings-store");

const POLL_INTERVAL_MS = 10_000;
const CALENDAR_SYNC_INTERVAL_MS = 60_000;
const SNOOZE_INTERVAL_MS = 5 * 60_000;

let petWindow;
let settingsWindow;
let popupWindow;
let tray;
let store;
let calendarCredentialStore;
let calendarClient;
let settings;
let currentReminder;
let calendarEvents = [];
let calendarSyncInProgress = false;
let calendarStatus = { connected: false, syncing: false, lastSyncAt: null, error: null };
const reminderQueue = [];

function windowOptions() {
  return {
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

function createPetWindow() {
  const savedPosition = settings.petPosition;
  const display = screen.getPrimaryDisplay().workArea;
  petWindow = new BrowserWindow({
    ...windowOptions(),
    width: 180,
    height: 220,
    x: savedPosition?.x ?? display.x + display.width - 210,
    y: savedPosition?.y ?? display.y + display.height - 245,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
  });
  petWindow.loadFile(path.join(__dirname, "ui", "pet.html"));
  petWindow.once("ready-to-show", () => petWindow.showInactive());
  petWindow.on("moved", () => {
    const [x, y] = petWindow.getPosition();
    settings = store.save({ ...settings, petPosition: { x, y } });
  });
  petWindow.on("closed", () => { petWindow = null; });
}

function syncPetVisibility() {
  if (settings.showPet && !petWindow) {
    createPetWindow();
  } else if (!settings.showPet && petWindow) {
    petWindow.destroy();
  }
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    ...windowOptions(),
    width: 820,
    height: 820,
    minWidth: 680,
    minHeight: 620,
    title: "Remy Wellness",
    backgroundColor: "#171a21",
  });
  settingsWindow.loadFile(path.join(__dirname, "ui", "settings.html"));
  settingsWindow.on("closed", () => { settingsWindow = null; });
  return settingsWindow;
}

function openSettings() {
  if (!settingsWindow) createSettingsWindow();
  settingsWindow.show();
  settingsWindow.focus();
}

function createPopupWindow() {
  popupWindow = new BrowserWindow({
    ...windowOptions(),
    width: 360,
    height: 150,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#20242d",
  });
  popupWindow.loadFile(path.join(__dirname, "ui", "popup.html"));
  popupWindow.on("closed", () => { popupWindow = null; });
  return popupWindow;
}

function positionPopup() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const [width, height] = popupWindow.getSize();
  popupWindow.setPosition(display.x + display.width - width - 24, display.y + 24);
}

function presentNextReminder() {
  if (currentReminder || reminderQueue.length === 0) return;
  currentReminder = reminderQueue.shift();
  if (!popupWindow) createPopupWindow();

  const showPopup = () => {
    positionPopup();
    popupWindow.showInactive();
    popupWindow.webContents.send("reminder:show", currentReminder);
    petWindow?.webContents.send("pet:wave");

    if (Notification.isSupported()) {
      new Notification({ title: currentReminder.title, body: currentReminder.message }).show();
    }
  };

  if (popupWindow.webContents.isLoadingMainFrame()) {
    popupWindow.webContents.once("did-finish-load", showPopup);
  } else {
    showPopup();
  }
}

function enqueueReminder(reminder, recordDelivery = true) {
  if (recordDelivery) {
    settings.deliveredOccurrenceIds.push(reminder.occurrenceId);
    settings = store.save(settings);
  }
  reminderQueue.push(reminder);
  presentNextReminder();
}

function finishCurrentReminder() {
  currentReminder = null;
  popupWindow?.hide();
  presentNextReminder();
}

function checkReminders() {
  for (const reminder of findDueReminders(settings, new Date(), POLL_INTERVAL_MS)) {
    enqueueReminder(reminder);
  }
  for (const reminder of findDueCalendarReminders(calendarEvents, settings)) {
    enqueueReminder(reminder);
  }
}

function publishCalendarStatus(nextStatus = {}) {
  calendarStatus = { ...calendarStatus, ...nextStatus };
  settingsWindow?.webContents.send("calendar:status", calendarStatus);
  return calendarStatus;
}

async function syncCalendar() {
  if (!calendarClient?.isConnected() || calendarSyncInProgress) return calendarStatus;
  calendarSyncInProgress = true;
  publishCalendarStatus({ connected: true, syncing: true, error: null });
  try {
    calendarEvents = await calendarClient.listUpcomingEvents(new Date());
    checkReminders();
    return publishCalendarStatus({
      connected: true,
      syncing: false,
      lastSyncAt: new Date().toISOString(),
      error: null,
    });
  } catch (error) {
    return publishCalendarStatus({ connected: true, syncing: false, error: error.message });
  } finally {
    calendarSyncInProgress = false;
  }
}

async function chooseCalendarCredentials() {
  const result = await dialog.showOpenDialog(settingsWindow, {
    title: "Choose Google Desktop OAuth credentials",
    properties: ["openFile"],
    filters: [{ name: "Google OAuth JSON", extensions: ["json"] }],
  });
  if (result.canceled) return null;
  return parseDesktopClientCredentials(fs.readFileSync(result.filePaths[0], "utf8"));
}

async function connectGoogleCalendar() {
  publishCalendarStatus({ syncing: true, error: null });
  try {
    const existing = calendarCredentialStore.load();
    const credentials = existing?.credentials ?? await chooseCalendarCredentials();
    if (!credentials) return publishCalendarStatus({ syncing: false });

    const tokens = await connectWithDesktopOAuth({
      credentials,
      openExternal: (url) => shell.openExternal(url),
    });
    if (!tokens.refreshToken) {
      throw new Error("Google did not return offline access. Revoke Remy access in Google and connect again.");
    }
    calendarCredentialStore.save({ credentials, tokens });
    publishCalendarStatus({ connected: true, syncing: false, error: null });
    return syncCalendar();
  } catch (error) {
    return publishCalendarStatus({ connected: calendarClient.isConnected(), syncing: false, error: error.message });
  }
}

function disconnectGoogleCalendar() {
  calendarCredentialStore.clear();
  calendarEvents = [];
  return publishCalendarStatus({ connected: false, syncing: false, lastSyncAt: null, error: null });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "remy-wave.png")).resize({ width: 18, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip("Remy Wellness");
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open wellness settings", click: openSettings },
    { label: "Preview reminder", click: () => enqueueReminder(previewReminder(), false) },
    {
      label: "Show floating Remy",
      type: "checkbox",
      checked: settings.showPet,
      click: (item) => {
        settings = store.save({ ...settings, showPet: item.checked });
        syncPetVisibility();
        updateTrayMenu();
      },
    },
    { type: "separator" },
    { label: "Quit Remy", click: () => app.quit() },
  ]));
}

function previewReminder() {
  return {
    presetId: "preview",
    occurrenceId: `preview:${Date.now()}`,
    scheduledAt: new Date().toISOString(),
    title: "Eye rest",
    message: "Look about 20 feet away for 20 seconds.",
  };
}

function configureIpc() {
  ipcMain.handle("settings:get", () => settings);
  ipcMain.handle("settings:save", (_event, nextSettings) => {
    settings = store.save({ ...settings, ...nextSettings });
    syncPetVisibility();
    updateTrayMenu();
    return settings;
  });
  ipcMain.handle("calendar:get-status", () => calendarStatus);
  ipcMain.handle("calendar:connect", () => connectGoogleCalendar());
  ipcMain.handle("calendar:disconnect", () => disconnectGoogleCalendar());
  ipcMain.handle("calendar:sync", () => syncCalendar());
  ipcMain.handle("window:open-settings", () => openSettings());
  ipcMain.handle("reminder:preview", () => enqueueReminder(previewReminder(), false));
  ipcMain.handle("reminder:complete", () => finishCurrentReminder());
  ipcMain.handle("reminder:snooze", () => {
    const reminder = currentReminder;
    finishCurrentReminder();
    if (reminder) {
      setTimeout(() => enqueueReminder({ ...reminder, occurrenceId: `snooze:${Date.now()}` }, false), SNOOZE_INTERVAL_MS);
    }
  });
}

app.whenReady().then(() => {
  app.setName("Remy Wellness");
  store = new SettingsStore(path.join(app.getPath("userData"), "settings.json"));
  calendarCredentialStore = new SecureStore(
    path.join(app.getPath("userData"), "google-calendar.secure"),
    safeStorage,
  );
  calendarClient = new GoogleCalendarClient({ credentialStore: calendarCredentialStore });
  settings = store.load();
  calendarStatus.connected = calendarClient.isConnected();
  configureIpc();
  createTray();
  syncPetVisibility();
  openSettings();
  setInterval(checkReminders, POLL_INTERVAL_MS);
  setInterval(syncCalendar, CALENDAR_SYNC_INTERVAL_MS);
  checkReminders();
  syncCalendar();
});

app.on("activate", () => {
  openSettings();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});
