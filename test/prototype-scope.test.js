const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const PROJECT_ROOT = path.join(__dirname, "..");
const PRESENTATION_FILES = [
  "src/ui/settings.html",
  "src/ui/settings-renderer.js",
  "src/ui/settings.css",
];

test("presentation prototype has no Google Calendar integration", () => {
  const publicSurface = PRESENTATION_FILES
    .map((relativePath) => fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8"))
    .join("\n");

  assert.doesNotMatch(publicSurface, /google|calendar|oauth/i);
});

test("repository-facing project title is makerspace-challenge-prototype", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"));
  const readme = fs.readFileSync(path.join(PROJECT_ROOT, "README.md"), "utf8");

  assert.equal(packageJson.name, "makerspace-challenge-prototype");
  assert.match(readme, /^# makerspace-challenge-prototype$/m);
});
