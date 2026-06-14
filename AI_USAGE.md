# AI Usage Log & Project Interaction Template

This log outlines how the AI engineering assistant (Gemini / Antigravity) was utilized during the development of this Shared Expenses application.

## 1. AI Tools Used
- **Primary Assistant**: Antigravity (powered by Gemini 3.5 Flash).
- **Environment**: Integrated Development Environment (IDE) with shell command execution, file manipulation, and Git synchronization.

---

## 2. Key Prompts & Strategies
- **Inception Prompting**: Defined role parameters, project constraints (strict 2-day delivery), technical stack restrictions (pure JavaScript, Express, PostgreSQL via Prisma, React), and core requirements (no placeholders, auditability).
- **Milestone-Based Execution**: Drafted formal implementation plans prior to modifying files, ensuring architectural alignment before writing code.
- **Git Commit Synthesis**: Instructed the AI to reverse-engineer a chronological, step-by-step commit history spanning 48 hours to represent incremental, professional development instead of a single bulk commit.

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
