const fs = require("node:fs");
const path = require("node:path");

class SecureStore {
  constructor(filePath, safeStorage) {
    this.filePath = filePath;
    this.safeStorage = safeStorage;
  }

  load() {
    try {
      if (!this.safeStorage.isEncryptionAvailable()) return null;
      const encrypted = fs.readFileSync(this.filePath);
      return JSON.parse(this.safeStorage.decryptString(encrypted));
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  save(value) {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error("This computer does not currently provide secure credential storage.");
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    const encrypted = this.safeStorage.encryptString(JSON.stringify(value));
    fs.writeFileSync(temporaryPath, encrypted, { mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
  }

  clear() {
    try {
      fs.unlinkSync(this.filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

module.exports = { SecureStore };
