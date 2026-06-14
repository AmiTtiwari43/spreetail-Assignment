const fs = require('fs');
const path = require('path');
const db = require('../src/db/db');
const { importExpenses } = require('../src/services/importer.service');
const { getUserDetailedBalance, simplifyDebts } = require('../src/services/calculator.service');

const mockCSVContent = `date,description,paid_by,amount,currency,split_type,split_with,split_details,notes
2026-02-10,Snacks at Grocery,Priya,1200,INR,equal,Priya,Rohan,Aisha,Meera,,
2026-03-05,Electricity Bill,Sam,100,USD,equal,Priya,Rohan,Aisha,Meera,,Auto USD Convert
2026-04-12,Internet bill,Rohan,1500,INR,equal,Priya,Rohan,Aisha,Meera,,Meera left in March (auto-exclude)
2026-02-20,Dinner at Marina,Aisha,3000,INR,equal,Priya,Rohan,Aisha,,,Duplicate Row test
2026-02-20,Dinner at Marina,Aisha,3000,INR,equal,Priya,Rohan,Aisha,,,Duplicate Row test
2026-03-14,Taxi ride,Sam,500,INR,percentage,Priya,Rohan,Aisha,,Priya 40%, Rohan 40%, Aisha 30%,Bad Math 110%
2026-04-01,Repayment,Priya,2000,INR,,,Priya,Sam,,settlement,Settlement entry
`;

async function runTest() {
  console.log('--- STARTING SHARED EXPENSES APP PIPELINE TEST ---');

  try {
    // 1. Create a dummy CSV file
    const csvPath = path.join(__dirname, 'test_expenses.csv');
    fs.writeFileSync(csvPath, mockCSVContent);
    console.log('1. Mock CSV file created at:', csvPath);

    // 2. Clear existing database rows for a fresh test run
    await db.query('TRUNCATE users, groups, group_members, expenses, settlements, staged_expenses, anomaly_logs, import_sessions RESTART IDENTITY CASCADE');

    // 3. Seed group and flatmate users
    console.log('2. Seeding users and membership timelines...');
    const groupInsert = await db.query("INSERT INTO groups (name) VALUES ('Vikas Flatmates') RETURNING id");
    const groupId = groupInsert.rows[0].id;

    const users = ['Priya', 'Rohan', 'Aisha', 'Meera', 'Sam'];
    const userIds = {};
    for (const name of users) {
      const email = `${name.toLowerCase()}@example.com`;
      const userRes = await db.query('INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id', [name, email]);
      userIds[name] = userRes.rows[0].id;
    }

    // Membership: Meera joined Feb 1, left March 31. Others joined Feb 1, still there.
    for (const name of users) {
      const joinedAt = '2026-02-01 00:00:00';
      const leftAt = name === 'Meera' ? '2026-03-31 23:59:59' : null;
      await db.query(
        'INSERT INTO group_members (group_id, user_id, joined_at, left_at) VALUES ($1, $2, $3, $4)',
        [groupId, userIds[name], joinedAt, leftAt]
      );
    }
    console.log('   Users and membership seeded successfully.');

    // 4. Trigger import parsing
    console.log('3. Executing CSV streaming import process...');
    const summary = await importExpenses(csvPath, groupId);
    console.log('   Import completed! Summary:', summary);

    // 5. View generated anomalies
    console.log('\n--- DETECTED ANOMALIES & STAGED ITEMS ---');
    const anomaliesRes = await db.query(`
      SELECT se.raw_row_index, se.status, al.anomaly_type, al.description, al.severity 
      FROM staged_expenses se 
      JOIN anomaly_logs al ON al.staged_expense_id = se.id
    `);
    anomaliesRes.rows.forEach(row => {
      console.log(`[Staged Row #${row.raw_row_index}] Status: ${row.status} | Anomaly: ${row.anomaly_type} (${row.severity}) -> ${row.description}`);
    });

    const activeAnomaliesRes = await db.query(`
      SELECT al.anomaly_type, al.description 
      FROM anomaly_logs al 
      WHERE al.staged_expense_id IS NULL
    `);
    activeAnomaliesRes.rows.forEach(row => {
      console.log(`[Auto-Resolved Warning] Anomaly: ${row.anomaly_type} -> ${row.description}`);
    });

    // 6. Calculate Balances & Debt simplification
    console.log('\n--- CALCULATING DETAILED BALANCES & AUDIT TRAILS ---');
    for (const name of users) {
      const detailed = await getUserDetailedBalance(userIds[name], groupId);
      console.log(`\nUser: ${name}`);
      console.log(`  Net Balance: ₹${detailed.summary.netBalance}`);
      console.log(`  Paid Total : ₹${detailed.summary.totalPaid}`);
      console.log(`  Owed Total : ₹${detailed.summary.totalOwed}`);
      console.log(`  Settled Net: ₹${detailed.summary.totalSent - detailed.summary.totalReceived}`);
      console.log('  Audit Ledger:');
      detailed.ledger.forEach(item => {
        console.log(`    [${item.effect}] ${item.type.replace('_', ' ')}: ${item.description} - ₹${item.amount}`);
      });
    }

    console.log('\n--- AISHA\'S VIEW: SIMPLIFIED DEBTS MATRIX ---');
    const netTransactions = await simplifyDebts(groupId);
    netTransactions.forEach(t => {
      console.log(`  ${t.from.name} pays ${t.to.name} -> ₹${t.amount}`);
    });

    // Clean up test file
    fs.unlinkSync(csvPath);
    console.log('\n4. Cleaned up temporary test CSV file.');

  } catch (error) {
    console.error('Test script failed with error:', error);
  } finally {
    db.prisma.$disconnect();
  }
}

runTest();
