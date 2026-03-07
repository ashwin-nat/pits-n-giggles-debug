# Pits n' Giggles — Stats Viewer

Technical Specification

---

# Overview

Build a **web-based statistics viewer** for **Pits n' Giggles telemetry logs**.

The tool parses telemetry statistics embedded inside log files and allows users to explore the metrics interactively.

The viewer is primarily intended as a **debugging and diagnostic tool**, but it should still look **clean and presentable** so curious users can explore the data.

Primary goals:

* inspect telemetry stats quickly
* support multiple sessions
* navigate nested metrics easily
* remain compatible with a **flexible evolving schema**

The application must run **entirely client-side** and be deployable as a **static site on Vercel**.

---

# Technology Stack

Use the following stack:

* Vite
* React
* TypeScript
* Tailwind CSS
* TanStack Table

All parsing and data processing must happen **in the browser**.

No backend services.

---

# Application Name

Title:

**Pits n' Giggles — Stats Viewer**

Subtitle:

**Inspect telemetry statistics captured in Pits n' Giggles logs**

---

# Visual Theme

The UI must follow the **Pits n' Giggles visual identity**.

Use a **dark theme** with a **black + red palette**.

### Color palette

Background
`#0a0a0a`

Card background
`#141414`

Borders
`#2a2a2a`

Primary accent (Pits n' Giggles red)
`#e10600`

Primary text
`#e5e5e5`

Muted text
`#9ca3af`

Row hover highlight
`#1f1f1f`

---

# Design Philosophy

The viewer should resemble **developer tooling** rather than a dashboard.

Design inspirations:

* Chrome DevTools
* Grafana inspect panels
* GitHub table views

Principles:

* table-first interface
* minimal UI noise
* progressive drill-down
* support large metric sets
* emphasize readability in dark theme

---

# Layout

Use a centered layout.

Structure:

Header
Main Content
Footer

Maximum content width:

`max-w-6xl`

---

# Header

Header contents:

**Pits n' Giggles — Stats Viewer**

Subtitle:

Inspect telemetry statistics captured in Pits n' Giggles logs

Right side actions:

Upload Log
Paste Logs

Optional GitHub link.

---

# Core Concepts

## Sessions

Each telemetry session outputs a **statistics snapshot** into the system log.

Example log line:

```
2026-03-07T10:14:22 STATS_JSON {"Core": {...}, "HUD": {...}}
```

Structure:

timestamp
fixed prefix
JSON stats object

A log file may contain **multiple sessions**.

The viewer must extract all sessions and allow navigation between them.

---

# Log Parsing Rules

The parser must:

1. read the entire log text
2. split it into lines
3. detect lines containing the stats prefix
4. extract the JSON portion
5. parse the JSON safely
6. create session entries

Lines without stats must be ignored.

---

# Session Object

Each detected session must store:

```
session_id
timestamp
stats_json
subsystems
uptime_seconds (optional)
```

Subsystems are determined from the **top-level keys of the JSON object**.

---

# Statistics Schema

The statistics schema is intentionally **simple, flexible, and extensible**.

The viewer must not assume a fixed schema.

The only guaranteed rule:

**Top-level keys represent subsystems.**

Example:

```
Core
HUD
Pit Wall
Save Viewer
```

---

# Flexible Nested Structure

Inside each subsystem the data may contain **multiple counters and arbitrary nesting**.

Example structure:

```
subsystem
  → counter group
    → category
      → subcategory
        → stat_container
```

However, the number of levels is **not fixed**.

The viewer must treat the data as a **generic nested tree**.

---

# Stat Container

Leaf nodes in the tree are **stat containers**.

A stat container contains metric values.

Example:

```
{
  count: 10747,
  bytes: 14529944,
  type: "packet"
}
```

Fields:

count (optional)
bytes (optional)
type (optional)

The presence of `count` or `bytes` indicates a **leaf metric**.

The viewer must detect stat containers dynamically.

---

# Type Field

Stat containers may optionally include a `type` field.

The type describes the **nature of the metric**.

Examples:

```
packet
event
frame
network
generic
```

The viewer should use this field **only for display and formatting**, not for schema logic.

---

# Recursive Traversal Requirement

The stats viewer must traverse statistics **recursively**.

It must treat the JSON as a **tree of unknown depth**.

Traversal logic:

* if an object contains `count` or `bytes`, treat it as a metric
* otherwise treat it as a group node and continue traversal

This guarantees compatibility with any future schema extension.

---

# Metric Identity

Each metric must have a canonical path constructed from its location in the tree.

Example:

```
Core.frame_gate.dropped_packets.DUPLICATE_PACKET_TYPE
```

This path must be displayed in the UI and used as the metric identifier.

---

# Flattened Metric Representation

For rendering tables, metrics should be flattened into rows.

Each row contains:

```
subsystem
group_path
metric_name
count
bytes
type
full_path
```

Example:

| Subsystem | Group                      | Metric                | Count | Bytes |
| --------- | -------------------------- | --------------------- | ----- | ----- |
| Core      | frame_gate.dropped_packets | DUPLICATE_PACKET_TYPE | 108   | 31745 |

---

# Application Views

The application consists of three main views:

1. Input Page
2. Session List
3. Session Explorer

All navigation happens within a single-page application.

---

# Input Page

Purpose: ingest logs.

Layout:

Upload Log File

OR

Paste Logs / JSON

Large textarea

Parse Sessions button

The textarea must support:

* entire log files
* pasted log snippets
* raw JSON stats

---

# Session List

After parsing, the viewer shows detected sessions.

Display sessions in a table.

Columns:

Index
Timestamp
Subsystems
Duration
View

Example:

| # | Timestamp | Subsystems | Duration |      |
| - | --------- | ---------- | -------- | ---- |
| 1 | 10:14:22  | Core, HUD  | 15.6s    | View |

Clicking **View** opens the session explorer.

---

# Session Explorer

The session explorer displays metrics for the selected session.

Top section shows session metadata:

Session timestamp
Duration (if available)

Below show **summary cards**:

Subsystems
Groups
Total metrics
Duration

---

# Subsystem Navigation

Subsystems are displayed as tabs.

Example:

Core | HUD | Pit Wall | Save Viewer

The selected subsystem should be highlighted using the red accent color.

---

# Subsystem Metrics

Within a subsystem the viewer should display **grouped metrics**.

Groups correspond to nested nodes inside the subsystem.

Example hierarchy:

```
Core
 ├ frame_gate
 │   └ dropped_packets
 │       └ DUPLICATE_PACKET_TYPE
 ├ parser
 │   └ dropped_packets
 │       └ UNINTERESTED_PACKET
```

Each group becomes a **section in the UI**.

---

# Metric Tables

Each group should display metrics using a table.

Columns:

Metric
Count
Bytes
Avg Bytes
Type
Full Path

Example:

| Metric                | Count | Bytes | Avg Bytes | Type   |
| --------------------- | ----- | ----- | --------- | ------ |
| DUPLICATE_PACKET_TYPE | 108   | 31745 | 293       | packet |

Numeric columns must be right-aligned.

---

# Aggregation

Group nodes should display aggregated totals.

Example:

```
frame_gate
```

Totals are calculated by summing child metrics.

```
total_count = sum(children.count)
total_bytes = sum(children.bytes)
```

---

# Breadcrumb Navigation

Display navigation context.

Example:

Sessions > Session 3 > Core > frame_gate > dropped_packets

Breadcrumbs must be clickable.

---

# Raw JSON Viewer

Each session page should include a raw JSON viewer.

Button:

Show Raw JSON

The JSON should be formatted and displayed in a collapsible viewer.

---

# Tables

All tables must support:

sorting
pagination
filtering
column resizing

TanStack Table should be used.

Tables must use dark theme styling.

---

# Performance Requirements

The viewer must handle:

100+ sessions
10k+ metrics
large log files

Avoid expensive rerenders.

---

# Footer

Footer content:

Pits n' Giggles
Telemetry debugging tools

---

# Build and Deployment

The project must run using:

npm install
npm run dev

Production build:

npm run build

The output must be deployable as a **static site on Vercel**.

---

# Deliverables

The generated project must include:

Vite configuration
React components
TypeScript types
Tailwind setup
TanStack Table integration
log parsing utilities
stats traversal utilities

The result should be a **fully functional Pits n' Giggles Stats Viewer**.

