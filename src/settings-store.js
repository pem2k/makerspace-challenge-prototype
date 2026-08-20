const fs = require("node:fs");
const path = require("node:path");

const { createDefaultSettings, normalizeSettings } = require("./settings");

class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  load() {
    try {
      const normalized = normalizeSettings(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
      this.save(normalized);
      return normalized;
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      const settings = createDefaultSettings();
      this.save(settings);
      return settings;
    }
  }

  save(settings) {
    const normalized = normalizeSettings(settings);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
    return normalized;
  }
}

module.exports = { SettingsStore };
