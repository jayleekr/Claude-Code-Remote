/**
 * RetryMiddleware - Exponential backoff retry logic for network operations
 *
 * Implements configurable retry policies with exponential backoff and jitter
 * to prevent thundering herd problems and improve resilience.
 */

const DEFAULT_RETRY_POLICIES = {
  ssh: {
    maxAttempts: 5,
    baseDelay: 1000,      // 1 second
    maxDelay: 16000,      // 16 seconds
    backoff: 2.0,
    jitter: 0.1           // 10% jitter
  },
  telegram: {
    maxAttempts: 3,
    baseDelay: 500,       // 0.5 seconds
    maxDelay: 5000,       // 5 seconds
    backoff: 2.0,
    jitter: 0.1
  },
  database: {
    maxAttempts: 10,
    baseDelay: 10,        // 10 milliseconds
    maxDelay: 5000,       // 5 seconds
    backoff: 2.0,
    jitter: 0.1
  }
};

const RETRYABLE_ERROR_CODES = [
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'SQLITE_BUSY',
  'SQLITE_LOCKED'
];

const RETRYABLE_ERROR_MESSAGES = [
  'Network timeout',
  'Connection timeout',
  'Database is locked',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET'
];

const NON_RETRYABLE_ERROR_CODES = [
  'AUTH_FAILED',
  'ENOENT',
  'EACCES',
  'EPERM'
];

class RetryMiddleware {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.policies = { ...DEFAULT_RETRY_POLICIES, ...options.policies };
    this.metrics = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0
    };
  }

  /**
   * Calculate exponential backoff delay with jitter
   * Formula: baseDelay * (backoff ^ (attemptNumber - 1)) + jitter
   *
   * @param {number} attemptNumber - Current retry attempt (1-based)
   * @param {object} policy - Retry policy configuration
   * @returns {number} Delay in milliseconds
   */
  calculateBackoff(attemptNumber, policy) {
    const { baseDelay, maxDelay, backoff, jitter = 0.1 } = policy;

    // Calculate exponential delay: baseDelay * (backoff ^ (attemptNumber - 1))
    let delay = Math.min(
      baseDelay * Math.pow(backoff, attemptNumber - 1),
      maxDelay
    );

    // Add jitter to prevent thundering herd
    // Jitter range: -jitter% to +jitter% of delay
    const jitterAmount = delay * jitter * (Math.random() * 2 - 1);
    delay = Math.max(0, delay + jitterAmount);

    return Math.floor(delay);
  }

  /**
   * Determine if an error is retryable based on error code and message
   *
   * @param {Error} error - Error to classify
   * @returns {boolean} True if error is retryable
   */
  isRetryableError(error) {
    // Check for non-retryable error codes first
    if (error.code && NON_RETRYABLE_ERROR_CODES.includes(error.code)) {
      return false;
    }

    // Check for retryable error codes
    if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) {
      return true;
    }

    // Check for retryable error messages
    const errorMessage = error.message || '';
    const hasRetryableMessage = RETRYABLE_ERROR_MESSAGES.some(msg =>
      errorMessage.includes(msg)
    );

    if (hasRetryableMessage) {
      return true;
    }

    // Default to retryable for generic errors (defensive approach)
    // unless explicitly marked as non-retryable
    return true;
  }

  /**
   * Execute an operation with retry logic
   *
   * @param {Function} operation - Async function to execute
   * @param {string|object} policyOrName - Policy name or custom policy object
   * @returns {Promise<any>} Result of successful operation
   * @throws {Error} Original error if all retries exhausted
   */
  async executeWithRetry(operation, policyOrName) {
    // Get retry policy
    const policy = typeof policyOrName === 'string'
      ? this.policies[policyOrName]
      : policyOrName;

    if (!policy) {
      throw new Error(`Unknown retry policy: ${policyOrName}`);
    }

    let lastError;
    const { maxAttempts } = policy;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();

        // Log success
        this.logger.info({
          msg: `Operation succeeded on attempt ${attempt}`,
          attempt,
          totalAttempts: maxAttempts
        });

        // Update metrics for successful retry
        if (attempt > 1) {
          this.metrics.successfulRetries++;
        }

        return result;

      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          this.logger.error({
            msg: 'Non-retryable error encountered',
            error: error.message,
            code: error.code,
            attempt
          });
          throw error;
        }

        // Check if we have more attempts left
        if (attempt < maxAttempts) {
          const delay = this.calculateBackoff(attempt, policy);

          this.logger.warn({
            msg: 'Retrying operation after failure',
            attempt,
            maxAttempts,
            error: error.message,
            retryDelay: delay
          });

          this.metrics.totalRetries++;

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    this.metrics.failedRetries++;

    this.logger.error({
      msg: 'Operation failed after all retry attempts',
      attempts: maxAttempts,
      lastError: lastError.message
    });

    throw lastError;
  }

  /**
   * Wrap a function with retry logic
   * Returns a new function that will retry on failure
   *
   * @param {Function} fn - Function to wrap
   * @param {string|object} policy - Retry policy
   * @returns {Function} Wrapped function with retry logic
   */
  wrapWithRetry(fn, policy) {
    return async (...args) => {
      return this.executeWithRetry(async () => {
        return await fn(...args);
      }, policy);
    };
  }

  /**
   * Get current retry metrics
   *
   * @returns {object} Retry metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset retry metrics
   */
  resetMetrics() {
    this.metrics = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0
    };
  }
}

export default RetryMiddleware;
