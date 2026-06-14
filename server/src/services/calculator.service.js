const db = require('../db/db');

// Helper to convert float to cents integer to avoid floating-point errors
function toCents(val) {
  return Math.round(parseFloat(val) * 100);
}

// Helper to convert cents back to display currency decimal
function fromCents(cents) {
  return cents / 100;
}

/**
 * Rohan's Requirement: Calculate exact user balance with an itemized audit ledger.
 * @param {string} userId - User UUID
 * @param {string} groupId - Group UUID
 */
async function getUserDetailedBalance(userId, groupId) {
  // 1. Fetch expenses paid by this user
  const paidExpensesRes = await db.query(
    `SELECT id, description, expense_date as date, final_amount_inr as amount 
     FROM expenses WHERE paid_by = $1 AND group_id = $2 ORDER BY date ASC`,
    [userId, groupId]
  );

  // 2. Fetch splits (what this user owes) for expenses in this group
  const owedSplitsRes = await db.query(
    `SELECT e.id as expense_id, e.description, e.expense_date as date, s.share_amount as amount 
     FROM expense_splits s
     JOIN expenses e ON s.expense_id = e.id
     WHERE s.user_id = $1 AND e.group_id = $2 ORDER BY date ASC`,
    [userId, groupId]
  );

  // 3. Fetch settlements sent by this user
  const sentSettlementsRes = await db.query(
    `SELECT id, notes as description, settled_at as date, amount, receiver_id 
     FROM settlements WHERE sender_id = $1 AND group_id = $2 ORDER BY date ASC`,
    [userId, groupId]
  );

  // 4. Fetch settlements received by this user
  const receivedSettlementsRes = await db.query(
    `SELECT id, notes as description, settled_at as date, amount, sender_id 
     FROM settlements WHERE receiver_id = $1 AND group_id = $2 ORDER BY date ASC`,
    [userId, groupId]
  );

  let totalPaidCents = 0;
  let totalOwedCents = 0;
  let totalSentCents = 0;
  let totalReceivedCents = 0;

  const ledger = [];

  // Populate Ledger & Sums
  paidExpensesRes.rows.forEach(row => {
    const cents = toCents(row.amount);
    totalPaidCents += cents;
    ledger.push({
      type: 'paid_expense',
      id: row.id,
      description: row.description,
      date: row.date,
      amount: parseFloat(row.amount),
      effect: '+'
    });
  });

  owedSplitsRes.rows.forEach(row => {
    const cents = toCents(row.amount);
    totalOwedCents += cents;
    ledger.push({
      type: 'owed_share',
      id: row.expense_id,
      description: `Share of: ${row.description}`,
      date: row.date,
      amount: parseFloat(row.amount),
      effect: '-'
    });
  });

  sentSettlementsRes.rows.forEach(row => {
    const cents = toCents(row.amount);
    totalSentCents += cents;
    ledger.push({
      type: 'settlement_sent',
      id: row.id,
      description: row.description || 'Repayment Sent',
      date: row.date,
      amount: parseFloat(row.amount),
      effect: '+'
    });
  });

  receivedSettlementsRes.rows.forEach(row => {
    const cents = toCents(row.amount);
    totalReceivedCents += cents;
    ledger.push({
      type: 'settlement_received',
      id: row.id,
      description: row.description || 'Repayment Received',
      date: row.date,
      amount: parseFloat(row.amount),
      effect: '-'
    });
  });

  // Sort ledger chronologically
  ledger.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Net Balance Equation: paid - owed + sent - received
  const netBalanceCents = totalPaidCents - totalOwedCents + totalSentCents - totalReceivedCents;

  return {
    userId,
    summary: {
      totalPaid: fromCents(totalPaidCents),
      totalOwed: fromCents(totalOwedCents),
      totalSent: fromCents(totalSentCents),
      totalReceived: fromCents(totalReceivedCents),
      netBalance: fromCents(netBalanceCents)
    },
    ledger
  };
}

/**
 * Aisha's Requirement: Greedy netting algorithm to simplify debts.
 * @param {string} groupId - Group UUID
 */
async function simplifyDebts(groupId) {
  // Get all members of the group
  const membersRes = await db.query(
    `SELECT u.id, u.name 
     FROM group_members gm
     JOIN users u ON gm.user_id = u.id
     WHERE gm.group_id = $1 AND gm.left_at IS NULL`,
    [groupId]
  );
  
  const members = membersRes.rows;
  const balances = [];

  // Calculate net balance for each member
  for (const member of members) {
    const detailed = await getUserDetailedBalance(member.id, groupId);
    balances.push({
      id: member.id,
      name: member.name,
      balanceCents: toCents(detailed.summary.netBalance)
    });
  }

  // Separate debtors and creditors
  // positive balance = creditor (someone owes them money)
  // negative balance = debtor (they owe money)
  const debtors = balances.filter(b => b.balanceCents < 0);
  const creditors = balances.filter(b => b.balanceCents > 0);

  // Sort: Debtors ascending (most negative first), Creditors descending (most positive first)
  debtors.sort((a, b) => a.balanceCents - b.balanceCents);
  creditors.sort((a, b) => b.balanceCents - a.balanceCents);

  const transactions = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];

    const debtAmount = Math.abs(debtor.balanceCents);
    const creditAmount = creditor.balanceCents;

    const settleCents = Math.min(debtAmount, creditAmount);

    if (settleCents > 0) {
      transactions.push({
        from: { id: debtor.id, name: debtor.name },
        to: { id: creditor.id, name: creditor.name },
        amount: fromCents(settleCents)
      });

      debtor.balanceCents += settleCents;
      creditor.balanceCents -= settleCents;
    }

    if (debtor.balanceCents === 0) {
      debtorIndex++;
    }
    if (creditor.balanceCents === 0) {
      creditorIndex++;
    }
  }

  return transactions;
}

module.exports = {
  getUserDetailedBalance,
  simplifyDebts
};
