-- PostgreSQL DDL Schema for Shared Expenses App

-- Enable UUID extension if needed (good practice for ids, but standard SERIAL/BIGSERIAL is fine too. Let's use standard UUID or BIGSERIAL. Let's use standard UUID for robust references, or standard SERIAL for simplicity. Let's use UUID)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Groups Table
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Group Members Table (Tracks dynamic membership over time)
CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE, -- NULL means they are currently a member
    CONSTRAINT chk_dates CHECK (left_at IS NULL OR left_at >= joined_at),
    UNIQUE (group_id, user_id, joined_at)
);

-- Import Sessions Table
CREATE TABLE IF NOT EXISTS import_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processed', 'failed'
    summary JSONB -- Audit metrics: total rows, successful, staged, anomalies
);

-- Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    paid_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    description VARCHAR(255) NOT NULL,
    expense_date TIMESTAMP WITH TIME ZONE NOT NULL,
    original_amount DECIMAL(12, 2) NOT NULL CHECK (original_amount >= 0),
    original_currency VARCHAR(3) NOT NULL, -- e.g., 'USD', 'EUR', 'INR'
    exchange_rate DECIMAL(12, 6) NOT NULL DEFAULT 1.0, -- Rate to convert to INR (final_amount = original_amount * exchange_rate)
    final_amount_inr DECIMAL(12, 2) NOT NULL CHECK (final_amount_inr >= 0),
    import_session_id UUID REFERENCES import_sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Expense Splits Table (who owes what)
CREATE TABLE IF NOT EXISTS expense_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    share_amount DECIMAL(12, 2) NOT NULL CHECK (share_amount >= 0),
    UNIQUE (expense_id, user_id)
);

-- Settlements Table (separate ledger for paying back)
CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    receiver_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    settled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    import_session_id UUID REFERENCES import_sessions(id) ON DELETE SET NULL,
    notes TEXT,
    CONSTRAINT chk_sender_receiver CHECK (sender_id <> receiver_id)
);

-- Staged Expenses Table (for manual validation & resolution before final write)
CREATE TABLE IF NOT EXISTS staged_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_session_id UUID REFERENCES import_sessions(id) ON DELETE CASCADE,
    raw_row_index INT, -- Visual index in spreadsheet for auditability
    raw_data JSONB NOT NULL, -- Full row details as a JSON object
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Anomaly Logs Table (explicitly logs issues with specific files or items)
CREATE TABLE IF NOT EXISTS anomaly_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_session_id UUID REFERENCES import_sessions(id) ON DELETE CASCADE,
    staged_expense_id UUID REFERENCES staged_expenses(id) ON DELETE SET NULL,
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    anomaly_type VARCHAR(100) NOT NULL, -- e.g. 'DUPLICATE', 'NEGATIVE_AMOUNT', 'INVALID_CURRENCY', 'MEMBERSHIP_MISMATCH'
    description TEXT NOT NULL,
    severity VARCHAR(50) DEFAULT 'warning', -- 'warning', 'critical'
    is_resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
