/**
 * Session Recovery Manager
 * Handles automatic detection and cleanup of expired and orphaned sessions
 */

import Logger from '../core/logger.js';

export default class SessionRecoveryManager {
  constructor(sessionManager, commandExecutor) {
    this.sessionManager = sessionManager;
    this.commandExecutor = commandExecutor;
    this.logger = new Logger('SessionRecovery');

    // Recovery statistics
    this.stats = {
      expiredRecovered: 0,
      orphanedCleaned: 0,
      lastRecovery: null
    };
  }

  /**
   * Detect expired sessions in the database
   * @returns {Array} List of expired session objects
   */
  detectExpiredSessions() {
    const now = Date.now();
    const expiredSessions = this.sessionManager.db
      .prepare('SELECT * FROM sessions WHERE expiresAt < ? AND status = ?')
      .all(now, 'active');

    this.logger.info(`Detected ${expiredSessions.length} expired sessions`);
    return expiredSessions;
  }

  /**
   * Recover expired sessions by marking them as expired and cleaning up tmux
   * @returns {Promise<Object>} Recovery results {recovered, failed}
   */
  async recoverExpiredSessions() {
    const expiredSessions = this.detectExpiredSessions();
    let recovered = 0;
    let failed = 0;

    for (const session of expiredSessions) {
      try {
        // Try to kill the tmux session
        try {
          await this.commandExecutor.executeCommand(
            `tmux kill-session -t ${session.tmuxSession}`,
            { timeout: 5000 }
          );
          this.logger.debug(`Killed tmux session: ${session.tmuxSession}`);
        } catch (tmuxError) {
          // Log but don't fail - tmux session might not exist
          this.logger.warn(`Failed to kill tmux session ${session.tmuxSession}: ${tmuxError.message}`);
        }

        // Mark session as expired in database
        this.sessionManager.db
          .prepare("UPDATE sessions SET status = 'expired' WHERE id = ?")
          .run(session.id);

        recovered++;
        this.logger.info(`Recovered expired session: ${session.id}`);
      } catch (error) {
        failed++;
        this.logger.error(`Failed to recover session ${session.id}: ${error.message}`);
      }
    }

    // Update statistics
    this.stats.expiredRecovered += recovered;
    this.stats.lastRecovery = Date.now();

    this.logger.info(`Session recovery complete: ${recovered} recovered, ${failed} failed`);
    return { recovered, failed };
  }

  /**
   * Detect orphaned tmux sessions (not in database)
   * @returns {Promise<Array>} List of orphaned tmux session names
   */
  async detectOrphanedSessions() {
    try {
      // Get all tmux sessions
      const result = await this.commandExecutor.executeCommand(
        'tmux list-sessions -F "#{session_name}"',
        { timeout: 5000 }
      );

      const tmuxSessions = result.stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.trim());

      // Get all sessions from database
      const dbSessions = this.sessionManager.db
        .prepare('SELECT tmuxSession FROM sessions')
        .all()
        .map(row => row.tmuxSession);

      // Find orphaned sessions
      const orphaned = tmuxSessions.filter(
        tmuxSession => !dbSessions.includes(tmuxSession)
      );

      this.logger.info(`Detected ${orphaned.length} orphaned tmux sessions`);
      return orphaned;
    } catch (error) {
      this.logger.error(`Failed to detect orphaned sessions: ${error.message}`);
      return [];
    }
  }

  /**
   * Cleanup orphaned tmux sessions
   * @returns {Promise<Object>} Cleanup results {cleaned, failed}
   */
  async cleanupOrphanedSessions() {
    const orphaned = await this.detectOrphanedSessions();
    let cleaned = 0;
    let failed = 0;

    for (const tmuxSession of orphaned) {
      try {
        await this.commandExecutor.executeCommand(
          `tmux kill-session -t ${tmuxSession}`,
          { timeout: 5000 }
        );

        cleaned++;
        this.logger.info(`Cleaned orphaned tmux session: ${tmuxSession}`);
      } catch (error) {
        failed++;
        this.logger.error(`Failed to cleanup orphaned session ${tmuxSession}: ${error.message}`);
      }
    }

    // Update statistics
    this.stats.orphanedCleaned += cleaned;
    this.stats.lastRecovery = Date.now();

    this.logger.info(`Orphaned session cleanup complete: ${cleaned} cleaned, ${failed} failed`);
    return { cleaned, failed };
  }

  /**
   * Check overall session health
   * @returns {Promise<Object>} Health status
   */
  async checkSessionHealth() {
    const now = Date.now();

    // Get session counts
    const totalSessions = this.sessionManager.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'active'")
      .get().count;

    const expiredSessions = this.sessionManager.db
      .prepare('SELECT COUNT(*) as count FROM sessions WHERE expiresAt < ? AND status = ?')
      .get(now, 'active').count;

    const activeSessions = totalSessions - expiredSessions;

    // Check for orphaned sessions
    const orphaned = await this.detectOrphanedSessions();

    const healthy = expiredSessions === 0 && orphaned.length === 0;

    const health = {
      totalSessions,
      activeSessions,
      expiredSessions,
      orphanedSessions: orphaned.length,
      healthy,
      timestamp: Date.now()
    };

    this.logger.info('Session health check:', health);
    return health;
  }

  /**
   * Get recovery statistics
   * @returns {Object} Recovery stats
   */
  getRecoveryStats() {
    return {
      expiredRecovered: this.stats.expiredRecovered,
      orphanedCleaned: this.stats.orphanedCleaned,
      lastRecovery: this.stats.lastRecovery
    };
  }

  /**
   * Reset recovery statistics
   */
  resetStats() {
    this.stats = {
      expiredRecovered: 0,
      orphanedCleaned: 0,
      lastRecovery: null
    };
    this.logger.info('Recovery statistics reset');
  }

  /**
   * Perform full recovery (expired + orphaned)
   * @returns {Promise<Object>} Full recovery results
   */
  async performFullRecovery() {
    this.logger.info('Starting full session recovery');

    const expiredResult = await this.recoverExpiredSessions();
    const orphanedResult = await this.cleanupOrphanedSessions();

    const result = {
      expiredRecovered: expiredResult.recovered,
      expiredFailed: expiredResult.failed,
      orphanedCleaned: orphanedResult.cleaned,
      orphanedFailed: orphanedResult.failed,
      timestamp: Date.now()
    };

    this.logger.info('Full recovery complete:', result);
    return result;
  }
}
