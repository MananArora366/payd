-- Seed Data for Payd (Voice-First Expense & Group Tracker)

-- 1. Standard Categories
INSERT INTO public.categories (id, name, icon, user_id) VALUES
    ('c0000001-0000-0000-0000-000000000001', 'Food and dining', 'UtensilsCrossed', NULL),
    ('c0000002-0000-0000-0000-000000000002', 'Groceries', 'ShoppingCart', NULL),
    ('c0000003-0000-0000-0000-000000000003', 'Transportation', 'Car', NULL),
    ('c0000004-0000-0000-0000-000000000004', 'Shopping', 'ShoppingBag', NULL),
    ('c0000005-0000-0000-0000-000000000005', 'Entertainment', 'Film', NULL),
    ('c0000006-0000-0000-0000-000000000006', 'Rent and accommodation', 'Home', NULL),
    ('c0000007-0000-0000-0000-000000000007', 'Utilities and bills', 'Zap', NULL),
    ('c0000008-0000-0000-0000-000000000008', 'Healthcare', 'HeartPulse', NULL),
    ('c0000009-0000-0000-0000-000000000009', 'Education', 'GraduationCap', NULL),
    ('c0000010-0000-0000-0000-000000000010', 'Travel', 'Plane', NULL),
    ('c0000011-0000-0000-0000-000000000011', 'Subscriptions', 'Repeat', NULL),
    ('c0000012-0000-0000-0000-000000000012', 'Other', 'MoreHorizontal', NULL)
ON CONFLICT (id) DO NOTHING;

-- 2. Demo Users
INSERT INTO public.users (id, name, email, default_currency, avatar_url) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Prakarsh', 'prakarsh@payd.app', 'AED', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'),
    ('22222222-2222-2222-2222-222222222222', 'Rahul', 'rahul@payd.app', 'AED', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80'),
    ('33333333-3333-3333-3333-333333333333', 'Sarah', 'sarah@payd.app', 'AED', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80'),
    ('44444444-4444-4444-4444-444444444444', 'Priya', 'priya@payd.app', 'AED', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80')
ON CONFLICT (id) DO NOTHING;

-- 3. Groups
INSERT INTO public.groups (id, name, description, currency, creator_id) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Dubai Flatmates', 'Marina apartment rent & shared groceries', 'AED', '11111111-1111-1111-1111-111111111111'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hatta Road Trip', 'Weekend camping, fuel & barbecue snacks', 'AED', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- 4. Group Members
INSERT INTO public.group_members (group_id, user_id, role) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'member'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'admin'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'member')
ON CONFLICT (group_id, user_id) DO NOTHING;

-- 5. Group Invites
INSERT INTO public.group_invites (id, group_id, token, created_by, expires_at) VALUES
    ('i0000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dubai-marina-2026', '11111111-1111-1111-1111-111111111111', timezone('utc'::text, now()) + INTERVAL '30 days'),
    ('i0000002-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hatta-camp-2026', '22222222-2222-2222-2222-222222222222', timezone('utc'::text, now()) + INTERVAL '30 days')
ON CONFLICT (id) DO NOTHING;

-- 6. Budgets (Monthly 5,000 AED limit for Prakarsh)
INSERT INTO public.budgets (id, user_id, category_id, limit_minor, period) VALUES
    ('b0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', NULL, 500000, 'monthly'),
    ('b0000002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'c0000001-0000-0000-0000-000000000001', 120000, 'monthly')
ON CONFLICT (id) DO NOTHING;

-- 7. Transactions
-- Example 1: 3-way split dinner: 100.00 AED total (10000 minor) paid by Prakarsh, split across Prakarsh, Rahul, Sarah
-- Invariant check: 3334 + 3333 + 3333 = 10000 minor units
INSERT INTO public.transactions (id, type, title, amount_minor, currency, category_id, payer_id, group_id, payment_method, notes, occurred_at, created_by) VALUES
    ('t0000001-0000-0000-0000-000000000001', 'expense', 'Dinner at Al Hallab', 10000, 'AED', 'c0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Card', 'Lebanese dinner with flatmates', timezone('utc'::text, now()) - INTERVAL '2 days', '11111111-1111-1111-1111-111111111111');

INSERT INTO public.transaction_splits (transaction_id, user_id, share_minor) VALUES
    ('t0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 3334),
    ('t0000001-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 3333),
    ('t0000001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 3333)
ON CONFLICT (transaction_id, user_id) DO NOTHING;

-- Example 2: Groceries: 240.00 AED total paid by Rahul, split between Rahul, Prakarsh, Sarah (80.00 AED each = 8000 minor)
INSERT INTO public.transactions (id, type, title, amount_minor, currency, category_id, payer_id, group_id, payment_method, notes, occurred_at, created_by) VALUES
    ('t0000002-0000-0000-0000-000000000002', 'expense', 'Carrefour Supermarket', 24000, 'AED', 'c0000002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Card', 'Weekly grocery run', timezone('utc'::text, now()) - INTERVAL '1 day', '22222222-2222-2222-2222-222222222222');

INSERT INTO public.transaction_splits (transaction_id, user_id, share_minor) VALUES
    ('t0000002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 8000),
    ('t0000002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 8000),
    ('t0000002-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 8000)
ON CONFLICT (transaction_id, user_id) DO NOTHING;

-- Example 3: Personal Coffee Expense (no group): 22.00 AED paid by Prakarsh
INSERT INTO public.transactions (id, type, title, amount_minor, currency, category_id, payer_id, group_id, payment_method, notes, occurred_at, created_by) VALUES
    ('t0000003-0000-0000-0000-000000000003', 'expense', 'Specialty Coffee', 2200, 'AED', 'c0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', NULL, 'Apple Pay', 'Morning flat white', timezone('utc'::text, now()) - INTERVAL '4 hours', '11111111-1111-1111-1111-111111111111');

INSERT INTO public.transaction_splits (transaction_id, user_id, share_minor) VALUES
    ('t0000003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 2200)
ON CONFLICT (transaction_id, user_id) DO NOTHING;

-- Example 4: Income: Salary 15,000.00 AED
INSERT INTO public.transactions (id, type, title, amount_minor, currency, category_id, payer_id, group_id, payment_method, notes, occurred_at, created_by) VALUES
    ('t0000004-0000-0000-0000-000000000004', 'income', 'Consulting Monthly Payout', 1500000, 'AED', 'c0000012-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', NULL, 'Bank Transfer', 'November retainer', timezone('utc'::text, now()) - INTERVAL '3 days', '11111111-1111-1111-1111-111111111111');

INSERT INTO public.transaction_splits (transaction_id, user_id, share_minor) VALUES
    ('t0000004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 1500000)
ON CONFLICT (transaction_id, user_id) DO NOTHING;
