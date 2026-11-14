import { User, Group, GroupMember, Category, Transaction, TransactionSplit, Settlement, Budget, RecurringBill } from '@/types/database';

/** Offline initials avatar (silver disc, dark text) so demo people don't wear stock-photo faces. */
function initialsAvatar(name: string): string {
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#cdd2d8"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="48" font-weight="600" fill="#2a2e33">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const INITIAL_USERS: User[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Manan Arora',
    email: 'manan@payd.app',
    default_currency: 'AED',
    avatar_url: initialsAvatar('Manan Arora'),
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Prakarsh Thakur',
    email: 'prakarsh@payd.app',
    default_currency: 'AED',
    avatar_url: initialsAvatar('Prakarsh Thakur'),
    created_at: new Date(Date.now() - 28 * 86400000).toISOString(),
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Veer Nanwani',
    email: 'veer@payd.app',
    default_currency: 'AED',
    avatar_url: initialsAvatar('Veer Nanwani'),
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Aisha Rahman',
    email: 'aisha@payd.app',
    default_currency: 'AED',
    avatar_url: initialsAvatar('Aisha Rahman'),
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Omar Haddad',
    email: 'omar@payd.app',
    default_currency: 'AED',
    avatar_url: initialsAvatar('Omar Haddad'),
    created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    name: 'Zara Kapoor',
    email: 'zara@payd.app',
    default_currency: 'AED',
    avatar_url: initialsAvatar('Zara Kapoor'),
    created_at: new Date(Date.now() - 12 * 86400000).toISOString(),
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
  { group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', user_id: '55555555-5555-5555-5555-555555555555', role: 'member', joined_at: new Date().toISOString() },
  { group_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', user_id: '66666666-6666-6666-6666-666666666666', role: 'member', joined_at: new Date().toISOString() },
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
  {
    id: 't0000005-0000-0000-0000-000000000005',
    type: 'expense',
    title: 'IKEA living room furniture',
    amount_minor: 160000, // 1,600.00 AED
    currency: 'AED',
    category_id: 'c0000004-0000-0000-0000-000000000004',
    payer_id: '11111111-1111-1111-1111-111111111111',
    group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    payment_method: 'Card',
    notes: 'Sofa, rug and shelving for the flat, split 4 ways',
    occurred_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    created_by: '11111111-1111-1111-1111-111111111111',
    created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  },
  {
    id: 't0000006-0000-0000-0000-000000000006',
    type: 'expense',
    title: 'Hatta fuel & BBQ supplies',
    amount_minor: 52889, // 528.89 AED
    currency: 'AED',
    category_id: 'c0000010-0000-0000-0000-000000000010',
    payer_id: '11111111-1111-1111-1111-111111111111',
    group_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    payment_method: 'Card',
    notes: 'ENOC fuel and Spinneys BBQ run, split 4 ways',
    occurred_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    created_by: '11111111-1111-1111-1111-111111111111',
    created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
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
  // IKEA 1,600.00 AED split 4 ways in Dubai Flatmates: 400.00 each
  { id: 'sp9', transaction_id: 't0000005-0000-0000-0000-000000000005', user_id: '11111111-1111-1111-1111-111111111111', share_minor: 40000, created_at: new Date().toISOString() },
  { id: 'sp10', transaction_id: 't0000005-0000-0000-0000-000000000005', user_id: '22222222-2222-2222-2222-222222222222', share_minor: 40000, created_at: new Date().toISOString() },
  { id: 'sp11', transaction_id: 't0000005-0000-0000-0000-000000000005', user_id: '33333333-3333-3333-3333-333333333333', share_minor: 40000, created_at: new Date().toISOString() },
  { id: 'sp12', transaction_id: 't0000005-0000-0000-0000-000000000005', user_id: '55555555-5555-5555-5555-555555555555', share_minor: 40000, created_at: new Date().toISOString() },
  // Hatta fuel & BBQ 528.89 AED split 4 ways: 132.22 / 132.23 / 132.22 / 132.22
  { id: 'sp13', transaction_id: 't0000006-0000-0000-0000-000000000006', user_id: '11111111-1111-1111-1111-111111111111', share_minor: 13222, created_at: new Date().toISOString() },
  { id: 'sp14', transaction_id: 't0000006-0000-0000-0000-000000000006', user_id: '22222222-2222-2222-2222-222222222222', share_minor: 13223, created_at: new Date().toISOString() },
  { id: 'sp15', transaction_id: 't0000006-0000-0000-0000-000000000006', user_id: '44444444-4444-4444-4444-444444444444', share_minor: 13222, created_at: new Date().toISOString() },
  { id: 'sp16', transaction_id: 't0000006-0000-0000-0000-000000000006', user_id: '66666666-6666-6666-6666-666666666666', share_minor: 13222, created_at: new Date().toISOString() },
];

export const INITIAL_SETTLEMENTS: Settlement[] = [
  {
    id: 's0000001-0000-0000-0000-000000000001',
    group_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    sender_id: '33333333-3333-3333-3333-333333333333', // Sarah
    recipient_id: '11111111-1111-1111-1111-111111111111', // Manan
    amount_minor: 5000, // 50.00 AED
    currency: 'AED',
    method: 'Careem Pay',
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
    // Repays the dinner (2 days ago), so it must be dated after it: 36 hours ago.
    settled_at: new Date(Date.now() - 36 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 36 * 3600000).toISOString(),
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
