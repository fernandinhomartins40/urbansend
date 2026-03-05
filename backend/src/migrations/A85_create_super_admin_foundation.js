/**
 * Super Admin foundation:
 * - refresh_tokens (rotation/revocation)
 * - platform_admin_profiles
 * - platform_admin_audit_logs
 * - platform_impersonation_sessions
 * - account_subscriptions
 * - account_security_flags
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasRefreshTokens = await knex.schema.hasTable('refresh_tokens');
  if (!hasRefreshTokens) {
    await knex.schema.createTable('refresh_tokens', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable();
      table.string('token_id', 120).notNullable().unique();
      table.timestamp('expires_at').notNullable();
      table.boolean('is_revoked').notNullable().defaultTo(false);
      table.timestamp('revoked_at').nullable();
      table.string('created_ip', 100).nullable();
      table.string('user_agent', 1000).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.index(['user_id', 'is_revoked']);
      table.index(['expires_at', 'is_revoked']);
    });
  }

  const hasPlatformAdminProfiles = await knex.schema.hasTable('platform_admin_profiles');
  if (!hasPlatformAdminProfiles) {
    await knex.schema.createTable('platform_admin_profiles', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().unique();
      table.string('role', 40).notNullable().defaultTo('super_admin');
      table.boolean('is_active').notNullable().defaultTo(true);
      table.boolean('mfa_required').notNullable().defaultTo(true);
      table.timestamp('last_login_at').nullable();
      table.timestamps(true, true);

      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.index(['is_active', 'role']);
    });
  }

  const hasPlatformAuditLogs = await knex.schema.hasTable('platform_admin_audit_logs');
  if (!hasPlatformAuditLogs) {
    await knex.schema.createTable('platform_admin_audit_logs', (table) => {
      table.increments('id').primary();
      table.integer('admin_user_id').unsigned().notNullable();
      table.string('action', 120).notNullable();
      table.string('target_type', 120).notNullable();
      table.string('target_id', 120).nullable();
      table.text('reason').nullable();
      table.json('before_payload').nullable();
      table.json('after_payload').nullable();
      table.string('request_id', 100).nullable();
      table.string('ip_address', 100).nullable();
      table.string('user_agent', 1000).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.foreign('admin_user_id').references('id').inTable('users').onDelete('CASCADE');
      table.index(['admin_user_id', 'created_at']);
      table.index(['target_type', 'target_id']);
      table.index(['action', 'created_at']);
    });
  }

  const hasImpersonationTable = await knex.schema.hasTable('platform_impersonation_sessions');
  if (!hasImpersonationTable) {
    await knex.schema.createTable('platform_impersonation_sessions', (table) => {
      table.increments('id').primary();
      table.string('session_token', 120).notNullable().unique();
      table.integer('admin_user_id').unsigned().notNullable();
      table.integer('account_user_id').unsigned().notNullable();
      table.string('status', 40).notNullable().defaultTo('active');
      table.text('reason').notNullable();
      table.timestamp('expires_at').notNullable();
      table.timestamp('ended_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

      table.foreign('admin_user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('account_user_id').references('id').inTable('users').onDelete('CASCADE');
      table.index(['admin_user_id', 'status', 'created_at']);
      table.index(['account_user_id', 'status']);
      table.index(['expires_at', 'status']);
    });
  }

  const hasAccountSubscriptions = await knex.schema.hasTable('account_subscriptions');
  if (!hasAccountSubscriptions) {
    await knex.schema.createTable('account_subscriptions', (table) => {
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
      table.json('features').nullable();
      table.timestamps(true, true);

      table.foreign('account_user_id').references('id').inTable('users').onDelete('CASCADE');
      table.index(['status', 'plan_name']);
    });
  }

  const hasAccountSecurityFlags = await knex.schema.hasTable('account_security_flags');
  if (!hasAccountSecurityFlags) {
    await knex.schema.createTable('account_security_flags', (table) => {
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
  }

  const admins = await knex('users').select('id').where('is_admin', true);
  for (const admin of admins) {
    const exists = await knex('platform_admin_profiles').where('user_id', admin.id).first();
    if (!exists) {
      await knex('platform_admin_profiles').insert({
        user_id: admin.id,
        role: 'super_admin',
        is_active: true,
        mfa_required: true,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  const hasUserPlans = await knex.schema.hasTable('user_plans');
  const users = await knex('users').select('id');
  for (const user of users) {
    const hasSubscription = await knex('account_subscriptions').where('account_user_id', user.id).first();
    if (!hasSubscription) {
      const userPlan = hasUserPlans
        ? await knex('user_plans')
          .where('user_id', user.id)
          .where('is_active', true)
          .orderBy('created_at', 'desc')
          .first()
        : null;

      await knex('account_subscriptions').insert({
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
        features: userPlan?.features || null,
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    const hasFlags = await knex('account_security_flags').where('account_user_id', user.id).first();
    if (!hasFlags) {
      await knex('account_security_flags').insert({
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

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('account_security_flags');
  await knex.schema.dropTableIfExists('account_subscriptions');
  await knex.schema.dropTableIfExists('platform_impersonation_sessions');
  await knex.schema.dropTableIfExists('platform_admin_audit_logs');
  await knex.schema.dropTableIfExists('platform_admin_profiles');
  await knex.schema.dropTableIfExists('refresh_tokens');
};
