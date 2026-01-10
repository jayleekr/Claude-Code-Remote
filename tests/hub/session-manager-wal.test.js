import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SessionManager from '../../src/hub/session-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('SessionManager - WAL Mode', () => {
  let sessionManager;
  const testDbPath = path.join(__dirname, '../test-data/test-sessions-wal.db');

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    const walPath = `${testDbPath}-wal`;
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }

    sessionManager = new SessionManager(testDbPath);
  });

  afterEach(() => {
    if (sessionManager && sessionManager.db) {
      sessionManager.close();
    }
    // Clean up test files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    const walPath = `${testDbPath}-wal`;
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
    const shmPath = `${testDbPath}-shm`;
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }
  });

  describe('WAL Mode Activation', () => {
    it('should enable WAL journal mode on initialization', () => {
      const journalMode = sessionManager.db.pragma('journal_mode', { simple: true });
      expect(journalMode).toBe('wal');
    });

    it('should set synchronous mode to NORMAL', () => {
      const syncMode = sessionManager.db.pragma('synchronous', { simple: true });
      expect(syncMode).toBe(1); // NORMAL = 1
    });

    it('should set cache size to 64MB', () => {
      const cacheSize = sessionManager.db.pragma('cache_size', { simple: true });
      expect(cacheSize).toBe(-64000); // Negative = KB
    });
  });

  describe('Concurrent Read Performance', () => {
    it('should allow concurrent reads without blocking', async () => {
      // Create test session
      const session = await sessionManager.createSession({
        serverId: 'test-server',
        project: 'concurrent-test',
        metadata: { purpose: 'concurrency-test' }
      });

      const identifier = `${session.serverId}:${session.serverNumber}`;

      // Perform multiple concurrent reads
      const reads = [];
      for (let i = 0; i < 10; i++) {
        reads.push(
          new Promise((resolve) => {
            const foundSession = sessionManager.findSession(identifier);
            resolve(foundSession);
          })
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(reads);
      const duration = Date.now() - startTime;

      // All reads should succeed
      expect(results).toHaveLength(10);
      results.forEach(foundSession => {
        expect(foundSession).toBeTruthy();
        expect(foundSession.id).toBe(session.id);
      });

      // Concurrent reads should be fast (< 100ms for 10 reads)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Checkpoint Management', () => {
    it('should provide checkpoint() method', () => {
      expect(typeof sessionManager.checkpoint).toBe('function');
    });

    it('should successfully execute checkpoint', async () => {
      // Create some test data
      await sessionManager.createSession({
        serverId: 'checkpoint-server',
        project: 'checkpoint-test',
        metadata: { purpose: 'checkpoint-test' }
      });

      // Execute checkpoint
      expect(() => sessionManager.checkpoint()).not.toThrow();
    });

    it('should execute checkpoint on close()', async () => {
      // Create test data
      await sessionManager.createSession({
        serverId: 'close-server',
        project: 'close-test',
        metadata: { purpose: 'close-test' }
      });

      // Close should not throw
      expect(() => sessionManager.close()).not.toThrow();

      // WAL file should be cleaned up after checkpoint
      const walPath = `${testDbPath}-wal`;
      // After checkpoint and close, WAL should be minimal or removed
      if (fs.existsSync(walPath)) {
        const stats = fs.statSync(walPath);
        // WAL should be very small after checkpoint
        expect(stats.size).toBeLessThan(1000);
      }
    });
  });

  describe('WAL Information', () => {
    it('should provide getWALInfo() method', () => {
      expect(typeof sessionManager.getWALInfo).toBe('function');
    });

    it('should return WAL status and statistics', async () => {
      // Create some data to generate WAL activity
      for (let i = 0; i < 5; i++) {
        await sessionManager.createSession({
          serverId: 'wal-server',
          project: `wal-info-${i}`,
          metadata: { index: i }
        });
      }

      const walInfo = sessionManager.getWALInfo();

      expect(walInfo).toBeTruthy();
      expect(typeof walInfo).toBe('object');
      expect(walInfo).toHaveProperty('journalMode');
      expect(walInfo.journalMode).toBe('wal');
      expect(walInfo).toHaveProperty('walAutocheckpoint');
      expect(walInfo).toHaveProperty('synchronous');
      expect(walInfo).toHaveProperty('cacheSize');
    });
  });

  describe('Backward Compatibility', () => {
    it('should not break existing session operations', async () => {
      // Create session
      const session = await sessionManager.createSession({
        serverId: 'compat-server',
        project: 'compat-test',
        metadata: { purpose: 'compatibility-test' }
      });

      const identifier = `${session.serverId}:${session.serverNumber}`;

      // Read session
      const foundSession = sessionManager.findSession(identifier);
      expect(foundSession).toBeTruthy();
      expect(foundSession.id).toBe(session.id);

      // Read by token
      const foundByToken = sessionManager.findSession(session.token);
      expect(foundByToken).toBeTruthy();
      expect(foundByToken.id).toBe(session.id);

      // Get all sessions
      const allSessions = sessionManager.getAllSessions();
      expect(allSessions.length).toBeGreaterThan(0);

      // Get server sessions
      const serverSessions = sessionManager.getServerSessions('compat-server');
      expect(serverSessions.length).toBe(1);
      expect(serverSessions[0].id).toBe(session.id);
    });
  });
});
