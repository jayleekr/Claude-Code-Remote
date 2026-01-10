import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import DeadLetterQueue from '../../src/reliability/dead-letter-queue.js';
import Database from 'better-sqlite3';
import { rmSync } from 'fs';

describe('DeadLetterQueue', () => {
  let dlq;
  let mockLogger;
  const testDbPath = './test-dlq.db';

  beforeEach(() => {
    // Clean up any existing test database
    try {
      rmSync(testDbPath, { force: true });
    } catch (error) {
      // Ignore if file doesn't exist
    }

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    dlq = new DeadLetterQueue({
      dbPath: testDbPath,
      logger: mockLogger,
      maxAttempts: 5,
      retryIntervals: [60, 120, 240, 480, 960] // 1min, 2min, 4min, 8min, 16min (in seconds for test)
    });
  });

  afterEach(async () => {
    if (dlq) {
      await dlq.close();
    }
    // Clean up test database
    try {
      rmSync(testDbPath, { force: true });
    } catch (error) {
      // Ignore errors
    }
  });

  describe('initialization', () => {
    it('should create database and schema', () => {
      const db = new Database(testDbPath);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map(t => t.name);

      expect(tableNames).toContain('dead_letter_messages');
      db.close();
    });

    it('should create proper indexes', () => {
      const db = new Database(testDbPath);
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
      const indexNames = indexes.map(i => i.name);

      expect(indexNames).toContain('idx_dlq_type');
      expect(indexNames).toContain('idx_dlq_archived');
      expect(indexNames).toContain('idx_dlq_retry');
      db.close();
    });
  });

  describe('enqueue', () => {
    it('should add message to queue', async () => {
      const payload = { chatId: 123, message: 'Test notification' };
      const error = new Error('Network timeout');

      const messageId = await dlq.enqueue('telegram_notification', payload, error);

      expect(messageId).toBeTruthy();
      expect(typeof messageId).toBe('string');

      const message = await dlq.getMessage(messageId);
      expect(message).toBeTruthy();
      expect(message.type).toBe('telegram_notification');
      expect(JSON.parse(message.payload)).toEqual(payload);
      expect(message.last_error).toBe('Network timeout');
    });

    it('should initialize attempt_count to 0', async () => {
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Test'));
      const message = await dlq.getMessage(messageId);

      expect(message.attempt_count).toBe(0);
    });

    it('should set first_failed_at timestamp', async () => {
      const beforeEnqueue = Date.now();
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Test'));
      const afterEnqueue = Date.now();

      const message = await dlq.getMessage(messageId);
      expect(message.first_failed_at).toBeGreaterThanOrEqual(beforeEnqueue);
      expect(message.first_failed_at).toBeLessThanOrEqual(afterEnqueue);
    });

    it('should set archived to false by default', async () => {
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Test'));
      const message = await dlq.getMessage(messageId);

      expect(message.archived).toBe(0); // SQLite uses 0 for false
    });

    it('should log enqueue event', async () => {
      await dlq.enqueue('telegram_notification', { test: 'data' }, new Error('Test'));

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: expect.stringContaining('Message added to dead letter queue')
        })
      );
    });
  });

  describe('dequeue', () => {
    it('should retrieve pending messages', async () => {
      const id1 = await dlq.enqueue('type1', { data: 1 }, new Error('Err1'));
      const id2 = await dlq.enqueue('type2', { data: 2 }, new Error('Err2'));

      const pending = await dlq.dequeuePending(10);

      expect(pending).toHaveLength(2);
      expect(pending.map(m => m.id)).toContain(id1);
      expect(pending.map(m => m.id)).toContain(id2);
    });

    it('should respect limit parameter', async () => {
      await dlq.enqueue('type1', { data: 1 }, new Error('Err1'));
      await dlq.enqueue('type2', { data: 2 }, new Error('Err2'));
      await dlq.enqueue('type3', { data: 3 }, new Error('Err3'));

      const pending = await dlq.dequeuePending(2);

      expect(pending).toHaveLength(2);
    });

    it('should not return archived messages', async () => {
      const id1 = await dlq.enqueue('type1', { data: 1 }, new Error('Err1'));
      await dlq.enqueue('type2', { data: 2 }, new Error('Err2'));

      // Archive one message
      await dlq.archive(id1);

      const pending = await dlq.dequeuePending(10);

      expect(pending).toHaveLength(1);
      expect(pending[0].type).toBe('type2');
    });

    it('should return messages ready for retry', async () => {
      const now = Date.now();
      const id1 = await dlq.enqueue('type1', { data: 1 }, new Error('Err1'));

      // Mark as attempted in the past
      const db = new Database(testDbPath);
      db.prepare('UPDATE dead_letter_messages SET last_attempted_at = ?, attempt_count = 1 WHERE id = ?')
        .run(now - 120000, id1); // 2 minutes ago
      db.close();

      const pending = await dlq.dequeuePending(10);
      expect(pending).toHaveLength(1);
    });

    it('should not return messages not ready for retry', async () => {
      const now = Date.now();
      const id1 = await dlq.enqueue('type1', { data: 1 }, new Error('Err1'));

      // Mark as attempted very recently
      const db = new Database(testDbPath);
      db.prepare('UPDATE dead_letter_messages SET last_attempted_at = ?, attempt_count = 1 WHERE id = ?')
        .run(now - 30000, id1); // 30 seconds ago (retry interval is 60s)
      db.close();

      const pending = await dlq.dequeuePending(10);
      expect(pending).toHaveLength(0);
    });
  });

  describe('retry logic', () => {
    it('should update attempt count on retry', async () => {
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Test'));

      await dlq.recordRetryAttempt(messageId, new Error('Retry failed'));

      const message = await dlq.getMessage(messageId);
      expect(message.attempt_count).toBe(1);
    });

    it('should update last_attempted_at on retry', async () => {
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Test'));

      const beforeRetry = Date.now();
      await dlq.recordRetryAttempt(messageId, new Error('Retry failed'));
      const afterRetry = Date.now();

      const message = await dlq.getMessage(messageId);
      expect(message.last_attempted_at).toBeGreaterThanOrEqual(beforeRetry);
      expect(message.last_attempted_at).toBeLessThanOrEqual(afterRetry);
    });

    it('should update last_error on retry failure', async () => {
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Original'));

      await dlq.recordRetryAttempt(messageId, new Error('New error'));

      const message = await dlq.getMessage(messageId);
      expect(message.last_error).toBe('New error');
    });

    it('should archive after max attempts', async () => {
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Test'));

      // Simulate 5 retry attempts
      for (let i = 0; i < 5; i++) {
        await dlq.recordRetryAttempt(messageId, new Error(`Attempt ${i + 1}`));
      }

      const message = await dlq.getMessage(messageId);
      expect(message.archived).toBe(1); // SQLite uses 1 for true
      expect(message.attempt_count).toBe(5);
    });

    it('should log when message is archived', async () => {
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Test'));

      // Simulate max attempts
      for (let i = 0; i < 5; i++) {
        await dlq.recordRetryAttempt(messageId, new Error(`Attempt ${i + 1}`));
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: expect.stringContaining('archived after max attempts')
        })
      );
    });
  });

  describe('success handling', () => {
    it('should remove message on successful retry', async () => {
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Test'));

      await dlq.recordSuccess(messageId);

      const message = await dlq.getMessage(messageId);
      expect(message).toBeNull();
    });

    it('should log successful retry', async () => {
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Test'));

      await dlq.recordSuccess(messageId);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: expect.stringContaining('successfully retried')
        })
      );
    });
  });

  describe('archive functionality', () => {
    it('should archive a message manually', async () => {
      const messageId = await dlq.enqueue('test', { data: 'test' }, new Error('Test'));

      await dlq.archive(messageId);

      const message = await dlq.getMessage(messageId);
      expect(message.archived).toBe(1);
    });

    it('should get all archived messages', async () => {
      const id1 = await dlq.enqueue('type1', { data: 1 }, new Error('Err1'));
      const id2 = await dlq.enqueue('type2', { data: 2 }, new Error('Err2'));

      await dlq.archive(id1);

      const archived = await dlq.getArchived();
      expect(archived).toHaveLength(1);
      expect(archived[0].id).toBe(id1);
    });
  });

  describe('statistics', () => {
    it('should provide queue statistics', async () => {
      await dlq.enqueue('type1', { data: 1 }, new Error('Err1'));
      await dlq.enqueue('type2', { data: 2 }, new Error('Err2'));
      const id3 = await dlq.enqueue('type3', { data: 3 }, new Error('Err3'));
      await dlq.archive(id3);

      const stats = await dlq.getStats();

      expect(stats.totalMessages).toBe(3);
      expect(stats.pendingMessages).toBe(2);
      expect(stats.archivedMessages).toBe(1);
    });

    it('should provide stats by type', async () => {
      await dlq.enqueue('telegram_notification', { data: 1 }, new Error('Err1'));
      await dlq.enqueue('telegram_notification', { data: 2 }, new Error('Err2'));
      await dlq.enqueue('ssh_command', { data: 3 }, new Error('Err3'));

      const stats = await dlq.getStats();

      expect(stats.byType).toBeDefined();
      expect(stats.byType['telegram_notification']).toBe(2);
      expect(stats.byType['ssh_command']).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should delete old archived messages', async () => {
      const id1 = await dlq.enqueue('type1', { data: 1 }, new Error('Err1'));
      await dlq.archive(id1);

      // Manually set created_at to old date
      const db = new Database(testDbPath);
      const oldDate = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      db.prepare('UPDATE dead_letter_messages SET created_at = ? WHERE id = ?')
        .run(oldDate, id1);
      db.close();

      const deletedCount = await dlq.cleanupOldArchived(30); // Delete messages older than 30 days

      expect(deletedCount).toBe(1);

      const message = await dlq.getMessage(id1);
      expect(message).toBeNull();
    });

    it('should not delete recent archived messages', async () => {
      const id1 = await dlq.enqueue('type1', { data: 1 }, new Error('Err1'));
      await dlq.archive(id1);

      const deletedCount = await dlq.cleanupOldArchived(30);

      expect(deletedCount).toBe(0);

      const message = await dlq.getMessage(id1);
      expect(message).toBeTruthy();
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      await dlq.close();

      // Attempting to enqueue should not throw
      await expect(
        dlq.enqueue('test', { data: 'test' }, new Error('Test'))
      ).rejects.toThrow();
    });
  });
});
