import {
  calculateNetBalances,
  calculateBilateralDebts,
  simplifyDebts,
  splitEqual,
  formatMinorUnits,
  parseMajorToMinor,
} from '@/lib/ledger';
import {
  INITIAL_USERS,
  INITIAL_GROUPS,
  INITIAL_TRANSACTIONS,
  INITIAL_SPLITS,
  INITIAL_SETTLEMENTS,
  INITIAL_RECURRING_BILLS,
} from '@/lib/store/initialData';

export interface McpToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Payd Core Mock MCP Tools
 * Operates on Payd's deterministic financial ledger engine.
 */

// 1. Get Balances
export function handleGetBalances(groupId?: string): McpToolResult {
  const users = INITIAL_USERS;
  let txns = INITIAL_TRANSACTIONS.filter((t) => !t.deleted_at);
  let splits = INITIAL_SPLITS;
  let settlements = INITIAL_SETTLEMENTS;

  let groupName = 'All Ledgers (Global)';
  if (groupId) {
    const grp = INITIAL_GROUPS.find((g) => g.id === groupId || g.name.toLowerCase().includes(groupId.toLowerCase()));
    if (grp) {
      groupName = grp.name;
      txns = txns.filter((t) => t.group_id === grp.id);
      const txnIds = new Set(txns.map((t) => t.id));
      splits = splits.filter((s) => txnIds.has(s.transaction_id));
      settlements = settlements.filter((s) => s.group_id === grp.id);
    }
  }

  const netBalances = calculateNetBalances(txns, splits, settlements);
  const bilateral = calculateBilateralDebts(txns, splits, settlements);

  const formattedBalances = Object.entries(netBalances).map(([userId, minor]) => {
    const u = users.find((usr) => usr.id === userId);
    return {
      userId,
      name: u?.name || 'Unknown',
      balanceMinor: minor,
      balanceFormatted: formatMinorUnits(minor, 'AED'),
      status: minor > 0 ? 'Gets back' : minor < 0 ? 'Owes' : 'Settled',
    };
  });

  const debtsList: any[] = [];
  for (const [debtorId, credMap] of bilateral.entries()) {
    const debtor = users.find((u) => u.id === debtorId);
    for (const [creditorId, amount] of credMap.entries()) {
      const creditor = users.find((u) => u.id === creditorId);
      debtsList.push({
        from: debtor?.name || debtorId,
        to: creditor?.name || creditorId,
        amountMinor: amount,
        amountFormatted: formatMinorUnits(amount, 'AED'),
      });
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            scope: groupName,
            currency: 'AED',
            netBalances: formattedBalances,
            bilateralDebts: debtsList,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  };
}

// 2. Simplify Debts
export function handleSimplifyDebts(groupId: string): McpToolResult {
  const grp = INITIAL_GROUPS.find(
    (g) => g.id === groupId || g.name.toLowerCase().includes(groupId.toLowerCase())
  ) || INITIAL_GROUPS[0];

  const groupTxns = INITIAL_TRANSACTIONS.filter((t) => t.group_id === grp.id && !t.deleted_at);
  const groupTxnIds = new Set(groupTxns.map((t) => t.id));
  const groupSplits = INITIAL_SPLITS.filter((s) => groupTxnIds.has(s.transaction_id));
  const groupSettlements = INITIAL_SETTLEMENTS.filter((s) => s.group_id === grp.id);

  const netBalances = calculateNetBalances(groupTxns, groupSplits, groupSettlements);
  const simplified = simplifyDebts(netBalances);

  const results = simplified.map((s) => {
    const fromUser = INITIAL_USERS.find((u) => u.id === s.fromUserId);
    const toUser = INITIAL_USERS.find((u) => u.id === s.toUserId);
    return {
      from: fromUser?.name || s.fromUserId,
      to: toUser?.name || s.toUserId,
      amountMinor: s.amountMinor,
      amountFormatted: formatMinorUnits(s.amountMinor, grp.currency),
    };
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            group: grp.name,
            currency: grp.currency,
            originalDebtsCount: groupTxns.length,
            simplifiedSettlementsCount: results.length,
            transactions: results,
            algorithm: 'Greedy Minimum-Cash-Flow Invariant Solver',
          },
          null,
          2
        ),
      },
    ],
  };
}

// 3. Add Expense
export function handleAddExpense(params: {
  title: string;
  amount_aed: number;
  payer_name?: string;
  group_name?: string;
  participant_names?: string[];
}): McpToolResult {
  const amountMinor = Math.round(params.amount_aed * 100);
  if (amountMinor <= 0) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Amount must be greater than 0 AED' }],
    };
  }

  const payer =
    INITIAL_USERS.find((u) => u.name.toLowerCase().includes((params.payer_name || 'Manan').toLowerCase())) ||
    INITIAL_USERS[0];

  const grp = params.group_name
    ? INITIAL_GROUPS.find((g) => g.name.toLowerCase().includes(params.group_name!.toLowerCase()))
    : null;

  let participants = INITIAL_USERS.slice(0, 3);
  if (params.participant_names && params.participant_names.length > 0) {
    const matched = INITIAL_USERS.filter((u) =>
      params.participant_names!.some((name) => u.name.toLowerCase().includes(name.toLowerCase()))
    );
    if (matched.length > 0) participants = matched;
  }

  const splitMap = splitEqual(
    amountMinor,
    participants.map((p) => p.id)
  );

  const splitsSummary = Object.entries(splitMap).map(([uid, share]) => {
    const user = INITIAL_USERS.find((u) => u.id === uid);
    return {
      user: user?.name,
      shareMinor: share,
      shareFormatted: formatMinorUnits(share, 'AED'),
    };
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            transactionId: `txn-mcp-${Date.now()}`,
            title: params.title,
            amountMinor,
            amountFormatted: formatMinorUnits(amountMinor, 'AED'),
            payer: payer.name,
            group: grp?.name || 'Personal',
            splits: splitsSummary,
            currency: 'AED',
            invariantChecked: 'Sum of splits == Total amount exactly (Zero-Loss)',
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  };
}

// 4. Check Reimbursement Lag
export function handleCheckReimbursementLag(): McpToolResult {
  const metrics = [
    {
      name: 'Sarah',
      avgLagDays: 1.8,
      tier: 'speedy',
      badge: 'Speedy ⚡',
      currentOwedFormatted: 'AED 0.00',
    },
    {
      name: 'Rahul',
      avgLagDays: 8.5,
      tier: 'lagging',
      badge: 'Lagging 🐢',
      currentOwedFormatted: 'AED 80.00',
    },
    {
      name: 'Priya',
      avgLagDays: 3.2,
      tier: 'average',
      badge: 'Average ⏱️',
      currentOwedFormatted: 'AED 0.00',
    },
  ];

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            totalFrontedCapitalFormatted: 'AED 2,340.00',
            recoveredCapitalFormatted: 'AED 1,490.00',
            outstandingExposureFormatted: 'AED 850.00',
            reimbursementTurnaround: metrics,
            recommendation: 'Send friendly WhatsApp nudge to Rahul to recover AED 80.00 outstanding.',
          },
          null,
          2
        ),
      },
    ],
  };
}

// 5. Spin Coffee Roulette
export function handleSpinCoffeeRoulette(params: {
  amount_aed?: number;
  mode?: 'debt_weighted' | 'equal';
}): McpToolResult {
  const amountAed = params.amount_aed || 45.0;
  const mode = params.mode || 'debt_weighted';
  const participants = INITIAL_USERS.slice(0, 3); // Manan, Rahul, Sarah

  // In debt-weighted mode, Rahul owes money so he gets higher probability
  const weights =
    mode === 'debt_weighted'
      ? [
          { user: participants[0], weight: 1, probability: '20%' }, // Manan
          { user: participants[1], weight: 3, probability: '60%' }, // Rahul (owes debt)
          { user: participants[2], weight: 1, probability: '20%' }, // Sarah
        ]
      : [
          { user: participants[0], weight: 1, probability: '33.3%' },
          { user: participants[1], weight: 1, probability: '33.3%' },
          { user: participants[2], weight: 1, probability: '33.3%' },
        ];

  // Pick winner based on weights (default Rahul for debt justice demonstration)
  const winner = participants[1]; // Rahul

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            selectedPayer: winner.name,
            reason:
              mode === 'debt_weighted'
                ? `${winner.name} was selected via Smart Debt-Weighted Roulette (highest outstanding group balance).`
                : `${winner.name} was selected via Pure Chance Roulette.`,
            billAmountFormatted: formatMinorUnits(Math.round(amountAed * 100), 'AED'),
            participantsOdds: weights.map((w) => ({
              name: w.user.name,
              probability: w.probability,
            })),
            ledgerAction: `Created coffee transaction of AED ${amountAed.toFixed(2)} paid by ${winner.name}, split equally among ${participants.length} friends.`,
          },
          null,
          2
        ),
      },
    ],
  };
}

// 6. Trigger Recurring Bill Split
export function handleTriggerRecurringSplit(subscriptionName?: string): McpToolResult {
  const bill = subscriptionName
    ? INITIAL_RECURRING_BILLS.find((b) =>
        b.title.toLowerCase().includes(subscriptionName.toLowerCase())
      ) || INITIAL_RECURRING_BILLS[0]
    : INITIAL_RECURRING_BILLS[0];

  const payer = INITIAL_USERS.find((u) => u.id === bill.payer_id);
  const grp = INITIAL_GROUPS.find((g) => g.id === bill.group_id);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            success: true,
            postedSubscription: bill.title,
            frequency: bill.frequency,
            amountMinor: bill.amount_minor,
            amountFormatted: formatMinorUnits(bill.amount_minor, bill.currency),
            payer: payer?.name,
            group: grp?.name,
            dueDay: bill.due_day,
            splits: bill.splits.map((s) => {
              const u = INITIAL_USERS.find((usr) => usr.id === s.user_id);
              return {
                member: u?.name,
                shareMinor: s.share_minor,
                shareFormatted: formatMinorUnits(s.share_minor, bill.currency),
              };
            }),
            postedAt: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  };
}
