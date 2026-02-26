# Product Brief: workout

**Date:** 2026-02-26
**Author:** trom
**Version:** 1.0
**Project Type:** web-app
**Project Level:** 1

---

## Executive Summary

A personal fitness dashboard that parses daily Health Connect exports and displays workout sessions, body metrics, and nutrition data on a simple public web page. Built for a single user (trom) to share progress transparently with a coach — no login, no friction, just a live view of the data.

---

## Problem Statement

### The Problem

Tracking fitness progress across multiple apps (workout logging, nutrition, scale) creates fragmented data. Sharing this data with a coach currently requires manual screenshots, messages, or verbal updates — all error-prone and time-consuming.

### Why Now?

Starting a structured coaching relationship that requires regular data sharing. Health Connect already aggregates all relevant data from synced apps; the missing piece is a clean read-only view for the coach.

### Impact if Unsolved

Coach has incomplete visibility into training load, nutrition, and body composition trends, making it harder to give precise guidance. Manual reporting is tedious and likely to be inconsistent over time.

---

## Target Audience

### Primary Users

- **trom** — the athlete. Logs workouts, meals, and body metrics via Android apps that sync to Health Connect. Will set up the daily export pipeline and maintain the Google Drive folder.

### Secondary Users

- **Coach** — views the public dashboard to review progress before/during sessions. Tech-savvy enough to open a URL, no account needed.

### User Needs

- Athlete needs data to flow automatically with minimal manual work after setup
- Coach needs a single URL to see all relevant metrics without needing to ask for updates
- Both need data to be accurate and up to date (daily refresh cadence)

---

## Solution Overview

### Proposed Solution

A static web app that reads a processed JSON/CSV file (derived from the daily Health Connect `.db` export) and renders fitness dashboards. The `.db` file is exported daily from Android to a public Google Drive folder. A simple script parses it into static data files, which are committed to GitHub and auto-deployed via Vercel.

**Google Drive folder:** https://drive.google.com/drive/folders/1glsuyQbSMLym6uynakK4S-Qxj-29pidA

### Key Features

- **Workout history** — sessions by date with title (Workout A–F), duration, exercise segments (sets × reps × weight)
- **Weight chart** — daily weigh-ins over time (data confirmed: 164 entries, ~107kg range)
- **Body fat %** — trend over time (10 entries available)
- **Nutrition summary** — daily calories, protein, carbs, fat from tracked meals
- **Simple date navigation** — view by week or scroll timeline
- **Zero auth** — fully public, shareable by URL

### Value Proposition

One URL the coach can bookmark. Always up to date. No app to install, no login, no manual reporting.

---

## Business Objectives

### Goals

- Coach has access to all fitness metrics before each session
- Data pipeline runs with minimal manual intervention after initial setup
- Dashboard is live within a few days of starting development

### Success Metrics

- Daily export → dashboard update pipeline works reliably
- Coach can find any metric (weight, last workout, macros) in under 10 seconds
- Zero manual reporting required after setup

### Business Value

Better coaching outcomes through data transparency. Personal accountability through persistent, visible tracking.

---

## Scope

### In Scope

- Parse Health Connect SQLite export: exercise sessions, segments (sets/reps/weight), weight, body fat, nutrition macros
- Static web dashboard: weight chart, workout log, nutrition summary
- Daily data pipeline: export `.db` → parse to JSON → commit → Vercel auto-deploy
- Google Drive folder as optional manual supplement (coach notes, program docs)
- Public deployment on Vercel (free tier)

### Out of Scope

- Authentication or user accounts
- Real-time data (daily refresh is sufficient)
- Push notifications or alerts
- Multi-user support
- Sleep, steps, heart rate (can add later)
- Mobile-native app

### Future Considerations

- Auto-sync from Google Drive (watch folder for new `.db` exports)
- Sleep quality and HRV trends
- Workout volume charts (sets × reps per muscle group per week)
- Coach annotations or comments on the dashboard

---

## Key Stakeholders

- **trom (Owner/Athlete)** — High influence. Builds and maintains the system, primary data source.
- **Coach** — Medium influence. Consumer of the dashboard; feedback will shape what metrics are surfaced.

---

## Constraints and Assumptions

### Constraints

- Free hosting only (Vercel free tier)
- No backend server — static site only
- Data pipeline runs manually or via simple script (no cloud functions for now)
- Health Connect export is a SQLite `.db` file — parsing must handle binary format

### Assumptions

- Health Connect apps (workout tracker, scale, nutrition app) sync reliably and daily
- The `.db` export will be triggered manually or via automation each day
- Coach is comfortable opening a web URL (no app required)
- Weight stored in grams in the DB (107,100g = 107.1kg), energy in joules — unit conversion needed in parser
- Exercise segment types map to named exercises via Health Connect type IDs

---

## Success Criteria

- Dashboard loads in under 3 seconds on a mobile browser
- Weight trend visible for at least 30 days of history
- Last workout session always shown prominently on the home view
- Daily macros (calories, protein, carbs, fat) shown for the current day
- Coach confirms they can use it without any explanation needed

---

## Timeline and Milestones

### Target Launch

ASAP — before the next coaching session.

### Key Milestones

- **Day 1:** Parse Health Connect DB, confirm all data fields extract correctly
- **Day 2:** Build static HTML/JS dashboard with charts
- **Day 3:** Deploy to Vercel, set up daily update script
- **Day 4:** Share URL with coach, gather feedback

---

## Risks and Mitigation

- **Risk:** Health Connect segment type IDs are undocumented integers (e.g. type 64 seen in data)
  - **Likelihood:** Medium
  - **Mitigation:** Cross-reference Android Health Connect SDK source or reverse-engineer from workout titles + segment patterns

- **Risk:** Daily export not triggered consistently (manual step)
  - **Likelihood:** Medium
  - **Mitigation:** Automate via Android Tasker/MacroDroid or a simple reminder; long-term explore Drive API watch

- **Risk:** DB schema changes between Health Connect versions
  - **Likelihood:** Low
  - **Mitigation:** Pin parser to confirmed schema, add validation step

---

## Next Steps

1. Create Tech Spec — `/tech-spec`
2. Parse the Health Connect DB and validate all data fields
3. Build and deploy static dashboard

---

**This document was created using BMAD Method v6 - Phase 1 (Analysis)**

*To continue: Run `/workflow-status` to see your progress and next recommended workflow.*
