import { describe, it, expect, beforeEach, vi } from 'vitest';
import RetryMiddleware from '../../src/reliability/retry-middleware.js';

describe('RetryMiddleware', () => {
  let retryMiddleware;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    retryMiddleware = new RetryMiddleware({ logger: mockLogger });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff correctly', () => {
      const policy = {
        baseDelay: 1000,
        maxDelay: 16000,
        backoff: 2.0,
        jitter: 0
      };

      // Attempt 1: 1000 * (2^0) = 1000ms
      const delay1 = retryMiddleware.calculateBackoff(1, policy);
      expect(delay1).toBe(1000);

      // Attempt 2: 1000 * (2^1) = 2000ms
      const delay2 = retryMiddleware.calculateBackoff(2, policy);
      expect(delay2).toBe(2000);

      // Attempt 3: 1000 * (2^2) = 4000ms
      const delay3 = retryMiddleware.calculateBackoff(3, policy);
      expect(delay3).toBe(4000);

      // Attempt 4: 1000 * (2^3) = 8000ms
      const delay4 = retryMiddleware.calculateBackoff(4, policy);
      expect(delay4).toBe(8000);

      // Attempt 5: 1000 * (2^4) = 16000ms (at max)
      const delay5 = retryMiddleware.calculateBackoff(5, policy);
      expect(delay5).toBe(16000);

      // Attempt 6: should cap at maxDelay
      const delay6 = retryMiddleware.calculateBackoff(6, policy);
      expect(delay6).toBe(16000);
    });

    it('should add jitter to prevent thundering herd', () => {
      const policy = {
        baseDelay: 1000,
        maxDelay: 16000,
        backoff: 2.0,
        jitter: 0.1 // 10% jitter
      };

      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(retryMiddleware.calculateBackoff(2, policy));
      }

      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // All delays should be within expected range
      // Base: 2000ms, jitter range: 1800-2200ms (±10%)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(1800);
        expect(delay).toBeLessThanOrEqual(2200);
      });
    });

    it('should never return negative delay', () => {
      const policy = {
        baseDelay: 10,
        maxDelay: 1000,
        backoff: 2.0,
        jitter: 0.5 // 50% jitter
      };

      for (let i = 1; i <= 10; i++) {
        const delay = retryMiddleware.calculateBackoff(i, policy);
        expect(delay).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('executeWithRetry - success scenarios', () => {
    it('should execute function successfully on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const policy = 'ssh';

      const result = await retryMiddleware.executeWithRetry(operation, policy);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Operation succeeded on attempt 1'
        })
      );
    });

    it('should retry and succeed on second attempt', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce('success');
      const policy = 'ssh';

      const result = await retryMiddleware.executeWithRetry(operation, policy);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Retrying operation after failure',
          attempt: 1
        })
      );
    });

    it('should retry up to maxAttempts and succeed on final attempt', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockRejectedValueOnce(new Error('Fail 3'))
        .mockRejectedValueOnce(new Error('Fail 4'))
        .mockResolvedValueOnce('success');

      // Use custom policy with faster delays for testing
      const fastPolicy = {
        maxAttempts: 5,
        baseDelay: 10,
        maxDelay: 100,
        backoff: 2.0,
        jitter: 0
      };

      const result = await retryMiddleware.executeWithRetry(operation, fastPolicy);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(5);
    });
  });

  describe('executeWithRetry - failure scenarios', () => {
    it('should throw error after exhausting all retries', async () => {
      const error = new Error('Persistent failure');
      const operation = vi.fn().mockRejectedValue(error);

      // Use custom policy with faster delays for testing
      const fastPolicy = {
        maxAttempts: 5,
        baseDelay: 10,
        maxDelay: 100,
        backoff: 2.0,
        jitter: 0
      };

      await expect(retryMiddleware.executeWithRetry(operation, fastPolicy))
        .rejects.toThrow('Persistent failure');

      expect(operation).toHaveBeenCalledTimes(5);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Operation failed after all retry attempts'
        })
      );
    });

    it('should not retry on non-retryable errors', async () => {
      const error = new Error('Authentication failed');
      error.code = 'AUTH_FAILED';
      const operation = vi.fn().mockRejectedValue(error);
      const policy = 'ssh';

      await expect(retryMiddleware.executeWithRetry(operation, policy))
        .rejects.toThrow('Authentication failed');

      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'Non-retryable error encountered'
        })
      );
    });
  });

  describe('retry policies', () => {
    it('should use ssh retry policy correctly', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');

      const result = await retryMiddleware.executeWithRetry(operation, 'ssh');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use telegram retry policy correctly', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');

      const result = await retryMiddleware.executeWithRetry(operation, 'telegram');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use database retry policy correctly', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Database locked'))
        .mockResolvedValueOnce('success');

      const result = await retryMiddleware.executeWithRetry(operation, 'database');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw error for unknown policy', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await expect(retryMiddleware.executeWithRetry(operation, 'unknown'))
        .rejects.toThrow('Unknown retry policy');
    });
  });

  describe('error classification', () => {
    it('should identify transient network errors as retryable', () => {
      const errors = [
        new Error('ECONNREFUSED'),
        new Error('ETIMEDOUT'),
        new Error('Network timeout'),
        new Error('ECONNRESET')
      ];

      errors.forEach(error => {
        expect(retryMiddleware.isRetryableError(error)).toBe(true);
      });
    });

    it('should identify authentication errors as non-retryable', () => {
      const authError = new Error('Authentication failed');
      authError.code = 'AUTH_FAILED';

      expect(retryMiddleware.isRetryableError(authError)).toBe(false);
    });

    it('should identify resource not found as non-retryable', () => {
      const notFoundError = new Error('Resource not found');
      notFoundError.code = 'ENOENT';

      expect(retryMiddleware.isRetryableError(notFoundError)).toBe(false);
    });

    it('should identify database lock errors as retryable', () => {
      const lockError = new Error('Database is locked');
      lockError.code = 'SQLITE_BUSY';

      expect(retryMiddleware.isRetryableError(lockError)).toBe(true);
    });
  });

  describe('wrapWithRetry', () => {
    it('should wrap a function with retry logic', async () => {
      const originalFn = vi.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');

      const wrappedFn = retryMiddleware.wrapWithRetry(originalFn, 'ssh');
      const result = await wrappedFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should preserve function context when wrapping', async () => {
      const context = { value: 42 };
      const originalFn = vi.fn(function() {
        return this.value;
      }).mockResolvedValue(42);

      const wrappedFn = retryMiddleware.wrapWithRetry(originalFn, 'ssh');
      const result = await wrappedFn.call(context);

      expect(result).toBe(42);
    });
  });

  describe('retry metrics', () => {
    it('should track retry attempts', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');

      await retryMiddleware.executeWithRetry(operation, 'ssh');

      const metrics = retryMiddleware.getMetrics();
      expect(metrics.totalRetries).toBeGreaterThan(0);
      expect(metrics.successfulRetries).toBeGreaterThan(0);
    });

    it('should reset metrics', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      await retryMiddleware.executeWithRetry(operation, 'ssh');

      retryMiddleware.resetMetrics();
      const metrics = retryMiddleware.getMetrics();

      expect(metrics.totalRetries).toBe(0);
      expect(metrics.successfulRetries).toBe(0);
      expect(metrics.failedRetries).toBe(0);
    });
  });
});
