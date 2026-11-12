import { User, Group, GroupMember, Category, Transaction, TransactionSplit, Settlement, Budget, RecurringBill } from '@/types/database';

export const INITIAL_USERS: User[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Manan Arora',
    email: 'manan@payd.app',
    default_currency: 'AED',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Rahul',
    email: 'rahul@payd.app',
    default_currency: 'AED',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    created_at: new Date(Date.now() - 28 * 86400000).toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Sarah',
    email: 'sarah@payd.app',
    default_currency: 'AED',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Priya',
    email: 'priya@payd.app',
    default_currency: 'AED',
    avatar_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
];

export const INITIAL_CATEGORIES: Category[] = [
  { id: 'c0000001-0000-0000-0000-000000000001', name: 'Food and dining', icon: 'UtensilsCrossed', created_at: new Date().toISOString() },
  { id: 'c0000002-0000-0000-0000-000000000002', name: 'Groceries', icon: 'ShoppingCart', created_at: new Date().toISOString() },
  { id: 'c0000003-0000-0000-0000-000000000003', name: 'Transportation', icon: 'Car', created_at: new Date().toISOString() },
  { id: 'c0000004-0000-0000-0000-000000000004', name: 'Shopping', icon: 'ShoppingBag', created_at: new Date().toISOString() },
  { id: 'c0000005-0000-0000-0000-000000000005', name: 'Entertainment', icon: 'Film', created_at: new Date().toISOString() },
  { id: 'c0000006-0000-0000-0000-000000000006', name: 'Rent and accommodation', icon: 'Home', created_at: new Date().toISOString() },
  { id: 'c0000007-0000-0000-0000-000000000007', name: 'Utilities and bills', icon: 'Zap', created_at: new Date().toISOString() },
  { id: 'c0000008-0000-0000-0000-000000000008', name: 'Healthcare', icon: 'HeartPulse', created_at: new Date().toISOString() },
  { id: 'c0000009-0000-0000-0000-000000000009', name: 'Education', icon: 'GraduationCap', created_at: new Date().toISOString() },
  { id: 'c0000010-0000-0000-0000-000000000010', name: 'Travel', icon: 'Plane', created_at: new Date().toISOString() },
  { id: 'c0000011-0000-0000-0000-000000000011', name: 'Subscriptions', icon: 'Repeat', created_at: new Date().toISOString() },
  { id: 'c0000012-0000-0000-0000-000000000012', name: 'Other', icon: 'MoreHorizontal', created_at: new Date().toISOString() },
];

export const INITIAL_GROUPS: Group[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Dubai Flatmates',
    description: 'Marina apartment rent & shared groceries',
    currency: 'AED',
    creator_id: '11111111-1111-1111-1111-111111111111',
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Hatta Road Trip',
    description: 'Weekend camping, fuel & barbecue snacks',
    currency: 'AED',
    creator_id: '22222222-2222-2222-2222-222222222222',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

export const INITIAL_GROUP_MEMBERS: GroupMember[] = [
  { group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', user_id: '11111111-1111-1111-1111-111111111111', role: 'admin', joined_at: new Date().toISOString() },
  { group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', user_id: '22222222-2222-2222-2222-222222222222', role: 'member', joined_at: new Date().toISOString() },
  { group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', user_id: '33333333-3333-3333-3333-333333333333', role: 'member', joined_at: new Date().toISOString() },
  { group_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', user_id: '11111111-1111-1111-1111-111111111111', role: 'member', joined_at: new Date().toISOString() },
  { group_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', user_id: '22222222-2222-2222-2222-222222222222', role: 'admin', joined_at: new Date().toISOString() },
  { group_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', user_id: '44444444-4444-4444-4444-444444444444', role: 'member', joined_at: new Date().toISOString() },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 't0000001-0000-0000-0000-000000000001',
    type: 'expense',
    title: 'Dinner at Al Hallab',
    amount_minor: 10000, // 100.00 AED
    currency: 'AED',
    category_id: 'c0000001-0000-0000-0000-000000000001',
    payer_id: '11111111-1111-1111-1111-111111111111',
    group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    payment_method: 'Card',
    notes: 'Dinner with flatmates, equal split',
    occurred_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    created_by: '11111111-1111-1111-1111-111111111111',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 't0000002-0000-0000-0000-000000000002',
    type: 'expense',
    title: 'Carrefour Supermarket',
    amount_minor: 24000, // 240.00 AED
    currency: 'AED',
    category_id: 'c0000002-0000-0000-0000-000000000002',
    payer_id: '22222222-2222-2222-2222-222222222222',
    group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    payment_method: 'Card',
    notes: 'Weekly grocery supplies',
    occurred_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    created_by: '22222222-2222-2222-2222-222222222222',
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 't0000003-0000-0000-0000-000000000003',
    type: 'expense',
    title: 'Specialty Coffee',
    amount_minor: 2200, // 22.00 AED
    currency: 'AED',
    category_id: 'c0000001-0000-0000-0000-000000000001',
    payer_id: '11111111-1111-1111-1111-111111111111',
    group_id: null,
    payment_method: 'Apple Pay',
    notes: 'Morning flat white',
    occurred_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    created_by: '11111111-1111-1111-1111-111111111111',
    created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
  },
  {
    id: 't0000004-0000-0000-0000-000000000004',
    type: 'income',
    title: 'Consulting Monthly Payout',
    amount_minor: 1500000, // 15,000.00 AED
    currency: 'AED',
    category_id: 'c0000012-0000-0000-0000-000000000012',
    payer_id: '11111111-1111-1111-1111-111111111111',
    group_id: null,
    payment_method: 'Bank Transfer',
    notes: 'Client retainer',
    occurred_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    created_by: '11111111-1111-1111-1111-111111111111',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

export const INITIAL_SPLITS: TransactionSplit[] = [
  // Dinner 100.00 AED split 3 ways: 3334 (Manan), 3333 (Rahul), 3333 (Sarah)
  { id: 'sp1', transaction_id: 't0000001-0000-0000-0000-000000000001', user_id: '11111111-1111-1111-1111-111111111111', share_minor: 3334, created_at: new Date().toISOString() },
  { id: 'sp2', transaction_id: 't0000001-0000-0000-0000-000000000001', user_id: '22222222-2222-2222-2222-222222222222', share_minor: 3333, created_at: new Date().toISOString() },
  { id: 'sp3', transaction_id: 't0000001-0000-0000-0000-000000000001', user_id: '33333333-3333-3333-3333-333333333333', share_minor: 3333, created_at: new Date().toISOString() },
  // Carrefour 240.00 AED split 3 ways: 8000 each
  { id: 'sp4', transaction_id: 't0000002-0000-0000-0000-000000000002', user_id: '11111111-1111-1111-1111-111111111111', share_minor: 8000, created_at: new Date().toISOString() },
  { id: 'sp5', transaction_id: 't0000002-0000-0000-0000-000000000002', user_id: '22222222-2222-2222-2222-222222222222', share_minor: 8000, created_at: new Date().toISOString() },
  { id: 'sp6', transaction_id: 't0000002-0000-0000-0000-000000000002', user_id: '33333333-3333-3333-3333-333333333333', share_minor: 8000, created_at: new Date().toISOString() },
  // Coffee personal
  { id: 'sp7', transaction_id: 't0000003-0000-0000-0000-000000000003', user_id: '11111111-1111-1111-1111-111111111111', share_minor: 2200, created_at: new Date().toISOString() },
  // Income personal
  { id: 'sp8', transaction_id: 't0000004-0000-0000-0000-000000000004', user_id: '11111111-1111-1111-1111-111111111111', share_minor: 1500000, created_at: new Date().toISOString() },
];

export const INITIAL_SETTLEMENTS: Settlement[] = [
  {
    id: 's0000001-0000-0000-0000-000000000001',
    group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    sender_id: '33333333-3333-3333-3333-333333333333', // Sarah
    recipient_id: '11111111-1111-1111-1111-111111111111', // Manan
    amount_minor: 5000, // 50.00 AED
    currency: 'AED',
    method: 'Careem Pay / Aani',
    reference: 'Dinner payback',
    status: 'settled',
    settled_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 's0000002-0000-0000-0000-000000000002',
    group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    sender_id: '22222222-2222-2222-2222-222222222222', // Rahul
    recipient_id: '11111111-1111-1111-1111-111111111111', // Manan
    amount_minor: 3333, // 33.33 AED
    currency: 'AED',
    method: 'Bank Transfer',
    reference: 'Split settlement',
    status: 'settled',
    settled_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
  },
];

export const INITIAL_RECURRING_BILLS: RecurringBill[] = [
  {
    id: 'rec00001-0000-0000-0000-000000000001',
    title: 'Du 5G Home High-Speed Wi-Fi',
    amount_minor: 38900, // AED 389.00
    currency: 'AED',
    category_id: 'c0000007-0000-0000-0000-000000000007', // Utilities and bills
    payer_id: '11111111-1111-1111-1111-111111111111', // Manan
    group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', // Dubai Flatmates
    frequency: 'monthly',
    due_day: 1, // 1st of month
    notes: 'Du Unlimited 800 Mbps Fiber account #1092842',
    auto_post: false,
    last_posted_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    splits: [
      { user_id: '11111111-1111-1111-1111-111111111111', share_minor: 12967 },
      { user_id: '22222222-2222-2222-2222-222222222222', share_minor: 12967 },
      { user_id: '33333333-3333-3333-3333-333333333333', share_minor: 12966 },
    ],
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
  {
    id: 'rec00002-0000-0000-0000-000000000002',
    title: 'DEWA Utilities (Electricity & Water)',
    amount_minor: 75000, // AED 750.00
    currency: 'AED',
    category_id: 'c0000007-0000-0000-0000-000000000007',
    payer_id: '33333333-3333-3333-3333-333333333333', // Sarah
    group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    frequency: 'monthly',
    due_day: 15, // 15th of month
    notes: 'DEWA Premise #20049182',
    auto_post: false,
    last_posted_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    splits: [
      { user_id: '11111111-1111-1111-1111-111111111111', share_minor: 25000 },
      { user_id: '22222222-2222-2222-2222-222222222222', share_minor: 25000 },
      { user_id: '33333333-3333-3333-3333-333333333333', share_minor: 25000 },
    ],
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
  {
    id: 'rec00003-0000-0000-0000-000000000003',
    title: 'Housekeeping & Deep Cleaning',
    amount_minor: 24000, // AED 240.00
    currency: 'AED',
    category_id: 'c0000007-0000-0000-0000-000000000007',
    payer_id: '22222222-2222-2222-2222-222222222222', // Rahul
    group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    frequency: 'monthly',
    due_day: 10,
    notes: 'Bi-weekly apartment cleaning service',
    auto_post: false,
    last_posted_at: null,
    splits: [
      { user_id: '11111111-1111-1111-1111-111111111111', share_minor: 8000 },
      { user_id: '22222222-2222-2222-2222-222222222222', share_minor: 8000 },
      { user_id: '33333333-3333-3333-3333-333333333333', share_minor: 8000 },
    ],
    created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
  },
];

export const INITIAL_BUDGETS: Budget[] = [
  {
    id: 'b0000001-0000-0000-0000-000000000001',
    user_id: '11111111-1111-1111-1111-111111111111',
    category_id: null, // overall monthly budget
    limit_minor: 500000, // 5,000.00 AED
    period: 'monthly',
    created_at: new Date().toISOString(),
  },
  {
    id: 'b0000002-0000-0000-0000-000000000002',
    user_id: '11111111-1111-1111-1111-111111111111',
    category_id: 'c0000001-0000-0000-0000-000000000001', // Food and dining
    limit_minor: 120000, // 1,200.00 AED
    period: 'monthly',
    created_at: new Date().toISOString(),
  },
];
