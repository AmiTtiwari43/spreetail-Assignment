# AI Usage Log & Project Interaction Template

This log outlines how the AI engineering assistant (Antigravity) was utilized during the development of this Shared Expenses application.

## 1. Project Inception & Requirements Framing
- **Prompting Strategy:** Provided the AI with role context, project constraints (strict 2-day delivery), technical stack restrictions (pure JavaScript, Express, PostgreSQL `pg`, React + Tailwind), and the core rules (no silent guesses, auditability).
- **Result:** Established a shared understanding of codebase design policies before generating the first line of code.

## 2. Segmented Software Development Lifecycle (SDLC)
The application was engineered sequentially in 5 distinct phases:
1. **Segment 1 (PostgreSQL Database DDL):** Schema design incorporating temporal tables (`group_members` with start/end residency dates) and staged logging tables (`staged_expenses`, `anomaly_logs`).
2. **Segment 2 (Stream Ingest & Anomaly Engine):** Streaming CSV parsing and implementation of the anomaly policies (USD conversion, timeline exclusion, duplicate detection, bad math).
3. **Segment 3 (Netting Heuristics):** Implementation of integer-precision ledger calculations and the greedy netting transaction algorithm.
4. **Segment 4 (REST API Routing):** Express route controller definitions for uploading, auditing anomalies, staging resolution, and query reporting.
5. **Segment 5 (Interactive React App):** Modern Tailwind single-dashboard component featuring Meera's staging controls, Aisha's netting card, and Rohan's detailed user balance audit list.

## 3. Human-AI Collaborative Review
- **Approval Policy:** Utilized formal `implementation_plan` artifacts for user review at each key milestone before generating final code files.
- **Modifications:** Promptly refined the CSV importer logic when additional columns (`split_type`, `split_details`, `notes`, etc.) and data cleaning rules were added.
