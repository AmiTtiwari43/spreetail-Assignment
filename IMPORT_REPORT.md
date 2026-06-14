# CSV Ingestion Anomaly & Audit Report

This report summarizes the parsing analysis, data cleaning operations, and anomaly resolutions executed by the Shared Expenses App ingestion engine during CSV processing.

---

## 1. Import Session Metadata
* **Session ID**: `IS-20260614-01`
* **Target Group**: `Default Flatmates`
* **Parsed Rows**: 7
* **Imported Directly**: 4 (including auto-resolved warnings)
* **Staged for Approval**: 3
* **Rejected/Discarded**: 0

---

## 2. Exhaustive Log of Detected Anomalies & Actions Taken

Below is the itemized report of every anomaly detected by the ingestion engine during the streaming import:

| Row Index | Transaction Description | Detected Anomaly | Severity | Action & Resolution State |
| :---: | :--- | :--- | :---: | :--- |
| **1** | Snacks at Grocery | None | Safe | **Imported Directly**: Successfully created expense and split shares equally among active members. |
| **2** | Electricity Bill | `CURRENCY_CONVERSION` | Warning | **Auto-Resolved**: Detected `USD` currency. Converted to INR at fixed rate `83.50` (₹8,350.00). Stored original values and imported directly. |
| **3** | Internet bill | `TIMELINE_EXCLUSION` | Warning | **Auto-Resolved**: Expense date (April 12) falls after Meera's residency period (ended March 31). Auto-excluded Meera and recalculated split shares equally among remaining active members. |
| **4** | Dinner at Marina | `DUPLICATE` | Critical | **Staged**: Identical date, description, payer, and amount found. Staged in `staged_expenses` for manual validation (Approve/Reject). |
| **5** | Dinner at Marina | `DUPLICATE` | Critical | **Staged**: Conflict check flagged this as a duplicate of Row 4. Staged for manual user resolution. |
| **6** | Taxi ride | `BAD_MATH` | Critical | **Staged**: Split details percentages sum to `110%` instead of `100%`. Staged to block incorrect ledger calculations. |
| **7** | Repayment | `SETTLEMENT` | Info | **Auto-Resolved**: Route bypassed calculation and logged directly into the `settlements` table. |

---

## 3. Database Ingestion Summary

```mermaid
graph TD
    CSV[Upload CSV File] --> Engine{Anomaly Engine}
    Engine -- Clear & Standard -- > DB[(expenses & splits)]
    Engine -- USD Detected -- > Warning[Auto-Convert to INR] --> DB
    Engine -- Timeline Conflict -- > Warning2[Auto-Exclude Member] --> DB
    Engine -- Duplicate / Bad Math -- > Stage[(staged_expenses)]
    Engine -- Settlement Type -- > Settled[(settlements)]
```
