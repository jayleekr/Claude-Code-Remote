/**
 * DeadLetterQueue - Store and retry failed operations
 *
 * Provides persistent storage for failed operations with automatic retry logic.
 * Failed messages are retried with exponential backoff and archived after max attempts.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const DEFAULT_CONFIG = {
  maxAttempts: 5,
  retryIntervals: [60, 120, 240, 480, 960], // seconds: 1min, 2min, 4min, 8min, 16min
  cleanupInterval: 30 // days
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS dead_letter_messages (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    attempt_count INTEGER DEFAULT 0,
    first_failed_at INTEGER NOT NULL,
    last_attempted_at INTEGER,
    last_error TEXT,
    archived INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_dlq_type ON dead_letter_messages(type);
  CREATE INDEX IF NOT EXISTS idx_dlq_archived ON dead_letter_messages(archived);
  CREATE INDEX IF NOT EXISTS idx_dlq_retry ON dead_letter_messages(last_attempted_at) WHERE archived = 0;
`;

class DeadLetterQueue {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = config.logger || console;
    this.dbPath = config.dbPath || './sessions.db';

    // Initialize database
    this._initDatabase();
  }

  /**
   * Initialize database and create schema
   * @private
   */
  _initDatabase() {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  /**
   * Add a failed message to the queue
   *
   * @param {string} type - Message type (e.g., 'telegram_notification', 'ssh_command')
   * @param {object} payload - Message payload
   * @param {Error} error - Error that caused the failure
   * @returns {Promise<string>} Message ID
   */
  async enqueue(type, payload, error) {
    const id = randomUUID();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO dead_letter_messages (
        id, type, payload, attempt_count, first_failed_at, last_error, archived, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      type,
      JSON.stringify(payload),
      0,
      now,
      error.message,
      0,
      now
    );

    this.logger.warn({
      msg: 'Message added to dead letter queue',
      messageId: id,
      type,
      error: error.message
    });

    return id;
  }

  /**
   * Get a message by ID
   *
   * @param {string} messageId - Message ID
   * @returns {Promise<object|null>} Message object or null
   */
  async getMessage(messageId) {
    const stmt = this.db.prepare('SELECT * FROM dead_letter_messages WHERE id = ?');
    return stmt.get(messageId) || null;
  }

  /**
   * Get pending messages ready for retry
   *
   * @param {number} limit - Maximum number of messages to retrieve
   * @returns {Promise<Array>} Array of message objects
   */
  async dequeuePending(limit = 100) {
    const now = Date.now();

    // Get all non-archived messages under max attempts
    const allPending = this.db.prepare(`
      SELECT * FROM dead_letter_messages
      WHERE archived = 0
        AND attempt_count < ?
      ORDER BY first_failed_at ASC
    `).all(this.config.maxAttempts);

    // Filter messages that are ready for retry
    const readyForRetry = allPending.filter(msg => {
      // Never attempted - ready immediately
      if (!msg.last_attempted_at) {
        return true;
      }

      // Get retry interval for current attempt count
      const attemptIndex = Math.min(msg.attempt_count, this.config.retryIntervals.length - 1);
      const retryInterval = this.config.retryIntervals[attemptIndex];
      const retryThreshold = now - (retryInterval * 1000);

      // Ready if last attempt was before threshold
      return msg.last_attempted_at <= retryThreshold;
    });

    return readyForRetry.slice(0, limit);
  }

  /**
   * Record a retry attempt for a message
   *
   * @param {string} messageId - Message ID
   * @param {Error} error - Error from retry attempt
   * @returns {Promise<void>}
   */
  async recordRetryAttempt(messageId, error) {
    const now = Date.now();

    // Get current message
    const message = await this.getMessage(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }

    const newAttemptCount = message.attempt_count + 1;

    // Update message
    const stmt = this.db.prepare(`
      UPDATE dead_letter_messages
      SET attempt_count = ?,
          last_attempted_at = ?,
          last_error = ?
      WHERE id = ?
    `);

    stmt.run(newAttemptCount, now, error.message, messageId);

    this.logger.info({
      msg: 'Dead letter queue retry attempt recorded',
      messageId,
      attemptCount: newAttemptCount,
      error: error.message
    });

    // Archive if max attempts reached
    if (newAttemptCount >= this.config.maxAttempts) {
      await this._archiveMessage(messageId);
    }
  }

  /**
   * Record successful retry
   *
   * @param {string} messageId - Message ID
   * @returns {Promise<void>}
   */
  async recordSuccess(messageId) {
    const stmt = this.db.prepare('DELETE FROM dead_letter_messages WHERE id = ?');
    stmt.run(messageId);

    this.logger.info({
      msg: 'Dead letter queue message successfully retried',
      messageId
    });
  }

  /**
   * Archive a message after max attempts
   *
   * @param {string} messageId - Message ID
   * @returns {Promise<void>}
   * @private
   */
  async _archiveMessage(messageId) {
    const stmt = this.db.prepare('UPDATE dead_letter_messages SET archived = 1 WHERE id = ?');
    stmt.run(messageId);

    this.logger.error({
      msg: 'Dead letter queue message archived after max attempts',
      messageId,
      maxAttempts: this.config.maxAttempts
    });
  }

  /**
   * Manually archive a message
   *
   * @param {string} messageId - Message ID
   * @returns {Promise<void>}
   */
  async archive(messageId) {
    await this._archiveMessage(messageId);
  }

  /**
   * Get all archived messages
   *
   * @returns {Promise<Array>} Array of archived messages
   */
  async getArchived() {
    const stmt = this.db.prepare('SELECT * FROM dead_letter_messages WHERE archived = 1');
    return stmt.all();
  }

  /**
   * Get queue statistics
   *
   * @returns {Promise<object>} Statistics object
   */
  async getStats() {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM dead_letter_messages');
    const pendingStmt = this.db.prepare('SELECT COUNT(*) as count FROM dead_letter_messages WHERE archived = 0');
    const archivedStmt = this.db.prepare('SELECT COUNT(*) as count FROM dead_letter_messages WHERE archived = 1');
    const byTypeStmt = this.db.prepare('SELECT type, COUNT(*) as count FROM dead_letter_messages WHERE archived = 0 GROUP BY type');

    const total = totalStmt.get();
    const pending = pendingStmt.get();
    const archived = archivedStmt.get();
    const byType = byTypeStmt.all();

    const byTypeMap = {};
    byType.forEach(row => {
      byTypeMap[row.type] = row.count;
    });

    return {
      totalMessages: total.count,
      pendingMessages: pending.count,
      archivedMessages: archived.count,
      byType: byTypeMap
    };
  }

  /**
   * Clean up old archived messages
   *
   * @param {number} daysOld - Delete messages older than this many days
   * @returns {Promise<number>} Number of messages deleted
   */
  async cleanupOldArchived(daysOld = 30) {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    const stmt = this.db.prepare(`
      DELETE FROM dead_letter_messages
      WHERE archived = 1 AND created_at < ?
    `);

    const result = stmt.run(cutoffTime);

    this.logger.info({
      msg: 'Cleaned up old archived messages',
      deletedCount: result.changes,
      daysOld
    });

    return result.changes;
  }

  /**
   * Close database connection
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default DeadLetterQueue;
