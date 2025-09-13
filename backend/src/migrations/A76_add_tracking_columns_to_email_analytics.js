/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('email_analytics', function(table) {
    // Add tracking_id column for linking tracking events to specific emails
    table.string('tracking_id').nullable().comment('Tracking ID from email for linking events');

    // Add link_url column for click tracking
    table.text('link_url').nullable().comment('URL clicked in email (for click events)');

    // Add indexes for better performance
    table.index(['tracking_id'], 'idx_email_analytics_tracking_id');
    table.index(['event_type', 'tracking_id'], 'idx_email_analytics_event_tracking');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('email_analytics', function(table) {
    table.dropIndex(['tracking_id'], 'idx_email_analytics_tracking_id');
    table.dropIndex(['event_type', 'tracking_id'], 'idx_email_analytics_event_tracking');
    table.dropColumn('tracking_id');
    table.dropColumn('link_url');
  });
};