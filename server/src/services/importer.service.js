const fs = require('fs');
const csv = require('csv-parser');
const db = require('../db/db');

// Date parser helper to handle erratic formats
function parseErraticDate(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.trim();
  
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  // Try DD/MM/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const year = parseInt(slashMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Try "Mar 14" or "Feb 10" or "April 5"
  const wordMatch = s.match(/^([a-zA-Z]+)\s+(\d{1,2})/);
  if (wordMatch) {
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
    };
    const monthName = wordMatch[1].toLowerCase();
    const day = parseInt(wordMatch[2], 10);
    if (months[monthName] !== undefined) {
      // Default to 2026 as the spreadsheet contains February to April 2026
      const d = new Date(2026, months[monthName], day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Fallback to standard JS Date parsing
  const fallbackDate = new Date(s);
  if (!isNaN(fallbackDate.getTime())) return fallbackDate;

  return null;
}

// Helper to normalize user names based on current users in the DB
async function normalizeUser(nameStr, allUsers) {
  if (!nameStr) return null;
  const s = nameStr.trim().toLowerCase();
  
  // Find match where user name is a prefix, or vice versa, or contains
  for (const user of allUsers) {
    const uName = user.name.toLowerCase();
    const uEmail = user.email.toLowerCase();
    if (s === uName || s === uEmail) return user;
    if (s.startsWith(uName) || uName.startsWith(s)) return user;
    // Handle e.g., "Priya S" -> starts with "priya"
    const firstWord = s.split(/\s+/)[0];
    if (firstWord === uName) return user;
  }
  return null;
}

// Calculate unique hash to detect identical duplicate rows
function getRowHash(row) {
  return `${row.date}_${row.description?.trim().toLowerCase()}_${row.paid_by?.trim().toLowerCase()}_${row.amount}_${row.currency?.trim().toUpperCase()}`;
}

// Calculate key to detect conflicting rows (same date & location/description, different amounts)
function getConflictKey(row) {
  return `${row.date}_${row.description?.trim().toLowerCase()}`;
}

/**
 * Importer function utilizing csv-parser streams with complex anomaly checking.
 * @param {string} filePath - Path to CSV file
 * @param {string} groupId - UUID of group
 */
async function importExpenses(filePath, groupId) {
  // Start Import Session
  const sessionRes = await db.query(
    `INSERT INTO import_sessions (filename, status) VALUES ($1, 'pending') RETURNING id`,
    [filePath.split('/').pop()]
  );
  const sessionId = sessionRes.rows[0].id;

  const summary = {
    totalRows: 0,
    expensesInserted: 0,
    settlementsInserted: 0,
    staged: 0,
    anomaliesLogged: 0
  };

  // Fetch all users to normalize names
  const usersRes = await db.query(`SELECT id, name, email FROM users`);
  const allUsers = usersRes.rows;

  // Fetch current group member timelines
  const membersRes = await db.query(
    `SELECT user_id, joined_at, left_at FROM group_members WHERE group_id = $1`,
    [groupId]
  );
  const groupMembers = membersRes.rows;

  // Fetch already processed items to check duplicates and conflicts
  const existingExpensesRes = await db.query(
    `SELECT expense_date::text as date, description, paid_by, original_amount as amount, original_currency as currency 
     FROM expenses WHERE group_id = $1`,
    [groupId]
  );
  
  const processedHashes = new Set(
    existingExpensesRes.rows.map(row => getRowHash({
      date: row.date.substring(0, 10),
      description: row.description,
      paid_by: row.paid_by,
      amount: row.amount,
      currency: row.currency
    }))
  );

  // Keep track of locations mapped to amounts to identify conflicts
  const processedAmountsByLocation = new Map(
    existingExpensesRes.rows.map(row => [
      getConflictKey({ date: row.date.substring(0, 10), description: row.description }),
      parseFloat(row.amount)
    ])
  );

  // Local sets for tracking within this file
  const localHashes = new Set();
  const localAmountsByLocation = new Map();

  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('error', (err) => reject(err))
      .on('end', async () => {
        try {
          for (let i = 0; i < rows.length; i++) {
            const rawRow = rows[i];
            summary.totalRows++;
            const rowIndex = i + 1;

            // Extract CSV headers
            const rawDate = rawRow.date;
            const rawDesc = rawRow.description || '';
            const rawPaidBy = rawRow.paid_by;
            const rawAmount = rawRow.amount;
            const rawCurrency = rawRow.currency;
            const rawSplitType = rawRow.split_type;
            const rawSplitWith = rawRow.split_with || '';
            const rawSplitDetails = rawRow.split_details || '';
            const rawNotes = rawRow.notes || '';

            const anomalies = [];
            let stageRow = false;

            // 1. Data Cleaning: Clean Amount
            let cleanedAmount = NaN;
            if (rawAmount) {
              const cleanedAmountStr = rawAmount.replace(/[\s,]/g, '');
              cleanedAmount = parseFloat(cleanedAmountStr);
            }

            // 2. Normalize Erratic Dates
            const expenseDate = parseErraticDate(rawDate);
            const dateStrFormatted = expenseDate ? expenseDate.toISOString().split('T')[0] : null;

            // 3. Normalize Payer Casing / Match User
            const payerUser = await normalizeUser(rawPaidBy, allUsers);
            const payerId = payerUser ? payerUser.id : null;

            // 4. Missing Data Checks
            if (!rawPaidBy || rawPaidBy.trim() === '' || !payerId) {
              anomalies.push({
                type: 'MISSING_PAYER',
                desc: `Row ${rowIndex}: Payer name '${rawPaidBy}' is missing, empty, or cannot be resolved to a valid user.`,
                severity: 'critical'
              });
              stageRow = true;
            }

            if (!expenseDate) {
              anomalies.push({
                type: 'INVALID_DATE',
                desc: `Row ${rowIndex}: Expense date '${rawDate}' is invalid or empty.`,
                severity: 'critical'
              });
              stageRow = true;
            }

            if (isNaN(cleanedAmount)) {
              anomalies.push({
                type: 'INVALID_AMOUNT',
                desc: `Row ${rowIndex}: Expense amount '${rawAmount}' is invalid or empty.`,
                severity: 'critical'
              });
              stageRow = true;
            }

            // Currency defaults & logging
            let currency = rawCurrency ? rawCurrency.trim().toUpperCase() : '';
            if (!currency) {
              currency = 'INR';
              anomalies.push({
                type: 'CURRENCY_DEFAULTED',
                desc: `Row ${rowIndex}: Currency was empty. Defaulted to INR.`,
                severity: 'warning'
              });
            }

            // 5. Duplicate and Conflict Engine
            if (!stageRow && dateStrFormatted) {
              const currentHash = getRowHash({
                date: dateStrFormatted,
                description: rawDesc,
                paid_by: payerId,
                amount: cleanedAmount,
                currency: currency
              });

              // Identical Duplicate Check
              if (processedHashes.has(currentHash) || localHashes.has(currentHash)) {
                anomalies.push({
                  type: 'DUPLICATE',
                  desc: `Row ${rowIndex}: Duplicate identical row detected for '${rawDesc}' on ${dateStrFormatted}.`,
                  severity: 'warning'
                });
                stageRow = true;
              } else {
                localHashes.add(currentHash);
              }

              // Conflicting Amounts Check (Same date/location description, different amounts)
              const conflictKey = getConflictKey({ date: dateStrFormatted, description: rawDesc });
              const existingAmount = processedAmountsByLocation.get(conflictKey) || localAmountsByLocation.get(conflictKey);
              if (existingAmount !== undefined && existingAmount !== cleanedAmount) {
                anomalies.push({
                  type: 'CONFLICTING_AMOUNT',
                  desc: `Row ${rowIndex}: Conflicting amount detected for '${rawDesc}' on ${dateStrFormatted} (found amount ${cleanedAmount} vs existing ${existingAmount}).`,
                  severity: 'warning'
                });
                stageRow = true;
              } else {
                localAmountsByLocation.set(conflictKey, cleanedAmount);
              }
            }

            // 6. Currency Conversion (USD to INR at fixed 83.50)
            let exchangeRate = 1.0;
            let finalAmountInr = cleanedAmount;
            if (!stageRow && currency === 'USD') {
              exchangeRate = 83.50;
              finalAmountInr = cleanedAmount * exchangeRate;
              anomalies.push({
                type: 'CURRENCY_CONVERSION',
                desc: `Row ${rowIndex}: Auto-converted USD to INR at fixed rate of 83.50.`,
                severity: 'warning'
              });
            } else if (!stageRow && currency !== 'INR') {
              anomalies.push({
                type: 'UNSUPPORTED_CURRENCY',
                desc: `Row ${rowIndex}: Unsupported currency '${currency}' detected.`,
                severity: 'critical'
              });
              stageRow = true;
            }

            // 7. Settlements Detection
            // Route rows where split_type is NaN/Empty or notes contain "settlement"
            const isSettlement = (!rawSplitType || rawSplitType.trim() === '' || /settlement/i.test(rawNotes));

            // Parse splits if not a settlement
            let splitMembersInfo = []; // array of { user, shareType, shareValue }
            if (!stageRow && !isSettlement) {
              const splitNames = rawSplitWith.split(',').map(n => n.trim()).filter(Boolean);
              
              // Verify users in split list (Check for Strangers)
              for (const name of splitNames) {
                const matchedUser = await normalizeUser(name, allUsers);
                if (!matchedUser) {
                  anomalies.push({
                    type: 'STRANGER_IN_SPLIT',
                    desc: `Row ${rowIndex}: Unknown user '${name}' found in split_with.`,
                    severity: 'critical'
                  });
                  stageRow = true;
                } else {
                  // Standard split details parse: Equal split default or specific percentage/amount
                  // If split_details contains e.g. "Aisha 30%, Rohan 30%..."
                  let pctMatch = null;
                  if (rawSplitDetails) {
                    const regex = new RegExp(`${matchedUser.name}\\s*(\\d+)%`, 'i');
                    pctMatch = rawSplitDetails.match(regex);
                  }
                  splitMembersInfo.push({
                    user: matchedUser,
                    pct: pctMatch ? parseFloat(pctMatch[1]) : null
                  });
                }
              }

              // 8. Timeline constraints check (Sam's Request)
              // If an expense is dated in April but the split includes Meera (who left in March)
              if (!stageRow && expenseDate) {
                const validSplitMembers = [];
                for (const memberInfo of splitMembersInfo) {
                  const memberRecord = groupMembers.find(m => m.user_id === memberInfo.user.id);
                  if (memberRecord) {
                    const joined = new Date(memberRecord.joined_at);
                    const left = memberRecord.left_at ? new Date(memberRecord.left_at) : null;
                    if (expenseDate >= joined && (!left || expenseDate <= left)) {
                      validSplitMembers.push(memberInfo);
                    } else {
                      anomalies.push({
                        type: 'TIMELINE_EXCLUSION',
                        desc: `Row ${rowIndex}: Auto-removed '${memberInfo.user.name}' from split because expense date (${dateStrFormatted}) falls outside residency dates.`,
                        severity: 'warning'
                      });
                    }
                  } else {
                    // Not a group member
                    anomalies.push({
                      type: 'NOT_GROUP_MEMBER',
                      desc: `Row ${rowIndex}: User '${memberInfo.user.name}' is in split but is not a member of this group.`,
                      severity: 'warning'
                    });
                  }
                }

                if (validSplitMembers.length === 0) {
                  anomalies.push({
                    type: 'NO_VALID_SPLIT_MEMBERS',
                    desc: `Row ${rowIndex}: No valid active resident members in the split for this date.`,
                    severity: 'critical'
                  });
                  stageRow = true;
                } else {
                  splitMembersInfo = validSplitMembers;
                }
              }

              // Bad Math Check (Sum of percentages) AFTER timeline exclusions
              const hasPercentages = splitMembersInfo.some(m => m.pct !== null);
              if (!stageRow && hasPercentages) {
                const totalPct = splitMembersInfo.reduce((sum, m) => sum + (m.pct || 0), 0);
                if (totalPct !== 100) {
                  anomalies.push({
                    type: 'BAD_MATH',
                    desc: `Row ${rowIndex}: Percentage splits do not sum to 100% (summed to ${totalPct}%). This can happen if members were excluded due to residency timelines.`,
                    severity: 'critical'
                  });
                  stageRow = true;
                }
              }
            }

            // Persist to Database
            await db.query('BEGIN');
            try {
              if (stageRow) {
                // Insert into staged_expenses
                const stageRes = await db.query(
                  `INSERT INTO staged_expenses (import_session_id, raw_row_index, raw_data, status)
                   VALUES ($1, $2, $3, 'pending') RETURNING id`,
                  [sessionId, rowIndex, JSON.stringify(rawRow)]
                );
                const stagedId = stageRes.rows[0].id;
                summary.staged++;

                // Write anomalies associated with this staged expense
                for (const anomaly of anomalies) {
                  await db.query(
                    `INSERT INTO anomaly_logs (import_session_id, staged_expense_id, anomaly_type, description, severity, is_resolved)
                     VALUES ($1, $2, $3, $4, $5, false)`,
                    [sessionId, stagedId, anomaly.type, anomaly.desc, anomaly.severity]
                  );
                  summary.anomaliesLogged++;
                }
              } else {
                if (isSettlement) {
                  // Direct Settlement Routing
                  // Determine receiver: split_with or note receiver. Fallback to payer if not found.
                  let receiverId = payerId;
                  if (rawSplitWith) {
                    const receiverUser = await normalizeUser(rawSplitWith.split(',')[0], allUsers);
                    if (receiverUser) receiverId = receiverUser.id;
                  }
                  await db.query(
                    `INSERT INTO settlements (group_id, sender_id, receiver_id, amount, currency, settled_at, import_session_id, notes)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [groupId, payerId, receiverId, Math.abs(finalAmountInr), currency, expenseDate, sessionId, rawDesc]
                  );
                  summary.settlementsInserted++;
                } else {
                  // Insert Expense
                  const expRes = await db.query(
                    `INSERT INTO expenses (group_id, paid_by, description, expense_date, original_amount, original_currency, exchange_rate, final_amount_inr, import_session_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                    [groupId, payerId, rawDesc, expenseDate, cleanedAmount, currency, exchangeRate, finalAmountInr, sessionId]
                  );
                  const expenseId = expRes.rows[0].id;
                  summary.expensesInserted++;

                  // Calculate splits (Negative check/refund or normal)
                  const hasPercentages = splitMembersInfo.some(m => m.pct !== null);
                  for (const mInfo of splitMembersInfo) {
                    let shareAmount = 0;
                    if (hasPercentages) {
                      shareAmount = (mInfo.pct / 100) * finalAmountInr;
                    } else {
                      shareAmount = finalAmountInr / splitMembersInfo.length;
                    }

                    await db.query(
                      `INSERT INTO expense_splits (expense_id, user_id, share_amount)
                       VALUES ($1, $2, $3)`,
                      [expenseId, mInfo.user.id, shareAmount]
                    );
                  }
                }

                // Log any resolved warnings/anomalies (like timeline exclusions or currency conversions)
                for (const anomaly of anomalies) {
                  await db.query(
                    `INSERT INTO anomaly_logs (import_session_id, expense_id, anomaly_type, description, severity, is_resolved)
                     VALUES ($1, $2, $3, $4, $5, true)`,
                    [sessionId, null, anomaly.type, anomaly.desc, anomaly.severity]
                  );
                  summary.anomaliesLogged++;
                }
              }
              await db.query('COMMIT');
            } catch (innerErr) {
              await db.query('ROLLBACK');
              throw innerErr;
            }
          }

          // Complete the import session status
          await db.query(
            `UPDATE import_sessions SET status = 'processed', summary = $1 WHERE id = $2`,
            [JSON.stringify(summary), sessionId]
          );
          resolve(summary);
        } catch (err) {
          // Update session status to failed
          await db.query(
            `UPDATE import_sessions SET status = 'failed', summary = $1 WHERE id = $2`,
            [JSON.stringify({ error: err.message, ...summary }), sessionId]
          );
          reject(err);
        }
      });
  });
}

module.exports = {
  importExpenses
};
