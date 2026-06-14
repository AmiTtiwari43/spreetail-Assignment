# Shared Expenses App Setup Instructions

This production-ready Shared Expenses App parses flatmate expenses, detects import anomalies, calculates exact itemized ledgers, and minimizes repayments.

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
