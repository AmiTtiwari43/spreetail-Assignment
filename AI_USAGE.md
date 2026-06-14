# AI Usage Log & Project Interaction Template

This log outlines how the AI engineering assistant (Gemini / Antigravity) was utilized during the development of this Shared Expenses application.

## 1. AI Tools Used
- **Primary Assistant**: Antigravity (powered by Gemini 3.5 Flash).
- **Environment**: Integrated Development Environment (IDE) with shell command execution, file manipulation, and Git synchronization.

---

## 2. Key Prompts & Strategies Used (Segmented Build)

The application was built incrementally by supplying the AI assistant with explicit segment prompts for each phase:

* **Segment 1: Database Setup & Schema**:
  > *"Generate the raw SQL DDL script and a db.js file using the pg package to connect to PostgreSQL. The relational schema must include: users and groups; group_members: Must track dynamic membership over time (joined_at, left_at) so we know who lived there during specific dates; expenses: Must track original_amount, original_currency, exchange_rate, and final amount in INR; expense_splits: Maps who owes what for each expense; settlements: Separate ledger for users paying each other back; import_sessions, staged_expenses (for rows requiring manual approval), and anomaly_logs (to track every detected issue and its resolution)."*

* **Segment 2: Data Import & Anomaly Detection Pipeline**:
  > *"Write an importer.js module using csv-parser to stream expenses_export.csv. The exact CSV columns are: date, description, paid_by, amount, currency, split_type, split_with, split_details, notes. Implement an Anomaly Engine that processes each row according to these strict policies. If any anomaly is found, log it to anomaly_logs and push the row to staged_expenses for manual resolution. Handle data cleaning (commas, spaces, name normalization, erratic date formats), missing data, duplicates/conflicts, USD conversions, timeline constraints, bad math percentage totals, negative refund amounts, settlements, and strangers in splits."*

* **Segment 3: Ledger Calculations & Netting Algorithm**:
  > *"Write a calculator.js module that handles group balances without floating-point math errors. (1) Rohan's Requirement (Auditability): Create a function that calculates a user's exact balance by summing what they paid, minus what they owe, plus/minus settlements. It must return an itemized list of exact expenses making up that number. (2) Aisha's Requirement (Debt Simplification): Implement a greedy algorithm (netting flow) that takes all user balances, separates debtors from creditors, and calculates the absolute minimum number of transactions needed to settle all debts."*

* **Segment 4: Express API Integration**:
  > *"Build the Express server (server.js) connecting our previous modules. Endpoints: POST /api/upload (handles file upload via multer and triggers importer.js), GET /api/anomalies (fetches anomaly logs and staged expenses), POST /api/staged/resolve (approves/rejects staged duplicate expenses), and GET /api/balances (returns simplified debt matrix and detailed audit trail)."*

* **Segment 5: The Frontend UI**:
  > *"Generate the code for a React frontend using Tailwind CSS. We need three main components: (1) Import Dashboard with file dropzone and Import Report showing staging controls for Meera's view, (2) Aisha's View summary card showing 'Who pays whom, how much', and (3) Rohan's View detailed clickable table showing exactly which expenses make up a user's total balance."*

* **Segment 6: Final Documentation Generation**:
  > *"Based on the code we have built, generate the required documentation files: README.md (Setup instructions to run the Postgres DB and Node server locally), SCOPE.md (detailed database schema and exhaustive log of CSV anomalies and policies), DECISIONS.md (log of significant decisions, options considered, and rationales), and AI_USAGE.md (template detailing AI collaboration)."*

---

## 3. Concrete Cases of AI Errors and Resolutions

### Case 1: Floating Point Math Discrepancies
- **What the AI produced wrong**: The AI initially designed the split logic and debt-minimization algorithm using floating-point math directly in JavaScript. For uneven split scenarios (e.g., splitting ₹100.00 among three people), this resulted in minor fractional discrepancies (e.g., $33.333333333333336$).
- **How it was caught**: During manual testing of the split calculations, we noticed that summing up the individual user shares did not perfectly equal the overall transaction total, causing small cents leakage in the ledger.
- **What was changed**: Refactored the math calculations to handle decimal rounding at each insertion step. We implemented database constraints and validated that the sum of splits matches the total amount down to 2 decimal places.

### Case 2: Incorrect Entry Point in `package.json`
- **What the AI produced wrong**: The AI generated the backend `package.json` file with a start script pointing directly to the root: `"start": "node server.js"`.
- **How it was caught**: We realized the server code was structured inside the `src/` directory (`server/src/server.js`), which meant running the start command in a container/hosting platform like Render would fail with a `Module Not Found` exception.
- **What was changed**: Corrected the script to `"start": "node src/server.js"`, ensuring Render could boot the application properly.

### Case 3: Hardcoded API Base URL in React Frontend
- **What the AI produced wrong**: The AI hardcoded the React client API endpoint as `const API_BASE = 'http://localhost:4000/api'`.
- **How it was caught**: After deploying the frontend to Vercel and the backend to Render, the client dashboard failed to fetch data because it was attempting to call `localhost` instead of the hosted Web Service URL.
- **What was changed**: Modified `App.jsx` to dynamically load from `import.meta.env.VITE_API_BASE`. We also built a self-healing utility that automatically appends `/api` if the environment variable excludes it, preventing common misconfiguration crashes.
