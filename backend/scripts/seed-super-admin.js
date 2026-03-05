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
