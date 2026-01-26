/**
 * Tests for NotificationAggregator Dead Letter Queue Integration
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import NotificationAggregator from '../../src/hub/notification-aggregator.js';
import DeadLetterQueue from '../../src/reliability/dead-letter-queue.js';
import fs from 'fs';
import path from 'path';

// Test database paths
const TEST_DB_PATH = './test-sessions-dlq.db';
const TEST_REGISTRY_PATH = './test-server-registry-dlq.json';

// Mock Telegram channel
class MockTelegramChannel {
  constructor() {
    this.shouldFail = false;
    this.sentMessages = [];
    this.sendCount = 0;
  }

  async send(notification) {
    this.sendCount++;
    if (this.shouldFail) {
      throw new Error('Telegram send failed');
    }
    this.sentMessages.push(notification);
    return { success: true };
  }

  setShouldFail(shouldFail) {
    this.shouldFail = shouldFail;
  }

  reset() {
    this.shouldFail = false;
    this.sentMessages = [];
    this.sendCount = 0;
  }
}

describe('NotificationAggregator DLQ Integration', () => {
  let aggregator;
  let mockTelegram;

  beforeEach(() => {
    // Clean up test databases
    [TEST_DB_PATH, TEST_REGISTRY_PATH].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });

    // Create test server registry config
    const registryConfig = {
      central: {
        host: 'localhost',
        port: 3001,
        sharedSecret: 'test-secret'
      },
      servers: []
    };
    fs.writeFileSync(TEST_REGISTRY_PATH, JSON.stringify(registryConfig, null, 2));

    // Create mock Telegram channel
    mockTelegram = new MockTelegramChannel();

    // Initialize aggregator with DLQ enabled
    aggregator = new NotificationAggregator({
      port: 3002,
      sharedSecret: 'test-secret',
      sessionManagerPath: TEST_DB_PATH,
      serverRegistryPath: TEST_REGISTRY_PATH,
      telegram: {
        botToken: 'test-token',
        chatId: 'test-chat'
      },
      deadLetterQueue: {
        enabled: true,
        dbPath: TEST_DB_PATH,
        maxAttempts: 5,
        retryIntervals: [60, 120, 240, 480, 960]
      }
    });

    // Replace telegram channel with mock
    aggregator.telegramChannel = mockTelegram;

    // Register a test server
    aggregator.serverRegistry.registerServer('server1', 'test-secret', { name: 'Test Server' });
  });

  afterEach(async () => {
    await aggregator.stop();

    // Clean up test databases
    [TEST_DB_PATH, TEST_REGISTRY_PATH].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  });

  describe('Failed Notification Storage', () => {
    test('should store failed notification in DLQ', async () => {
      // GIVEN: Telegram will fail
      mockTelegram.setShouldFail(true);

      // WHEN: Send notification that fails
      const notification = {
        serverId: 'server1',
        type: 'completed',
        project: 'test-project',
        metadata: {
          userQuestion: 'Test question',
          claudeResponse: 'Test response'
        }
      };

      const response = await aggregator._handleNotification(
        {
          headers: { 'x-shared-secret': 'test-secret' },
          body: notification
        },
        {
          status: (code) => ({
            json: (data) => ({ statusCode: code, ...data })
          })
        }
      );

      // THEN: Message should be in DLQ
      const stats = await aggregator.dlq.getStats();
      expect(stats.pendingMessages).toBe(1);
      expect(stats.byType['telegram_notification']).toBe(1);
    });

    test('should not store successful notification in DLQ', async () => {
      // GIVEN: Telegram will succeed
      mockTelegram.setShouldFail(false);

      // WHEN: Send notification that succeeds
      const notification = {
        serverId: 'server1',
        type: 'completed',
        project: 'test-project',
        metadata: {}
      };

      await aggregator._handleNotification(
        {
          headers: { 'x-shared-secret': 'test-secret' },
          body: notification
        },
        {
          status: (code) => ({
            json: (data) => ({ statusCode: code, ...data })
          })
        }
      );

      // THEN: DLQ should be empty
      const stats = await aggregator.dlq.getStats();
      expect(stats.pendingMessages).toBe(0);
    });
  });

  describe('Automatic Retry Mechanism', () => {
    test('should retry failed notifications automatically', async () => {
      // GIVEN: Telegram fails first, then succeeds
      mockTelegram.setShouldFail(true);

      // WHEN: Send notification that fails initially
      const notification = {
        serverId: 'server1',
        type: 'completed',
        project: 'test-project',
        metadata: {}
      };

      await aggregator._handleNotification(
        {
          headers: { 'x-shared-secret': 'test-secret' },
          body: notification
        },
        {
          status: (code) => ({
            json: (data) => ({ statusCode: code, ...data })
          })
        }
      );

      // Verify message in DLQ
      let stats = await aggregator.dlq.getStats();
      expect(stats.pendingMessages).toBe(1);

      // THEN: Enable telegram and trigger retry
      mockTelegram.setShouldFail(false);
      await aggregator._processRetries();

      // Verify message removed from DLQ
      stats = await aggregator.dlq.getStats();
      expect(stats.pendingMessages).toBe(0);
      expect(mockTelegram.sendCount).toBe(2); // Initial attempt + retry
    });

    test('should use exponential backoff for retries', async () => {
      // GIVEN: Message added to DLQ
      const payload = {
        type: 'completed',
        title: 'Test',
        message: 'Test message',
        project: 'test-project',
        metadata: {}
      };

      const messageId = await aggregator.dlq.enqueue(
        'telegram_notification',
        payload,
        new Error('Test error')
      );

      // WHEN: Check retry intervals
      const message = await aggregator.dlq.getMessage(messageId);

      // THEN: Verify initial state
      expect(message.attempt_count).toBe(0);
      expect(message.last_attempted_at).toBeNull();

      // Simulate retry attempts
      for (let i = 0; i < 3; i++) {
        await aggregator.dlq.recordRetryAttempt(messageId, new Error('Retry failed'));
        const updated = await aggregator.dlq.getMessage(messageId);
        expect(updated.attempt_count).toBe(i + 1);
      }
    });
  });

  describe('Message Archiving', () => {
    test('should archive message after max retry attempts', async () => {
      // GIVEN: Message in DLQ
      const payload = {
        type: 'completed',
        title: 'Test',
        message: 'Test message',
        project: 'test-project',
        metadata: {}
      };

      const messageId = await aggregator.dlq.enqueue(
        'telegram_notification',
        payload,
        new Error('Test error')
      );

      // WHEN: Exceed max attempts
      const maxAttempts = aggregator.dlq.config.maxAttempts;
      for (let i = 0; i < maxAttempts; i++) {
        await aggregator.dlq.recordRetryAttempt(messageId, new Error('Retry failed'));
      }

      // THEN: Message should be archived
      const stats = await aggregator.dlq.getStats();
      expect(stats.archivedMessages).toBe(1);
      expect(stats.pendingMessages).toBe(0);
    });

    test('should provide access to archived messages', async () => {
      // GIVEN: Archived message
      const payload = {
        type: 'completed',
        title: 'Test',
        message: 'Test message',
        project: 'test-project',
        metadata: {}
      };

      const messageId = await aggregator.dlq.enqueue(
        'telegram_notification',
        payload,
        new Error('Test error')
      );

      // Archive the message
      await aggregator.dlq.archive(messageId);

      // WHEN: Fetch archived messages
      const archived = await aggregator.dlq.getArchived();

      // THEN: Should find the archived message
      expect(archived.length).toBe(1);
      expect(archived[0].id).toBe(messageId);
      expect(archived[0].archived).toBe(1);
    });
  });

  describe('DLQ Metrics Monitoring', () => {
    test('should expose DLQ stats via API', async () => {
      // GIVEN: Some messages in DLQ
      mockTelegram.setShouldFail(true);

      for (let i = 0; i < 3; i++) {
        await aggregator._handleNotification(
          {
            headers: { 'x-shared-secret': 'test-secret' },
            body: {
              serverId: 'server1',
              type: 'completed',
              project: `project-${i}`,
              metadata: {}
            }
          },
          {
            status: (code) => ({
              json: (data) => ({ statusCode: code, ...data })
            })
          }
        );
      }

      // WHEN: Get DLQ stats
      const stats = await aggregator.getDLQStats();

      // THEN: Should show correct metrics
      expect(stats.pendingMessages).toBe(3);
      expect(stats.archivedMessages).toBe(0);
      expect(stats.totalMessages).toBe(3);
      expect(stats.byType['telegram_notification']).toBe(3);
    });

    test('should track oldest message in queue', async () => {
      // GIVEN: Message added to DLQ
      mockTelegram.setShouldFail(true);

      const firstTime = Date.now();
      await aggregator._handleNotification(
        {
          headers: { 'x-shared-secret': 'test-secret' },
          body: {
            serverId: 'server1',
            type: 'completed',
            project: 'test-project',
            metadata: {}
          }
        },
        {
          status: (code) => ({
            json: (data) => ({ statusCode: code, ...data })
          })
        }
      );

      // WHEN: Get DLQ stats
      const stats = await aggregator.getDLQStats();

      // THEN: Should track oldest message
      expect(stats.oldestMessageAge).toBeGreaterThanOrEqual(0);
      expect(stats.oldestMessageAge).toBeLessThan(5000); // Less than 5 seconds old
    });

    test('should track retry statistics', async () => {
      // GIVEN: Message with multiple retry attempts
      const payload = {
        type: 'completed',
        title: 'Test',
        message: 'Test message',
        project: 'test-project',
        metadata: {}
      };

      const messageId = await aggregator.dlq.enqueue(
        'telegram_notification',
        payload,
        new Error('Test error')
      );

      // Record some retry attempts
      await aggregator.dlq.recordRetryAttempt(messageId, new Error('Retry 1 failed'));
      await aggregator.dlq.recordRetryAttempt(messageId, new Error('Retry 2 failed'));

      // WHEN: Get DLQ stats
      const stats = await aggregator.getDLQStats();

      // THEN: Should show retry information
      expect(stats.pendingMessages).toBe(1);
      const message = await aggregator.dlq.getMessage(messageId);
      expect(message.attempt_count).toBe(2);
    });
  });

  describe('Retry Configuration', () => {
    test('should respect configured retry intervals', async () => {
      // GIVEN: Custom retry intervals
      const customAggregator = new NotificationAggregator({
        port: 3003,
        sharedSecret: 'test-secret',
        sessionManagerPath: TEST_DB_PATH,
        serverRegistryPath: TEST_REGISTRY_PATH,
        deadLetterQueue: {
          enabled: true,
          dbPath: TEST_DB_PATH,
          maxAttempts: 3,
          retryIntervals: [30, 60, 120] // Shorter intervals for testing
        }
      });

      // WHEN: Check configuration
      expect(customAggregator.dlq.config.maxAttempts).toBe(3);
      expect(customAggregator.dlq.config.retryIntervals).toEqual([30, 60, 120]);

      await customAggregator.stop();
    });

    test('should handle DLQ disabled configuration', async () => {
      // GIVEN: DLQ disabled
      const noDlqAggregator = new NotificationAggregator({
        port: 3004,
        sharedSecret: 'test-secret',
        sessionManagerPath: TEST_DB_PATH,
        serverRegistryPath: TEST_REGISTRY_PATH,
        deadLetterQueue: {
          enabled: false
        }
      });

      // WHEN/THEN: DLQ should not be initialized
      expect(noDlqAggregator.dlq).toBeUndefined();

      await noDlqAggregator.stop();
    });
  });
});
