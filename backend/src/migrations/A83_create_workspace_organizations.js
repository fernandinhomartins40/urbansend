const slugify = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  if (!hasOrganizations) {
    await knex.schema.createTable('organizations', (table) => {
      table.increments('id').primary();
      table.integer('owner_user_id').unsigned().notNullable();
      table.string('name').notNullable();
      table.string('slug').notNullable().unique();
      table.boolean('is_personal').defaultTo(false);
      table.timestamps(true, true);

      table.foreign('owner_user_id').references('id').inTable('users').onDelete('CASCADE');
      table.index('owner_user_id');
      table.index('slug');
    });
  }

  const hasMemberships = await knex.schema.hasTable('organization_memberships');
  if (!hasMemberships) {
    await knex.schema.createTable('organization_memberships', (table) => {
      table.increments('id').primary();
      table.integer('organization_id').unsigned().notNullable();
      table.integer('user_id').unsigned().notNullable();
      table.enum('role', ['owner', 'admin', 'member']).notNullable().defaultTo('member');
      table.string('status').notNullable().defaultTo('active');
      table.integer('invited_by').unsigned().nullable();
      table.timestamps(true, true);

      table.foreign('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.foreign('invited_by').references('id').inTable('users').onDelete('SET NULL');
      table.unique(['organization_id', 'user_id']);
      table.index(['user_id', 'status']);
    });
  }

  const hasInvitations = await knex.schema.hasTable('organization_invitations');
  if (!hasInvitations) {
    await knex.schema.createTable('organization_invitations', (table) => {
      table.increments('id').primary();
      table.integer('organization_id').unsigned().notNullable();
      table.string('email').notNullable();
      table.enum('role', ['owner', 'admin', 'member']).notNullable().defaultTo('member');
      table.string('token').notNullable().unique();
      table.string('status').notNullable().defaultTo('pending');
      table.integer('invited_by').unsigned().nullable();
      table.timestamp('expires_at').nullable();
      table.timestamp('accepted_at').nullable();
      table.timestamps(true, true);

      table.foreign('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
      table.foreign('invited_by').references('id').inTable('users').onDelete('SET NULL');
      table.index(['organization_id', 'status']);
      table.index(['email', 'status']);
    });
  }

  const hasActiveOrganizationColumn = await knex.schema.hasColumn('users', 'active_organization_id');
  if (!hasActiveOrganizationColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.integer('active_organization_id').unsigned().nullable();
      table.foreign('active_organization_id').references('id').inTable('organizations').onDelete('SET NULL');
      table.index('active_organization_id');
    });
  }

  const users = await knex('users').select('id', 'name', 'organization');
  for (const user of users) {
    let organization = await knex('organizations')
      .where('owner_user_id', user.id)
      .where('is_personal', true)
      .first();

    if (!organization) {
      const baseName = user.organization || `${user.name} Workspace`;
      let slug = slugify(baseName) || `workspace-${user.id}`;
      let counter = 1;
      while (await knex('organizations').where('slug', slug).first()) {
        counter += 1;
        slug = `${slugify(baseName) || `workspace-${user.id}`}-${counter}`;
      }

      await knex('organizations').insert({
        owner_user_id: user.id,
        name: baseName,
        slug,
        is_personal: true,
        created_at: new Date(),
        updated_at: new Date()
      });

      organization = await knex('organizations')
        .where('owner_user_id', user.id)
        .where('slug', slug)
        .first();
    }

    const existingMembership = await knex('organization_memberships')
      .where('organization_id', organization.id)
      .where('user_id', user.id)
      .first();

    if (!existingMembership) {
      await knex('organization_memberships').insert({
        organization_id: organization.id,
        user_id: user.id,
        role: 'owner',
        status: 'active',
        invited_by: user.id,
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    await knex('users')
      .where('id', user.id)
      .update({
        active_organization_id: organization.id,
        updated_at: new Date()
      });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const hasActiveOrganizationColumn = await knex.schema.hasColumn('users', 'active_organization_id');
  if (hasActiveOrganizationColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('active_organization_id');
    });
  }

  await knex.schema.dropTableIfExists('organization_invitations');
  await knex.schema.dropTableIfExists('organization_memberships');
  await knex.schema.dropTableIfExists('organizations');
};
