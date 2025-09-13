/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.raw(`
    -- SQLite: Recreate table with new status values for email tracking
    -- Backup current data
    CREATE TABLE emails_backup AS SELECT * FROM emails;

    -- Drop original table
    DROP TABLE emails;

    -- Recreate with new status enum including 'opened' and 'clicked'
    CREATE TABLE emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      cc TEXT,
      bcc TEXT,
      reply_to TEXT,
      subject TEXT NOT NULL,
      html_content TEXT,
      text_content TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'opened', 'clicked')),
      sent_at DATETIME,
      delivered_at DATETIME,
      bounced_at DATETIME,
      bounce_reason TEXT,
      campaign_id INTEGER,
      template_id INTEGER,
      tags TEXT,
      metadata TEXT,
      attempts INTEGER DEFAULT 0,
      error_message TEXT,
      message_id TEXT,
      tracking_id TEXT,
      tracking_enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Restore data
    INSERT INTO emails SELECT * FROM emails_backup;

    -- Drop backup
    DROP TABLE emails_backup;

    -- Recreate indexes (from original migration)
    CREATE INDEX idx_emails_user_id ON emails(user_id);
    CREATE INDEX idx_emails_status ON emails(status);
    CREATE INDEX idx_emails_tracking_id ON emails(tracking_id);
    CREATE INDEX idx_emails_message_id ON emails(message_id);
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.raw(`
    -- Restore original status enum (remove 'opened' and 'clicked')
    CREATE TABLE emails_backup AS SELECT * FROM emails;
    DROP TABLE emails;

    CREATE TABLE emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      cc TEXT,
      bcc TEXT,
      reply_to TEXT,
      subject TEXT NOT NULL,
      html_content TEXT,
      text_content TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
      sent_at DATETIME,
      delivered_at DATETIME,
      bounced_at DATETIME,
      bounce_reason TEXT,
      campaign_id INTEGER,
      template_id INTEGER,
      tags TEXT,
      metadata TEXT,
      attempts INTEGER DEFAULT 0,
      error_message TEXT,
      message_id TEXT,
      tracking_id TEXT,
      tracking_enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    INSERT INTO emails SELECT * FROM emails_backup;
    DROP TABLE emails_backup;

    CREATE INDEX idx_emails_user_id ON emails(user_id);
    CREATE INDEX idx_emails_status ON emails(status);
    CREATE INDEX idx_emails_tracking_id ON emails(tracking_id);
    CREATE INDEX idx_emails_message_id ON emails(message_id);
  `);
};