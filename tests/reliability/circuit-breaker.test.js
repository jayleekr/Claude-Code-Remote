import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import CircuitBreaker from '../../src/reliability/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    circuitBreaker = new CircuitBreaker('test-server', {
      logger: mockLogger,
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 100,  // 100ms for faster tests
      monitoringWindow: 60000
    });

    // Clear all timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should have zero failure and success counts', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.state).toBe('CLOSED');
    });
  });

  describe('CLOSED state behavior', () => {
    it('should allow requests in CLOSED state', () => {
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should increment failure count on recordFailure', () => {
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getStats().failureCount).toBe(1);
    });

    it('should decrement failure count on recordSuccess', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getStats().failureCount).toBe(1);
    });

    it('should not go below zero failure count', () => {
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });
  });

  describe('state transitions', () => {
    it('should transition from CLOSED to OPEN after threshold failures', () => {
      // Record 5 failures (threshold)
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      expect(circuitBreaker.getState()).toBe('OPEN');
      expect(circuitBreaker.isOpen()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: expect.stringContaining('Circuit breaker opened')
        })
      );
    });

    it('should reject requests immediately in OPEN state', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      expect(() => circuitBreaker.checkState()).toThrow('Circuit breaker is OPEN');
    });

    it('should transition from OPEN to HALF_OPEN after timeout', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      expect(circuitBreaker.getState()).toBe('OPEN');

      // Advance time past timeout (100ms)
      vi.advanceTimersByTime(100);

      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: expect.stringContaining('Circuit breaker half-open')
        })
      );
    });

    it('should allow probe requests in HALF_OPEN state', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      // Advance to HALF_OPEN
      vi.advanceTimersByTime(100);

      expect(() => circuitBreaker.checkState()).not.toThrow();
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
    });

    it('should return to OPEN if probe fails in HALF_OPEN', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      // Advance to HALF_OPEN
      vi.advanceTimersByTime(100);

      // Probe fails
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe('OPEN');
    });

    it('should transition to CLOSED after success threshold in HALF_OPEN', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      // Advance to HALF_OPEN
      vi.advanceTimersByTime(100);

      // Record 2 successes (threshold)
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.getStats().failureCount).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: expect.stringContaining('Circuit breaker closed')
        })
      );
    });

    it('should not close immediately on first success in HALF_OPEN', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      // Advance to HALF_OPEN
      vi.advanceTimersByTime(100);

      // Record 1 success (below threshold)
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
    });
  });

  describe('error tracking', () => {
    it('should track last failure time', () => {
      const beforeFailure = Date.now();
      circuitBreaker.recordFailure();
      const afterFailure = Date.now();

      const stats = circuitBreaker.getStats();
      expect(stats.lastFailureTime).toBeGreaterThanOrEqual(beforeFailure);
      expect(stats.lastFailureTime).toBeLessThanOrEqual(afterFailure);
    });

    it('should track last success time', () => {
      const beforeSuccess = Date.now();
      circuitBreaker.recordSuccess();
      const afterSuccess = Date.now();

      const stats = circuitBreaker.getStats();
      expect(stats.lastSuccessTime).toBeGreaterThanOrEqual(beforeSuccess);
      expect(stats.lastSuccessTime).toBeLessThanOrEqual(afterSuccess);
    });

    it('should track consecutive failures', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getStats().consecutiveFailures).toBe(3);
    });

    it('should reset consecutive failures on success', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getStats().consecutiveFailures).toBe(0);
    });
  });

  describe('reset functionality', () => {
    it('should reset to initial state', () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      expect(circuitBreaker.getState()).toBe('OPEN');

      // Reset
      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.getStats().failureCount).toBe(0);
      expect(circuitBreaker.getStats().successCount).toBe(0);
    });

    it('should log reset event', () => {
      circuitBreaker.reset();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: expect.stringContaining('Circuit breaker reset')
        })
      );
    });
  });

  describe('statistics', () => {
    it('should provide comprehensive stats', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordSuccess();

      const stats = circuitBreaker.getStats();

      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failureCount');
      expect(stats).toHaveProperty('successCount');
      expect(stats).toHaveProperty('lastFailureTime');
      expect(stats).toHaveProperty('lastSuccessTime');
      expect(stats).toHaveProperty('consecutiveFailures');
    });

    it('should track total operations', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordSuccess();
      circuitBreaker.recordFailure();

      const stats = circuitBreaker.getStats();
      expect(stats.totalOperations).toBe(3);
    });

    it('should calculate success rate', () => {
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();
      circuitBreaker.recordFailure();

      const stats = circuitBreaker.getStats();
      expect(stats.successRate).toBeCloseTo(0.666, 2);
    });
  });

  describe('configuration', () => {
    it('should accept custom failure threshold', () => {
      const customCB = new CircuitBreaker('custom', {
        logger: mockLogger,
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 100
      });

      customCB.recordFailure();
      customCB.recordFailure();
      expect(customCB.getState()).toBe('CLOSED');

      customCB.recordFailure();
      expect(customCB.getState()).toBe('OPEN');
    });

    it('should accept custom success threshold', () => {
      const customCB = new CircuitBreaker('custom', {
        logger: mockLogger,
        failureThreshold: 2,
        successThreshold: 3,
        timeout: 100
      });

      // Open the circuit
      customCB.recordFailure();
      customCB.recordFailure();

      // Move to HALF_OPEN
      vi.advanceTimersByTime(100);

      // Need 3 successes to close
      customCB.recordSuccess();
      customCB.recordSuccess();
      expect(customCB.getState()).toBe('HALF_OPEN');

      customCB.recordSuccess();
      expect(customCB.getState()).toBe('CLOSED');
    });
  });

  describe('edge cases', () => {
    it('should handle rapid state changes', () => {
      // Rapidly open and close
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }
      expect(circuitBreaker.getState()).toBe('OPEN');

      vi.advanceTimersByTime(100);
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should handle multiple timeout schedules', () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      // Should only schedule one timeout
      vi.advanceTimersByTime(100);
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');

      // Additional failures shouldn't create duplicate timeouts
      circuitBreaker.recordFailure();
      const timerCount = vi.getTimerCount();

      vi.advanceTimersByTime(100);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(timerCount);
    });
  });
});
