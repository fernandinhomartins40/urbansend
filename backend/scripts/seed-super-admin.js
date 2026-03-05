#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const bcrypt = require('bcrypt');
const knexFactory = require('knex');
const knexConfig = require('../knexfile');

const NODE_ENV = process.env.NODE_ENV || 'development';
const config = knexConfig[NODE_ENV] || knexConfig.development;
const db = knexFactory(config);

const SUPER_ADMIN_EMAIL = String(process.env.SUPER_ADMIN_EMAIL || 'superadmin@ultrazend.com.br').trim().toLowerCase();
const SUPER_ADMIN_NAME = String(process.env.SUPER_ADMIN_NAME || 'UltraZend Super Admin').trim();
const DEFAULT_DEV_PASSWORD = 'SuperAdmin@123!';
const SUPER_ADMIN_FORCE_PASSWORD_RESET = ['1', 'true', 'yes', 'on']
  .includes(String(process.env.SUPER_ADMIN_FORCE_PASSWORD_RESET || '').trim().toLowerCase());

const resolvePassword = () => {
  const envPassword = String(process.env.SUPER_ADMIN_PASSWORD || '').trim();
  if (envPassword) return envPassword;

  if (NODE_ENV === 'production') {
    throw new Error('SUPER_ADMIN_PASSWORD is required in production');
  }

  return DEFAULT_DEV_PASSWORD;
};

const ensureUsersSuperAdminColumn = async () => {
  const hasUsers = await db.schema.hasTable('users');
  if (!hasUsers) {
    throw new Error('users table not found');
  }

  const hasColumn = await db.schema.hasColumn('users', 'is_superadmin');
  if (!hasColumn) {
    await db.schema.alterTable('users', (table) => {
      table.boolean('is_superadmin').notNullable().defaultTo(false);
    });
  }
};

const ensurePlatformAdminProfilesTable = async () => {
  const hasTable = await db.schema.hasTable('platform_admin_profiles');
  if (hasTable) {
    return;
  }

  await db.schema.createTable('platform_admin_profiles', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().unique();
    table.string('role', 40).notNullable().defaultTo('super_admin');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('mfa_required').notNullable().defaultTo(true);
    table.timestamp('last_login_at').nullable();
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};

const ensurePlatformAdminAuditLogsTable = async () => {
  const hasTable = await db.schema.hasTable('platform_admin_audit_logs');
  if (hasTable) {
    return;
  }

  await db.schema.createTable('platform_admin_audit_logs', (table) => {
    table.increments('id').primary();
    table.integer('admin_user_id').unsigned().notNullable();
    table.string('action', 120).notNullable();
    table.string('target_type', 120).notNullable();
    table.string('target_id', 120).nullable();
    table.text('reason').nullable();
    table.text('before_payload').nullable();
    table.text('after_payload').nullable();
    table.string('request_id', 100).nullable();
    table.string('ip_address', 100).nullable();
    table.string('user_agent', 1000).nullable();
    table.timestamp('created_at').notNullable().defaultTo(db.fn.now());

    table.foreign('admin_user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['admin_user_id', 'created_at']);
    table.index(['target_type', 'target_id']);
    table.index(['action', 'created_at']);
  });
};

const ensurePlatformImpersonationSessionsTable = async () => {
  const hasTable = await db.schema.hasTable('platform_impersonation_sessions');
  if (hasTable) {
    return;
  }

  await db.schema.createTable('platform_impersonation_sessions', (table) => {
    table.increments('id').primary();
    table.string('session_token', 120).notNullable().unique();
    table.integer('admin_user_id').unsigned().notNullable();
    table.integer('account_user_id').unsigned().notNullable();
    table.string('status', 40).notNullable().defaultTo('active');
    table.text('reason').notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('ended_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(db.fn.now());

    table.foreign('admin_user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('account_user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['admin_user_id', 'status', 'created_at']);
    table.index(['account_user_id', 'status']);
    table.index(['expires_at', 'status']);
  });
};

const ensureAccountSubscriptionsTable = async () => {
  const hasTable = await db.schema.hasTable('account_subscriptions');
  if (hasTable) {
    return;
  }

  await db.schema.createTable('account_subscriptions', (table) => {
    table.increments('id').primary();
    table.integer('account_user_id').unsigned().notNullable().unique();
    table.string('plan_name', 80).notNullable().defaultTo('free');
    table.string('status', 40).notNullable().defaultTo('active');
    table.integer('monthly_email_limit').notNullable().defaultTo(1000);
    table.integer('api_rate_limit_per_minute').notNullable().defaultTo(120);
    table.timestamp('started_at').nullable();
    table.timestamp('expires_at').nullable();
    table.string('payment_provider', 80).nullable();
    table.string('external_subscription_id', 255).nullable();
    table.text('features').nullable();
    table.timestamps(true, true);

    table.foreign('account_user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['status', 'plan_name']);
  });
};

const ensureAccountSecurityFlagsTable = async () => {
  const hasTable = await db.schema.hasTable('account_security_flags');
  if (hasTable) {
    return;
  }

  await db.schema.createTable('account_security_flags', (table) => {
    table.increments('id').primary();
    table.integer('account_user_id').unsigned().notNullable().unique();
    table.boolean('is_suspended').notNullable().defaultTo(false);
    table.boolean('is_under_review').notNullable().defaultTo(false);
    table.boolean('email_sending_blocked').notNullable().defaultTo(false);
    table.text('suspension_reason').nullable();
    table.timestamp('suspended_at').nullable();
    table.timestamp('suspension_ends_at').nullable();
    table.integer('updated_by').unsigned().nullable();
    table.timestamps(true, true);

    table.foreign('account_user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.index(['is_suspended', 'is_under_review']);
  });
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

  await ensureUsersSuperAdminColumn();
  await ensurePlatformAdminProfilesTable();
  await ensurePlatformAdminAuditLogsTable();
  await ensurePlatformImpersonationSessionsTable();
  await ensureAccountSubscriptionsTable();
  await ensureAccountSecurityFlagsTable();
  await ensureAccountFoundationRows();

  await db.transaction(async (trx) => {
    await trx('users').update({ is_superadmin: false, updated_at: now });

    const existing = await trx('users').whereRaw('LOWER(email) = ?', [SUPER_ADMIN_EMAIL]).first();

    let superAdminId;
    if (existing) {
      superAdminId = Number(existing.id);
      const updatePayload = {
        name: SUPER_ADMIN_NAME,
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

  console.log(`Super admin seed applied for ${SUPER_ADMIN_EMAIL} (password ${passwordUpdated ? 'updated' : 'preserved'})`);
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
