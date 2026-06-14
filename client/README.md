# Shared Expenses Frontend Dashboard (React + Vite)

This is the interactive client dashboard for the Shared Expenses App. It displays group standing metrics, interactive balance charts, a user-specific audit ledger, and Meera's staging controls for anomaly resolution.

## Technical Details

- **Framework**: React + Vite
- **Styling**: Tailwind CSS
- **Visualizations**: Recharts (for standing bar charts and contribution breakdowns)
- **Icons**: Lucide React

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure local environment variables (optional). Create a `.env.local` file:
   ```env
   VITE_API_BASE=http://localhost:4000/api
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## Production Deployment on Vercel

The frontend is deployed on Vercel. Ensure you add `VITE_API_BASE` in the Vercel Project Environment Settings pointing to the hosted Render backend API (e.g. `https://spreetail-expenses-backend.onrender.com/api`).
