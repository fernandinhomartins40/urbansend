#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const bcrypt = require('bcrypt');
const knexFactory = require('knex');
const knexConfig = require('../knexfile');

const NODE_ENV = process.env.NODE_ENV || 'development';
const config = knexConfig[NODE_ENV] || knexConfig.development;
const db = knexFactory(config);

const SUPER_ADMIN_EMAIL = String(process.env.SUPER_ADMIN_EMAIL || 'superadmin@velomail.com.br').trim().toLowerCase();
const SUPER_ADMIN_NAME = String(process.env.SUPER_ADMIN_NAME || 'UltraZend Super Admin').trim();
const DEFAULT_DEV_PASSWORD = 'SuperAdmin@123!';
const SUPER_ADMIN_FORCE_PASSWORD_RESET = ['1', 'true', 'yes', 'on']
  .includes(String(process.env.SUPER_ADMIN_FORCE_PASSWORD_RESET || '').trim().toLowerCase());
const SUPER_ADMIN_SYNC_EMAIL = ['1', 'true', 'yes', 'on']
  .includes(String(process.env.SUPER_ADMIN_SYNC_EMAIL || '').trim().toLowerCase());
const SUPER_ADMIN_SYNC_NAME = ['1', 'true', 'yes', 'on']
  .includes(String(process.env.SUPER_ADMIN_SYNC_NAME || '').trim().toLowerCase());

const resolvePassword = () => {
  const envPassword = String(process.env.SUPER_ADMIN_PASSWORD || '').trim();
  if (envPassword) return envPassword;

  if (NODE_ENV === 'production') {
    throw new Error('SUPER_ADMIN_PASSWORD is required in production');
  }

  return DEFAULT_DEV_PASSWORD;
};

/**
 * Pre-requisitos de schema.
 *
 * Este script NAO cria tabelas nem colunas. O schema de producao vem de
 * prisma/schema.prisma via `prisma db push`, que roda antes deste seed.
 * Criar schema aqui duplicava as definicoes com tipos divergentes (o
 * `table.json()` do Knex virava `text`) e, pior, mascarava tabelas que o
 * push havia dropado por nao estarem declaradas no schema — o problema
 * so aparecia deploys depois. Se algo faltar, falhamos alto.
 */
const REQUIRED_TABLES = [
  'users',
  'platform_admin_profiles',
  'platform_admin_audit_logs',
  'platform_impersonation_sessions',
  'account_subscriptions',
  'account_security_flags',
  'refresh_tokens'
];

const assertSchemaReady = async () => {
  const missingTables = [];
  for (const table of REQUIRED_TABLES) {
    if (!(await db.schema.hasTable(table))) {
      missingTables.push(table);
    }
  }

  const missingColumns = [];
  if (!missingTables.includes('users') && !(await db.schema.hasColumn('users', 'is_superadmin'))) {
    missingColumns.push('users.is_superadmin');
  }

  if (missingTables.length || missingColumns.length) {
    const details = [
      missingTables.length ? `tabelas ausentes: ${missingTables.join(', ')}` : null,
      missingColumns.length ? `colunas ausentes: ${missingColumns.join(', ')}` : null
    ].filter(Boolean).join('; ');

    throw new Error(
      `Schema incompleto (${details}). ` +
      'Declare no prisma/schema.prisma e rode as migrations antes do seed.'
    );
  }
};

const ensureAccountFoundationRows = async () => {
  const hasUserPlans = await db.schema.hasTable('user_plans');
  const users = await db('users').select('id');

  for (const user of users) {
    const hasSubscription = await db('account_subscriptions').where('account_user_id', user.id).first();
    if (!hasSubscription) {
      const userPlan = hasUserPlans
        ? await db('user_plans')
          .where('user_id', user.id)
          .where('is_active', true)
          .orderBy('created_at', 'desc')
          .first()
        : null;

      await db('account_subscriptions').insert({
        account_user_id: user.id,
        plan_name: userPlan?.plan_name || 'free',
        status: userPlan?.is_active === false ? 'inactive' : 'active',
        monthly_email_limit: userPlan?.plan_name === 'enterprise'
          ? 1000000
          : userPlan?.plan_name === 'professional'
            ? 200000
            : 1000,
        api_rate_limit_per_minute: userPlan?.plan_name === 'enterprise'
          ? 5000
          : userPlan?.plan_name === 'professional'
            ? 1500
            : 120,
        started_at: userPlan?.started_at || new Date(),
        expires_at: userPlan?.expires_at || null,
        features: userPlan?.features ? JSON.stringify(userPlan.features) : null,
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    const hasFlags = await db('account_security_flags').where('account_user_id', user.id).first();
    if (!hasFlags) {
      await db('account_security_flags').insert({
        account_user_id: user.id,
        is_suspended: false,
        is_under_review: false,
        email_sending_blocked: false,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }
};

const run = async () => {
  const password = resolvePassword();
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
  let passwordHashCache = null;
  const getPasswordHash = async () => {
    if (!passwordHashCache) {
      passwordHashCache = await bcrypt.hash(password, saltRounds);
    }
    return passwordHashCache;
  };
  const now = new Date();
  let passwordUpdated = false;

  await assertSchemaReady();
  await ensureAccountFoundationRows();

  await db.transaction(async (trx) => {
    const currentSuperAdmin = await trx('users')
      .where('is_superadmin', true)
      .orderBy('updated_at', 'desc')
      .first();

    const existingByEmail = await trx('users')
      .whereRaw('LOWER(email) = ?', [SUPER_ADMIN_EMAIL])
      .first();

    await trx('users').update({ is_superadmin: false, updated_at: now });

    let superAdminId;
    const existing = existingByEmail || currentSuperAdmin;

    if (existing) {
      const shouldSyncEmail = Boolean(existingByEmail) || SUPER_ADMIN_SYNC_EMAIL;
      const shouldSyncName = Boolean(existingByEmail) || SUPER_ADMIN_SYNC_NAME;
      superAdminId = Number(existing.id);
      const updatePayload = {
        name: shouldSyncName ? SUPER_ADMIN_NAME : (existing.name || SUPER_ADMIN_NAME),
        email: shouldSyncEmail ? SUPER_ADMIN_EMAIL : existing.email,
        is_verified: true,
        is_active: true,
        is_admin: true,
        is_superadmin: true,
        updated_at: now
      };

      if (SUPER_ADMIN_FORCE_PASSWORD_RESET || !existing.password_hash) {
        updatePayload.password_hash = await getPasswordHash();
        passwordUpdated = true;
      }

      await trx('users')
        .where('id', superAdminId)
        .update(updatePayload);
    } else {
      const insertPayload = {
        name: SUPER_ADMIN_NAME,
        email: SUPER_ADMIN_EMAIL,
        password_hash: await getPasswordHash(),
        is_verified: true,
        is_active: true,
        is_admin: true,
        is_superadmin: true,
        permissions: JSON.stringify(['admin', 'platform:super_admin']),
        created_at: now,
        updated_at: now
      };

      const dbClient = String((trx.client && trx.client.config && trx.client.config.client) || '').toLowerCase();
      const isPostgres = dbClient === 'pg' || dbClient === 'postgres' || dbClient === 'postgresql';
      const inserted = isPostgres
        ? await trx('users').insert(insertPayload).returning('id')
        : await trx('users').insert(insertPayload);

      const first = Array.isArray(inserted) ? inserted[0] : inserted;
      superAdminId = typeof first === 'object' && first !== null ? Number(first.id) : Number(first);
      passwordUpdated = true;
    }

    await trx('platform_admin_profiles')
      .whereNot('user_id', superAdminId)
      .update({ is_active: false, role: 'ops_admin', updated_at: now });

    const profile = await trx('platform_admin_profiles').where('user_id', superAdminId).first();
    if (profile) {
      await trx('platform_admin_profiles')
        .where('user_id', superAdminId)
        .update({
          role: 'super_admin',
          is_active: true,
          mfa_required: true,
          updated_at: now
        });
    } else {
      await trx('platform_admin_profiles').insert({
        user_id: superAdminId,
        role: 'super_admin',
        is_active: true,
        mfa_required: true,
        created_at: now,
        updated_at: now
      });
    }
  });

  const activeSuperAdmin = await db('users')
    .select('email')
    .where('is_superadmin', true)
    .first();

  console.log(`Super admin seed applied for ${(activeSuperAdmin && activeSuperAdmin.email) || SUPER_ADMIN_EMAIL} (password ${passwordUpdated ? 'updated' : 'preserved'})`);
};

run()
  .catch((error) => {
    console.error('Super admin seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.destroy();
    } catch (_error) {
      // ignore
    }
  });
