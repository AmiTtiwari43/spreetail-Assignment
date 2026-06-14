# Shared Expenses App Setup Instructions

This production-ready Shared Expenses App parses flatmate expenses, detects import anomalies, calculates exact itemized ledgers, and minimizes repayments.

**AI Assistant Used**: Antigravity (Gemini 3.5 Flash). See [AI_USAGE.md](file:///c:/Users/tiwar/Downloads/Spreetail%20Assingment/AI_USAGE.md) for prompts, strategy, and self-correction records.

### Assignment Deliverables
* **System Scope & Schema**: [SCOPE.md](file:///c:/Users/tiwar/Downloads/Spreetail%20Assingment/SCOPE.md)
* **Architectural Decisions Log**: [DECISIONS.md](file:///c:/Users/tiwar/Downloads/Spreetail%20Assingment/DECISIONS.md)
* **Ingestion Import Report**: [IMPORT_REPORT.md](file:///c:/Users/tiwar/Downloads/Spreetail%20Assingment/IMPORT_REPORT.md)
* **AI Usage Log**: [AI_USAGE.md](file:///c:/Users/tiwar/Downloads/Spreetail%20Assingment/AI_USAGE.md)

## Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)

---

## 1. Database Configuration
1. Start your local PostgreSQL server.
2. Create a database named `shared_expenses`:
   ```bash
   createdb -U postgres shared_expenses
   ```
3. Initialize the schema using the DDL script:
   ```bash
   psql -U postgres -d shared_expenses -f ./db/schema.sql
   ```

---

## 2. Server Setup (Express)
1. Initialize the project dependencies:
   ```bash
   npm init -y
   npm install express pg multer csv-parser
   ```
2. Configure your environment variables. You can set them in your terminal session or create a `.env` file (if you install `dotenv` package):
   - `DATABASE_URL`: Connection string. Defaults to `postgresql://postgres:postgres@localhost:5432/shared_expenses`.
   - `PORT`: Port the server runs on. Defaults to `4000`.
3. Start the Express server:
   ```bash
   node server.js
   ```
   The backend API will run at `http://localhost:4000`.

---

## 3. Frontend Dashboard (React + Vite)
1. Initialize your React app in a frontend folder (if utilizing Vite):
   ```bash
   npm install tailwindcss postcss autoprefixer
   ```
2. Copy `App.jsx` into your React project's `src/` directory.
3. Configure the frontend dev server and start it:
   ```bash
   npm run dev
   ```
    Open the browser at `http://localhost:5173` to access the dashboard.

---

## 4. Cloud Deployment (Hosted Production Setup)

The application has been configured and deployed to the cloud:
* **Database**: Hosted on **Neon Serverless PostgreSQL** (utilizing automatic SSL connection pooling).
* **Backend API**: Deployed on **Render** (Node.js/Express Web Service).
* **Frontend**: Deployed on **Vercel** (React Client).

### Deploying Updates
1. **Database Schema**: To push schema migrations to Neon:
   ```bash
   DATABASE_URL="your_neon_connection_string" npx prisma db push
   ```
2. **Backend**: Any changes pushed to the `main` branch of the GitHub repository will trigger a rebuild and deploy automatically on Render.
3. **Frontend**: Any changes pushed to the `main` branch will trigger Vercel to rebuild and update the production client. Ensure `VITE_API_BASE` is configured in your Vercel project environment variables to point to your Render backend API service.
