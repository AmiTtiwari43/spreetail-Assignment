require('dotenv/config');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/shared_expenses';

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = {
  // Expose raw query interface using Prisma's raw query runner
  query: async (text, params = []) => {
    try {
      const rows = await prisma.$queryRawUnsafe(text, ...params);
      return { rows };
    } catch (err) {
      throw err;
    }
  },
  prisma,
  pool
};
