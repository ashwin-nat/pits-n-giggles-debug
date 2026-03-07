# Pits n' Giggles - Stats Viewer

Web-based telemetry statistics viewer for Pits n' Giggles logs.

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- TanStack Table

## What It Does

- Parses log lines that contain `Final subsystem stats`.
- Extracts and safely parses the embedded JSON stats payload.
- Supports multiple sessions in one log input.
- Traverses unknown-depth nested metrics recursively.
- Flattens metrics into table rows with full canonical paths.
- Provides:
  - Input view (upload or paste)
  - Session list
  - Session explorer (subsystems, groups, metrics, breadcrumbs, raw JSON)

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```
