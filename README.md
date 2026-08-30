# Bowling Tracker

Personal bowling tracking and analytics app.

## Local development

```bash
npm install
npm run dev
```

## GitHub Pages

The included GitHub Actions workflow builds the app and deploys `dist/` to GitHub Pages whenever `main` is updated.

The app stores bowling data in the browser's localStorage. Data is therefore persistent across browser sessions on the same browser/device, but is not automatically synchronized between devices.

Use the app's JSON backup/export feature as an additional backup.
