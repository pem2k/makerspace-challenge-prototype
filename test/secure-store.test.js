const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { SecureStore } = require("../src/secure-store");

test("secure store persists encrypted bytes instead of readable OAuth tokens", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "remy-secure-store-"));
  const filePath = path.join(directory, "google-calendar.secure");
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value, "utf8").reverse(),
    decryptString: (value) => Buffer.from(value).reverse().toString("utf8"),
  };
  const store = new SecureStore(filePath, safeStorage);

  store.save({ tokens: { refreshToken: "very-secret-token" } });

  const onDisk = fs.readFileSync(filePath, "utf8");
  assert.doesNotMatch(onDisk, /very-secret-token/);
  assert.deepEqual(store.load(), { tokens: { refreshToken: "very-secret-token" } });

  store.clear();
  assert.equal(fs.existsSync(filePath), false);
});

test("secure store refuses to persist OAuth data without OS encryption", () => {
  const store = new SecureStore("unused", { isEncryptionAvailable: () => false });
  assert.throws(() => store.save({ token: "secret" }), /secure credential storage/);
});
