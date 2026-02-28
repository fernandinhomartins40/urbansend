#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const { Client } = require('pg');

const isPostgresUrl = (value = '') => /^postgres(ql)?:\/\//i.test(value);

const tableExists = async (client, tableName) => {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists
    `,
    [tableName]
  );

  return Boolean(result.rows[0] && result.rows[0].exists);
};

const dedupeAbTestVariants = async (client) => {
  if (!(await tableExists(client, 'ab_test_variants'))) {
    console.log('PostgreSQL preflight: table public.ab_test_variants not found, skipping dedupe.');
    return;
  }

  const duplicates = await client.query(`
    SELECT ab_test_id, variant_name, COUNT(*) AS duplicate_count
    FROM public.ab_test_variants
    GROUP BY ab_test_id, variant_name
    HAVING COUNT(*) > 1
  `);

  if (duplicates.rowCount === 0) {
    console.log('PostgreSQL preflight: no duplicate ab_test_variants rows found.');
    return;
  }

  console.log(`PostgreSQL preflight: found ${duplicates.rowCount} duplicate ab_test_variants groups. Removing duplicates...`);

  await client.query(`
    WITH ranked_variants AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY ab_test_id, variant_name
          ORDER BY id ASC
        ) AS row_num
      FROM public.ab_test_variants
    )
    DELETE FROM public.ab_test_variants
    WHERE id IN (
      SELECT id
      FROM ranked_variants
      WHERE row_num > 1
    )
  `);

  console.log('PostgreSQL preflight: duplicate ab_test_variants rows removed.');
};

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL || '';

  if (!isPostgresUrl(databaseUrl)) {
    console.log('PostgreSQL preflight: DATABASE_URL is not PostgreSQL, skipping.');
    return;
  }

  const client = new Client({
    connectionString: databaseUrl
  });

  await client.connect();

  try {
    await dedupeAbTestVariants(client);
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error('PostgreSQL preflight failed:', error.message);
  process.exit(1);
});
