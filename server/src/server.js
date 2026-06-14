const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db/db');
const { importExpenses } = require('./services/importer.service');
const { getUserDetailedBalance, simplifyDebts } = require('./services/calculator.service');

const app = express();
app.use(express.json());

// Enable CORS for frontend requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configure Multer for File Uploads
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

/**
 * Helper to fetch a default group ID or create one if none exists
 * (Helps keep the experience smooth during initial startup)
 */
async function getOrCreateDefaultGroup() {
  const groupRes = await db.query('SELECT id FROM groups LIMIT 1');
  if (groupRes.rows.length > 0) {
    return groupRes.rows[0].id;
  }
  const newGroup = await db.query("INSERT INTO groups (name) VALUES ('Default Flatmates') RETURNING id");
  return newGroup.rows[0].id;
}

/**
 * 1. POST /api/upload
 * Handles spreadsheet uploads and triggers the anomaly/import pipeline.
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let groupId = req.body.groupId || req.query.groupId;
    if (!groupId) {
      groupId = await getOrCreateDefaultGroup();
    }

    const filePath = req.file.path.replace(/\\/g, '/');
    const result = await importExpenses(filePath, groupId);

    res.json({
      message: 'Upload and processing complete',
      sessionSummary: result
    });
  } catch (err) {
    console.error('Upload handler error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. GET /api/anomalies
 * Fetches pending staged records alongside their anomaly descriptions for user auditing.
 */
app.get('/api/anomalies', async (req, res) => {
  try {
    const stagedRes = await db.query(
      `SELECT se.id, se.import_session_id, se.raw_row_index, se.raw_data, se.status, se.created_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', al.id,
                    'type', al.anomaly_type,
                    'description', al.description,
                    'severity', al.severity
                  )
                ) FILTER (WHERE al.id IS NOT NULL), '[]'::json
              ) as anomalies
       FROM staged_expenses se
       LEFT JOIN anomaly_logs al ON al.staged_expense_id = se.id
       WHERE se.status = 'pending'
       GROUP BY se.id
       ORDER BY se.created_at DESC`
    );

    res.json(stagedRes.rows);
  } catch (err) {
    console.error('Fetch anomalies error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. POST /api/staged/resolve
 * Endpoint for Meera to resolve a staged row (either approving it or rejecting/discarding it).
 */
app.post('/api/staged/resolve', async (req, res) => {
  const { stagedExpenseId, action, resolvedByUserId } = req.body;

  if (!stagedExpenseId || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  await db.query('BEGIN');
  try {
    // Check staged row existence
    const stageCheck = await db.query(
      `SELECT * FROM staged_expenses WHERE id = $1 AND status = 'pending'`,
      [stagedExpenseId]
    );

    if (stageCheck.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Staged expense not found or already resolved' });
    }

    const stagedRecord = stageCheck.rows[0];
    const rawData = stagedRecord.raw_data;

    // Normalizing/Retrieving group metadata for the import session
    const sessionRes = await db.query(
      `SELECT id FROM import_sessions WHERE id = $1`,
      [stagedRecord.import_session_id]
    );
    const sessionId = sessionRes.rows[0].id;

    // Default to first group
    const groupId = await getOrCreateDefaultGroup();

    if (action === 'reject') {
      // Mark staged expense as rejected
      await db.query(
        `UPDATE staged_expenses 
         SET status = 'rejected', resolved_by = $1, resolved_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [resolvedByUserId || null, stagedExpenseId]
      );

      // Mark associated anomalies as resolved
      await db.query(
        `UPDATE anomaly_logs 
         SET is_resolved = true, resolved_at = CURRENT_TIMESTAMP, resolution_notes = 'Rejected by user' 
         WHERE staged_expense_id = $1`,
        [stagedExpenseId]
      );
    } else {
      // ACTION: APPROVE
      // Parse database schema entries from raw JSON
      const rawDate = rawData.date;
      const rawDesc = rawData.description || '';
      const rawPaidBy = rawData.paid_by;
      const rawAmount = rawData.amount;
      const rawCurrency = rawData.currency || 'INR';
      const rawSplitType = rawData.split_type;
      const rawSplitWith = rawData.split_with || '';
      const rawSplitDetails = rawData.split_details || '';
      const rawNotes = rawData.notes || '';

      // Clean & parse
      const cleanedAmount = parseFloat(rawAmount.replace(/[\s,]/g, ''));
      const expenseDate = new Date(rawDate);
      const currency = rawCurrency.trim().toUpperCase();

      // Fetch users
      const usersRes = await db.query(`SELECT id, name, email FROM users`);
      const allUsers = usersRes.rows;

      // Match payer helper
      const findUser = (name) => {
        if (!name) return null;
        const s = name.trim().toLowerCase();
        return allUsers.find(u => u.name.toLowerCase().startsWith(s) || s.startsWith(u.name.toLowerCase()));
      };

      const payer = findUser(rawPaidBy);
      const payerId = payer ? payer.id : (resolvedByUserId || null);

      let exchangeRate = 1.0;
      let finalAmountInr = cleanedAmount;
      if (currency === 'USD') {
        exchangeRate = 83.50;
        finalAmountInr = cleanedAmount * exchangeRate;
      }

      const isSettlement = (!rawSplitType || rawSplitType.trim() === '' || /settlement/i.test(rawNotes));

      if (isSettlement) {
        let receiverId = payerId;
        if (rawSplitWith) {
          const rxUser = findUser(rawSplitWith.split(',')[0]);
          if (rxUser) receiverId = rxUser.id;
        }
        await db.query(
          `INSERT INTO settlements (group_id, sender_id, receiver_id, amount, currency, settled_at, import_session_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [groupId, payerId, receiverId, Math.abs(finalAmountInr), currency, expenseDate, sessionId, rawDesc]
        );
      } else {
        // Create actual expense
        const expInsert = await db.query(
          `INSERT INTO expenses (group_id, paid_by, description, expense_date, original_amount, original_currency, exchange_rate, final_amount_inr, import_session_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [groupId, payerId, rawDesc, expenseDate, cleanedAmount, currency, exchangeRate, finalAmountInr, sessionId]
        );
        const expenseId = expInsert.rows[0].id;

        // Resolve split users
        const splitNames = rawSplitWith.split(',').map(n => n.trim()).filter(Boolean);
        const splitMembers = [];
        for (const name of splitNames) {
          const usr = findUser(name);
          if (usr) {
            let pctMatch = null;
            if (rawSplitDetails) {
              const regex = new RegExp(`${usr.name}\\s*(\\d+)%`, 'i');
              pctMatch = rawSplitDetails.match(regex);
            }
            splitMembers.push({
              id: usr.id,
              pct: pctMatch ? parseFloat(pctMatch[1]) : null
            });
          }
        }

        const hasPercentages = splitMembers.some(m => m.pct !== null);
        for (const member of splitMembers) {
          const share = hasPercentages ? (member.pct / 100) * finalAmountInr : finalAmountInr / splitMembers.length;
          await db.query(
            `INSERT INTO expense_splits (expense_id, user_id, share_amount)
             VALUES ($1, $2, $3)`,
            [expenseId, member.id, share]
          );
        }
      }

      // Update staged state
      await db.query(
        `UPDATE staged_expenses 
         SET status = 'approved', resolved_by = $1, resolved_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [resolvedByUserId || null, stagedExpenseId]
      );

      // Resolve anomalies
      await db.query(
        `UPDATE anomaly_logs 
         SET is_resolved = true, resolved_at = CURRENT_TIMESTAMP, resolution_notes = 'Approved by user' 
         WHERE staged_expense_id = $1`,
        [stagedExpenseId]
      );
    }

    await db.query('COMMIT');
    res.json({ message: `Successfully ${action}d staged expense` });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Resolve staged expense error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. GET /api/balances
 * Returns net simplified balances matrix along with detailed itemized log sheets for all users.
 */
app.get('/api/balances', async (req, res) => {
  try {
    let groupId = req.query.groupId;
    if (!groupId) {
      groupId = await getOrCreateDefaultGroup();
    }

    // Aisha's Netting matrix
    const netting = await simplifyDebts(groupId);

    // Rohan's Detailed views for all members
    const membersRes = await db.query(
      `SELECT u.id, u.name, u.email 
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1 AND gm.left_at IS NULL`,
      [groupId]
    );

    const auditTrails = {};
    for (const member of membersRes.rows) {
      auditTrails[member.name] = await getUserDetailedBalance(member.id, groupId);
    }

    res.json({
      simplifiedDebts: netting,
      auditTrails
    });
  } catch (err) {
    console.error('Balances fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start Express Listener
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
