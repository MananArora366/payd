-- Payd (Voice-First Expense & Group Tracker) Initial Schema
-- Enforces integer minor units, RLS policies, audit logs, and 11 core tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    default_currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. GROUPS
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. GROUP MEMBERS
CREATE TABLE IF NOT EXISTS public.group_members (
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (group_id, user_id)
);

-- 4. GROUP INVITES
CREATE TABLE IF NOT EXISTS public.group_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Tag',
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE, -- null for system defaults
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. TRANSACTIONS
-- Invariant: amount_minor is strictly an integer in minor units (fils/cents). No floats.
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('expense', 'income', 'refund', 'transfer', 'adjustment')),
    title TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    payer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    payment_method VARCHAR(50) DEFAULT 'Card',
    notes TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ, -- soft delete for reversibility and audit tracking
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. TRANSACTION SPLITS
-- Invariant: sum of share_minor for a transaction must equal transactions.amount_minor
CREATE TABLE IF NOT EXISTS public.transaction_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    share_minor BIGINT NOT NULL CHECK (share_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(transaction_id, user_id)
);

-- 8. SETTLEMENTS (Repayments are recorded here, NEVER as expenses)
CREATE TABLE IF NOT EXISTS public.settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    recipient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'AED',
    method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    reference TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'settled' CHECK (status IN ('outstanding', 'partially_settled', 'settled', 'disputed')),
    settled_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. BUDGETS
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE, -- null for overall user budget
    limit_minor BIGINT NOT NULL CHECK (limit_minor > 0),
    period VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly', 'monthly', 'yearly')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, category_id, period)
);

-- 10. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- e.g. 'insert', 'update', 'soft_delete', 'restore'
    record_type VARCHAR(50) NOT NULL, -- e.g. 'transaction', 'settlement', 'group'
    record_id UUID NOT NULL,
    before JSONB,
    after JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_payer ON public.transactions(payer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_group ON public.transactions(group_id);
CREATE INDEX IF NOT EXISTS idx_transactions_occurred ON public.transactions(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_splits_txn ON public.transaction_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_splits_user ON public.transaction_splits(user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group ON public.settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_sender_recipient ON public.settlements(sender_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_audit_record ON public.audit_logs(record_type, record_id);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Categories RLS: read system defaults OR user's own categories
CREATE POLICY categories_select_policy ON public.categories
    FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY categories_insert_policy ON public.categories
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users RLS: authenticated users can read all users (to select payers/recipients) and update themselves
CREATE POLICY users_select_policy ON public.users
    FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY users_update_policy ON public.users
    FOR UPDATE USING (id = auth.uid());

-- Groups & Members RLS
CREATE POLICY groups_select_policy ON public.groups
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = groups.id
            AND group_members.user_id = auth.uid()
        ) OR creator_id = auth.uid()
    );

CREATE POLICY groups_insert_policy ON public.groups
    FOR INSERT WITH CHECK (creator_id = auth.uid());

CREATE POLICY group_members_select_policy ON public.group_members
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = group_members.group_id
            AND gm.user_id = auth.uid()
        )
    );

-- Transactions RLS: Payer, Creator, or group members can view
CREATE POLICY transactions_select_policy ON public.transactions
    FOR SELECT USING (
        payer_id = auth.uid() OR
        created_by = auth.uid() OR
        (group_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = transactions.group_id
            AND group_members.user_id = auth.uid()
        ))
    );

CREATE POLICY transactions_insert_policy ON public.transactions
    FOR INSERT WITH CHECK (created_by = auth.uid());

-- Splits RLS
CREATE POLICY splits_select_policy ON public.transaction_splits
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = transaction_splits.transaction_id
            AND (t.payer_id = auth.uid() OR t.created_by = auth.uid())
        )
    );

-- Settlements RLS: Sender or Recipient can view
CREATE POLICY settlements_select_policy ON public.settlements
    FOR SELECT USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY settlements_insert_policy ON public.settlements
    FOR INSERT WITH CHECK (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Budgets RLS
CREATE POLICY budgets_select_policy ON public.budgets
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY budgets_insert_update_policy ON public.budgets
    FOR ALL USING (user_id = auth.uid());

-- Notifications RLS
CREATE POLICY notifications_all_policy ON public.notifications
    FOR ALL USING (user_id = auth.uid());

-- Audit Logs RLS: User can read logs they acted on
CREATE POLICY audit_logs_select_policy ON public.audit_logs
    FOR SELECT USING (actor_id = auth.uid());
