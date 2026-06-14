# Architectural Decisions Log (ADL)

This document outlines key technical engineering decisions made during the design of the Shared Expenses application.

## 1. Pure JavaScript (Node.js/Express) Over TypeScript
- **Decision:** Build the entire project using standard CommonJS modules in pure Node.js.
- **Rationale:** The strict 2-day delivery constraint requires minimizing build-tooling overhead, compilation steps, and configuration fatigue. Pure JavaScript enables immediate execution and rapid local iteration.

## 2. PostgreSQL Connection Pooling via Prisma Client & `pg`
- **Decision:** Utilize `@prisma/client` with the native `@prisma/adapter-pg` driver for connection pooling and SQL execution.
- **Rationale:** Rather than using a fully abstracted ORM layer, this hybrid design uses Prisma Client's modern connection pooling adapter to run raw SQL queries (`$queryRawUnsafe`). This delivers the performance of raw SQL while leveraging Prisma's schema definition benefits and connection robustness.

## 3. Decimal Precision via Integer Cents
- **Decision:** Multiply all database decimal amounts by `100` before calculating in JS, and store them using fixed-point values.
- **Rationale:** JavaScript's floating-point math (`0.1 + 0.2 === 0.30000000000000004`) causes balance discrepancies. Storing and calculating totals using integers (cents) ensures bulletproof balance audits.

## 4. Greedy Netting Algorithm for Debt Simplification
- **Decision:** Implement a greedy heuristic algorithm to resolve balances.
- **Rationale:** Minimizing transaction counts is an NP-complete problem. The greedy algorithm (matching largest debtor with largest creditor) runs in $O(N \log N)$ and is highly effective for group sizes of $N = 6$.

## 5. CSV Stream Processing
- **Decision:** Process the file row-by-row using `csv-parser` instead of loading the entire file into memory.
- **Rationale:** Streaming maintains a flat memory profile and scales safely if sheet sizes grow.
