/**
 * Session Recovery Manager Tests
 * Tests for automatic session recovery and cleanup functionality
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import SessionRecoveryManager from '../../src/hub/session-recovery.js';
import SessionManager from '../../src/hub/session-manager.js';
import CommandExecutor from '../../src/remote/command-executor.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('SessionRecoveryManager', () => {
  let db;
  let sessionManager;
  let commandExecutor;
  let recoveryManager;
  const testDbPath = path.join(__dirname, '../fixtures/test-recovery.db');

  beforeEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create SessionManager which will initialize the database
    sessionManager = new SessionManager(testDbPath);
    db = sessionManager.db;

    // Create mock serverRegistry for CommandExecutor
    const mockServerRegistry = {
      getAllServers: () => []
    };

    commandExecutor = new CommandExecutor(mockServerRegistry);
    recoveryManager = new SessionRecoveryManager(sessionManager, commandExecutor);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Expired Session Detection', () => {
    test('should detect expired sessions', () => {
      // Create active and expired sessions
      const now = Date.now();
      const expiredTime = now - 1000; // 1 second ago
      const activeTime = now + 3600000; // 1 hour from now

      db.prepare(`
        INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('session1', 'local', 1, 'token1', 'project1', 'tmux-session1', now, expiredTime, 'active');

      db.prepare(`
        INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('session2', 'local', 2, 'token2', 'project1', 'tmux-session2', now, activeTime, 'active');

      const expiredSessions = recoveryManager.detectExpiredSessions();

      expect(expiredSessions).toHaveLength(1);
      expect(expiredSessions[0].id).toBe('session1');
      expect(expiredSessions[0].status).toBe('active');
    });

    test('should return empty array when no expired sessions', () => {
      const now = Date.now();
      const activeTime = now + 3600000;

      db.prepare(`
        INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('session1', 'local', 1, 'token1', 'project1', 'tmux-session1', now, activeTime, 'active');

      const expiredSessions = recoveryManager.detectExpiredSessions();

      expect(expiredSessions).toHaveLength(0);
    });
  });

  describe('Session Recovery', () => {
    test('should recover expired sessions and cleanup tmux', async () => {
      const now = Date.now();
      const expiredTime = now - 1000;

      db.prepare(`
        INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('session1', 'local', 1, 'token1', 'project1', 'tmux-session1', now, expiredTime, 'active');

      const result = await recoveryManager.recoverExpiredSessions();

      expect(result.recovered).toBe(1);
      expect(result.failed).toBe(0);

      // Verify session marked as expired in database
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session1');
      expect(session.status).toBe('expired');
    });

    test('should handle tmux cleanup failures gracefully', async () => {
      const now = Date.now();
      const expiredTime = now - 1000;

      db.prepare(`
        INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('session1', 'local', 1, 'token1', 'project1', 'tmux-session1', now, expiredTime, 'active');

      // Mock commandExecutor to simulate failure
      commandExecutor.executeCommand = vi.fn().mockRejectedValue(new Error('tmux kill failed'));

      const result = await recoveryManager.recoverExpiredSessions();

      // Should still mark as expired even if tmux cleanup fails
      expect(result.recovered).toBe(1);
      expect(result.failed).toBe(0);
    });

    test('should recover multiple expired sessions', async () => {
      const now = Date.now();
      const expiredTime = now - 1000;

      for (let i = 1; i <= 3; i++) {
        db.prepare(`
          INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(`session${i}`, 'local', i, `token${i}`, 'project1', `tmux-session${i}`, now, expiredTime, 'active');
      }

      const result = await recoveryManager.recoverExpiredSessions();

      expect(result.recovered).toBe(3);
      expect(result.failed).toBe(0);

      // Verify all sessions marked as expired
      const expiredCount = db.prepare(
        "SELECT COUNT(*) as count FROM sessions WHERE status = 'expired'"
      ).get().count;
      expect(expiredCount).toBe(3);
    });
  });

  describe('Orphaned Session Cleanup', () => {
    test('should detect orphaned tmux sessions', async () => {
      // Mock tmux session list
      commandExecutor.executeCommand = vi.fn().mockResolvedValue({
        stdout: 'tmux-orphan1\ntmux-orphan2\ntmux-session1\n',
        stderr: ''
      });

      const now = Date.now();
      const activeTime = now + 3600000;

      // Only one session in database
      db.prepare(`
        INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('session1', 'local', 1, 'token1', 'project1', 'tmux-session1', now, activeTime, 'active');

      const orphaned = await recoveryManager.detectOrphanedSessions();

      expect(orphaned).toContain('tmux-orphan1');
      expect(orphaned).toContain('tmux-orphan2');
      expect(orphaned).not.toContain('tmux-session1');
    });

    test('should cleanup orphaned tmux sessions', async () => {
      const killCalls = [];
      commandExecutor.executeCommand = vi.fn()
        .mockImplementation((command) => {
          if (command.includes('list-sessions')) {
            return Promise.resolve({
              stdout: 'tmux-orphan1\ntmux-orphan2\n',
              stderr: ''
            });
          }
          if (command.includes('kill-session')) {
            killCalls.push(command);
            return Promise.resolve({ stdout: '', stderr: '' });
          }
          return Promise.resolve({ stdout: '', stderr: '' });
        });

      const result = await recoveryManager.cleanupOrphanedSessions();

      expect(result.cleaned).toBe(2);
      expect(killCalls).toHaveLength(2);
    });
  });

  describe('Session Health Check', () => {
    test('should check overall session health', async () => {
      const now = Date.now();
      const expiredTime = now - 1000;
      const activeTime = now + 3600000;

      // Create mix of active and expired sessions
      db.prepare(`
        INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('session1', 'local', 1, 'token1', 'project1', 'tmux-session1', now, activeTime, 'active');

      db.prepare(`
        INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('session2', 'local', 2, 'token2', 'project1', 'tmux-session2', now, expiredTime, 'active');

      commandExecutor.executeCommand = vi.fn().mockResolvedValue({
        stdout: 'tmux-session1\n',
        stderr: ''
      });

      const health = await recoveryManager.checkSessionHealth();

      expect(health.totalSessions).toBe(2);
      expect(health.activeSessions).toBe(1);
      expect(health.expiredSessions).toBe(1);
      expect(health.healthy).toBe(false);
    });

    test('should return healthy status when no issues', async () => {
      const now = Date.now();
      const activeTime = now + 3600000;

      db.prepare(`
        INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('session1', 'local', 1, 'token1', 'project1', 'tmux-session1', now, activeTime, 'active');

      commandExecutor.executeCommand = vi.fn().mockResolvedValue({
        stdout: 'tmux-session1\n',
        stderr: ''
      });

      const health = await recoveryManager.checkSessionHealth();

      expect(health.totalSessions).toBe(1);
      expect(health.activeSessions).toBe(1);
      expect(health.expiredSessions).toBe(0);
      expect(health.healthy).toBe(true);
    });
  });

  describe('Recovery Statistics', () => {
    test('should track recovery statistics', async () => {
      const now = Date.now();
      const expiredTime = now - 1000;

      // Create expired sessions
      for (let i = 1; i <= 2; i++) {
        db.prepare(`
          INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(`session${i}`, 'local', i, `token${i}`, 'project1', `tmux-session${i}`, now, expiredTime, 'active');
      }

      // Mock orphaned sessions
      commandExecutor.executeCommand = vi.fn()
        .mockImplementation((command) => {
          if (command.includes('list-sessions')) {
            return Promise.resolve({
              stdout: 'tmux-orphan1\n',
              stderr: ''
            });
          }
          return Promise.resolve({ stdout: '', stderr: '' });
        });

      // Perform recovery
      await recoveryManager.recoverExpiredSessions();
      await recoveryManager.cleanupOrphanedSessions();

      const stats = recoveryManager.getRecoveryStats();

      expect(stats.expiredRecovered).toBe(2);
      expect(stats.orphanedCleaned).toBe(1);
      expect(stats.lastRecovery).toBeDefined();
      expect(typeof stats.lastRecovery).toBe('number');
    });

    test('should reset statistics', () => {
      recoveryManager.stats = {
        expiredRecovered: 5,
        orphanedCleaned: 3,
        lastRecovery: Date.now()
      };

      recoveryManager.resetStats();

      const stats = recoveryManager.getRecoveryStats();
      expect(stats.expiredRecovered).toBe(0);
      expect(stats.orphanedCleaned).toBe(0);
      expect(stats.lastRecovery).toBeNull();
    });
  });

  describe('Manual Recovery Trigger', () => {
    test('should perform full recovery on demand', async () => {
      const now = Date.now();
      const expiredTime = now - 1000;

      // Create expired session
      db.prepare(`
        INSERT INTO sessions (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('session1', 'local', 1, 'token1', 'project1', 'tmux-session1', now, expiredTime, 'active');

      // Mock orphaned session
      commandExecutor.executeCommand = vi.fn()
        .mockImplementation((command) => {
          if (command.includes('list-sessions')) {
            return Promise.resolve({
              stdout: 'tmux-orphan1\n',
              stderr: ''
            });
          }
          return Promise.resolve({ stdout: '', stderr: '' });
        });

      const result = await recoveryManager.performFullRecovery();

      expect(result.expiredRecovered).toBe(1);
      expect(result.orphanedCleaned).toBe(1);
      expect(result.timestamp).toBeDefined();
    });
  });
});
