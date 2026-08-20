# makerspace-challenge-prototype

A deliberately small Electron wellness reminder prototype for macOS and Windows.

## Included

- Optional floating two-state Remy pet, off by default
- Eye-rest, movement, and hydration toggles
- Configurable repeat intervals
- Local routine settings with no Remy backend server
- Native notification plus a Remy reminder popup
- Done, five-minute snooze, and presentation preview actions

## Run

```sh
npm install
npm start
```

Run tests with `npm test`. Build the Apple-silicon macOS presentation app with `npm run package:mac`, or the Windows x64 version with `npm run package:windows`.

The existing `remy-reminders` native/server prototype is separate and unchanged.
