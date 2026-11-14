export type TransactionType = 'expense' | 'income' | 'refund' | 'transfer' | 'adjustment';
export type GroupRole = 'admin' | 'member';
export type SettlementStatus = 'outstanding' | 'partially_settled' | 'settled' | 'disputed';
export type SplitMethod = 'equal' | 'exact' | 'percentage' | 'shares';

export interface User {
  id: string;
  name: string;
  email: string;
  default_currency: string;
  avatar_url?: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  currency: string;
  creator_id: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  token: string;
  created_by: string;
  expires_at: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  user_id?: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  title: string;
  amount_minor: number;
  currency: string;
  category_id?: string | null;
  payer_id: string;
  group_id?: string | null;
  payment_method?: string;
  notes?: string | null;
  occurred_at: string;
  deleted_at?: string | null;
  created_by: string;
  created_at: string;
}

export interface TransactionSplit {
  id: string;
  transaction_id: string;
  user_id: string;
  share_minor: number;
  created_at: string;
}

export interface Settlement {
  id: string;
  group_id?: string | null;
  sender_id: string;
  recipient_id: string;
  amount_minor: number;
  currency: string;
  method: string;
  reference?: string | null;
  status: SettlementStatus;
  settled_at: string;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id?: string | null;
  limit_minor: number;
  period: 'weekly' | 'monthly' | 'yearly';
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, any>;
  read_at?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  action: 'insert' | 'update' | 'soft_delete' | 'restore';
  record_type: 'transaction' | 'settlement' | 'group' | 'split';
  record_id: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  created_at: string;
}

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

export interface RecurringBill {
  id: string;
  title: string;
  amount_minor: number;
  currency: string;
  category_id?: string | null;
  payer_id: string;
  group_id?: string | null;
  frequency: RecurringFrequency;
  due_day: number; // 1 to 31 (day of month) or 1 to 7 (day of week)
  notes?: string | null;
  auto_post: boolean;
  last_posted_at?: string | null;
  splits: { user_id: string; share_minor: number }[];
  created_at: string;
}

export interface UserReimbursementVelocity {
  user_id: string;
  name: string;
  avatar_url?: string | null;
  /** Average repayment lag in days; null when there is no history to measure. */
  avg_lag_days: number | null;
  /** Display text: "3.5 days" or "n/a" when there is no history. */
  avg_lag_label: string;
  total_settlements_count: number;
  tier: 'speedy' | 'average' | 'lagging' | 'unknown'; // <= 2.5 days, <= 7 days, > 7 days, no history
  current_owed_minor: number;
}

export interface CashFlowExposureMetrics {
  total_fronted_minor: number; // Total user has paid for group expenses
  total_recovered_minor: number; // Total user has received back via settlements
  outstanding_exposure_minor: number; // Still waiting to be paid back
  personal_consumption_minor: number; // User's own fair share of expenses
  top_lagging_user?: UserReimbursementVelocity | null;
}
