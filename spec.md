# Pits n' Giggles Stats Explorer

Current technical specification for the app as implemented in this repository.

---

## Overview

Pits n' Giggles Stats Explorer is a client-side web app for inspecting telemetry statistics from logs or pasted JSON. It parses sessions, lists them in a table, and provides a tree-based explorer for detailed inspection.

Primary goals:
- Parse one or many telemetry sessions from raw text.
- Keep parsing resilient to schema changes and unknown nesting depth.
- Let users drill from session -> tree node -> metric details quickly.
- Provide raw JSON access for debugging and copy/paste workflows.

---

## Tech Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- TanStack Table
- react-arborist (tree explorer)

All parsing and processing happen in the browser. No backend is required.

---

## Application Name and Copy

- Application name: `Pits n' Giggles Stats Explorer`
- Subtitle: `Inspect telemetry statistics captured in Pits n' Giggles logs`

---

## High-Level Flow

The app has three views controlled in a single-page flow:
- `Input`
- `Session List`
- `Session Explorer`

Typical flow:
1. User uploads a file or pastes text.
2. User clicks `Parse Sessions`.
3. App detects sessions and shows `Session List`.
4. User clicks `View` for a session.
5. App opens `Session Explorer` with tree navigation and details.

---

## Input and Parsing Rules

### Accepted input

- Pasted log text
- Pasted JSON object or JSON array
- Uploaded `.log`, `.txt`, or `.json` file (file content is loaded into the input area)

### Marker-based log parsing

- Session marker is the exact string: `Final subsystem stats`.
- Input is split by line.
- Only lines containing the marker are treated as session candidates.
- For each matching line, the parser extracts the first balanced JSON object after the marker.
- JSON extraction is brace-balanced and string-aware (handles escaped quotes and braces inside strings).

### Timestamp handling

- If a line starts with bracketed text like `[2026-03-07 15:18:07.853]`, that value is parsed as timestamp.
- If it cannot be parsed as a valid date, the raw bracket value is preserved.
- If no timestamp is found, current time is used.

### Raw JSON fallback

If no marker-based sessions are found, parser falls back to raw JSON:
- JSON object input -> one session
- JSON array input -> one session per object element
- For array elements:
  - If `stats_json` exists and is an object, it is used as session stats.
  - Otherwise the element itself is treated as stats.
  - Optional `timestamp` field is used when present.

### Error behavior

Errors are collected and shown in the Input view.
Examples:
- Marker found but JSON cannot be extracted
- JSON payload parse failure
- Payload is not a JSON object
- No sessions found

---

## Session Data Model

Each parsed session stores:
- `sessionId` (`session-1`, `session-2`, ...)
- `timestamp`
- `statsJson`
- `subsystems` (top-level keys of `statsJson`)
- `uptimeSeconds` (optional)
- `sourceLine` (optional, for marker-based parsing)

`uptimeSeconds` can be read from these keys at top-level or one nested object level:
- `uptime_seconds`
- `uptimeSeconds`
- `duration_seconds`
- `durationSeconds`

---

## Session List View

Displayed after successful parsing.

Table columns:
- Session (index label like `Session 1`)
- Timestamp
- Subsystems (comma-separated)
- Duration
- View action button

Table capabilities (TanStack Table):
- Global filtering
- Sorting
- Pagination
- Column resizing

---

## Session Explorer View

The explorer opens for one selected session and includes:

### Context and summary

- Breadcrumb navigation (`Sessions > Session N > ...selected path`)
- Session summary cards:
  - Session timestamp
  - Subsystems count
  - Tree nodes count
  - Metric leaves count
- Duration text when available

### Tree navigation panel

- Tree is built from `statsJson` recursively.
- Top-level object keys become subsystem roots.
- Any object with numeric `count` is treated as a metric leaf.
- Non-metric objects are treated as container nodes.
- Search matches node name and full path (case-insensitive).
- Controls:
  - Expand All
  - Collapse All
  - Clear Search

### Node details panel

When a metric node is selected, panel shows:
- Count
- Bytes (raw and human-readable)
- Type
- Category (derived from parent container when parent is a category-like node)
- Node kind (`Subcategory`)
- Full path

Additional metric cards are rendered for known metric types:
- `__LATENCY__`
  - Bad Latency Count
  - Min/Max/Avg/Std Dev in ms
- `__FRAME_TIMING__`
  - Budget miss stats
  - FPS stats
  - Interval stats
  - Pacing error stats

Backward compatibility:
- Latency cards are also shown when latency fields exist even if `type` is missing.

When a non-metric node is selected, panel shows:
- Node kind (`Subsystem`, `Category`, `Container`)
- Child count
- Clickable child node links
- Full path

### Raw JSON section

- Toggle button to show/hide formatted session JSON.
- Copy button copies JSON to clipboard.
- Temporary `Copied` feedback is shown after copy.

---

## Tree and Metric Typing Rules

Node kinds:
- `subsystem`
- `container`
- `metric`

Metric detection:
- A node is a metric when it is an object containing a numeric `count`.

Recognized metric fields (when present):
- `count`
- `bytes`
- `type`
- `bad_latency_count` / `badLatencyCount`
- `min_ns` / `minNs` / `min`
- `max_ns` / `maxNs` / `max`
- `avg_ns` / `avgNs` / `avg`
- `stddev_ns` / `stddevNs` / `stddev`
- `budget`, `fps`, `interval_ns` / `intervalNs`, `pacing_error_ns` / `pacingErrorNs` (for frame-timing metrics)

---

## Formatting Rules

- Large numbers are locale-formatted.
- Bytes are shown with binary units (`B`, `KB`, `MB`, `GB`, `TB`).
- Seconds are shown with one decimal place and `s` suffix.
- Nanoseconds are shown as milliseconds with up to 3 decimals.
- Ratio values can be rendered as percentages.
- Timestamps are rendered with `toLocaleString()` when parseable.

---

## UI and Theme

- Dark, developer-tool style presentation.
- Header action set:
  - Upload Log
  - Paste Logs
  - GitHub link
- Footer text:
  - `Pits n' Giggles`
  - `Telemetry debugging tools`

---

## Build and Run

Development:
```bash
npm install
npm run dev
```

Production build:
```bash
npm run build
```

The app is static-site deployable.
