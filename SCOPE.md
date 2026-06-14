# Shared Expenses App - System Scope & Anomalies Audit Log

This document explains the PostgreSQL database schema design and defines the complete list of CSV import anomalies detected by our parser and their exact resolution policies.

## 1. Database Schema Overview
We use a relational database designed to guarantee dynamic transactional auditability:
- **`users`**: Core user profiles.
- **`groups`**: Split expense groups.
- **`group_members`**: Tracks residency periods via `joined_at` and `left_at` (nullable if current).
- **`import_sessions`**: Session ledger containing row-counts and outcome summaries.
- **`expenses`**: Finalized base transaction rows (INR).
- **`expense_splits`**: Divides costs among active flatmates.
- **`settlements`**: Direct peer-to-peer repayments bypassing calculations.
- **`staged_expenses`**: Staging area for rows flagged as duplicate/conflicting or failing math validation.
- **`anomaly_logs`**: Explanatory entries mapping anomalies to staged or final rows.

---

## 2. Anomaly Detection & Resolution Policies

| Anomaly Type | Detection Logic | Action & Resolution Policy |
| :--- | :--- | :--- |
| **DUPLICATE** | Rows sharing identical date, description, payer, amount, and currency. | Push row to `staged_expenses`. Flag in logs. User manual resolve: Approve (inserts transaction) or Discard (removes from stage). |
| **CONFLICTING_AMOUNT** | Rows with identical Date and Description but different amount totals. | Push row to `staged_expenses`. Flag in logs. User manual resolve: Select the correct transaction to import and reject the conflict. |
| **CURRENCY_CONVERSION** | Currency column is `USD`. | Convert to `INR` at fixed rate `83.50`. Record original USD amount and exchange rate. Insert directly with a Warning log entry. |
| **TIMELINE_EXCLUSION** | Expense falls outside a member's residency timeline (`joined_at` -> `left_at`). | Auto-exclude the member from the split. Recalculate percentages among remaining active residents. Log the warning and import directly. |
| **BAD_MATH** | Split details specify percentages but they do not sum to 100%. | Push row to `staged_expenses`. Flag in logs. Block import until manually resolved. |
| **MISSING_PAYER** | `paid_by` column is empty, null, or does not match any registered user. | Push row to `staged_expenses`. Flag in logs. User must manually assign a payer. |
| **INVALID_DATE / AMOUNT** | Date format unparseable, or Amount is empty/NaN. | Push row to `staged_expenses`. Flag in logs. Block import until manually resolved. |
| **STRANGER_IN_SPLIT** | Split members list includes a name not present in the `users` table. | Push row to `staged_expenses`. Flag in logs. Block import until manually resolved. |
| **REFUND (Negative Amount)**| Amount column is negative. | Log a refund warning. Insert into database splits as negative shares, crediting the payers. |
| **SETTLEMENT** | `split_type` is NaN or Description/Notes contains keyword `"settlement"`. | Route directly into `settlements` table. Bypasses expenses and splits. |
| **CURRENCY_DEFAULTED** | Currency field is empty or missing. | Default value to `"INR"`. Create warning log and insert directly. |
