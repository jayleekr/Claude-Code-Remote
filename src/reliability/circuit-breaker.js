/**
 * CircuitBreaker - Prevent cascading failures with automatic recovery
 *
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail fast
 * - HALF_OPEN: Testing recovery, allow probe requests
 */

const DEFAULT_CONFIG = {
  failureThreshold: 5,        // Open after 5 consecutive failures
  successThreshold: 2,        // Close after 2 consecutive successes
  timeout: 30000,             // Half-open probe interval (30s)
  monitoringWindow: 60000     // Track failures over 60s window
};

const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = config.logger || console;

    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.consecutiveFailures = 0;
    this.totalOperations = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.nextProbeTime = null;
    this.probeTimeout = null;
  }

  /**
   * Get current circuit breaker state
   *
   * @returns {string} Current state (CLOSED, OPEN, HALF_OPEN)
   */
  getState() {
    return this.state;
  }

  /**
   * Check if circuit breaker is open (rejecting requests)
   *
   * @returns {boolean} True if circuit is open
   */
  isOpen() {
    return this.state === STATES.OPEN;
  }

  /**
   * Check circuit state before operation
   * Throws error if circuit is OPEN
   *
   * @throws {Error} If circuit breaker is OPEN
   */
  checkState() {
    if (this.state === STATES.OPEN) {
      const error = new Error(
        `Circuit breaker is OPEN for ${this.name}. Server temporarily unavailable.`
      );
      error.code = 'CIRCUIT_OPEN';
      throw error;
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess() {
    this.totalOperations++;
    this.lastSuccessTime = Date.now();
    this.consecutiveFailures = 0;

    if (this.state === STATES.HALF_OPEN) {
      this.successCount++;

      this.logger.info({
        msg: `Circuit breaker probe success for ${this.name}`,
        successCount: this.successCount,
        successThreshold: this.config.successThreshold
      });

      if (this.successCount >= this.config.successThreshold) {
        this._transitionToClosed();
      }
    } else if (this.state === STATES.CLOSED) {
      // Decrement failure count on success in CLOSED state
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure() {
    this.totalOperations++;
    this.failureCount++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === STATES.HALF_OPEN) {
      // Probe failed, return to OPEN
      this.logger.warn({
        msg: `Circuit breaker probe failed for ${this.name}`,
        server: this.name
      });
      this._transitionToOpen();
    } else if (this.state === STATES.CLOSED) {
      // Check if we've hit the failure threshold
      if (this.failureCount >= this.config.failureThreshold) {
        this._transitionToOpen();
      }
    }
  }

  /**
   * Transition to OPEN state
   * @private
   */
  _transitionToOpen() {
    this.state = STATES.OPEN;
    this.successCount = 0;

    this.logger.error({
      msg: `Circuit breaker opened for ${this.name}`,
      server: this.name,
      failureCount: this.failureCount,
      consecutiveFailures: this.consecutiveFailures
    });

    // Schedule transition to HALF_OPEN
    this._scheduleProbe();
  }

  /**
   * Transition to HALF_OPEN state
   * @private
   */
  _transitionToHalfOpen() {
    this.state = STATES.HALF_OPEN;
    this.successCount = 0;

    this.logger.info({
      msg: `Circuit breaker half-open for ${this.name}`,
      server: this.name
    });
  }

  /**
   * Transition to CLOSED state
   * @private
   */
  _transitionToClosed() {
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.consecutiveFailures = 0;

    this.logger.info({
      msg: `Circuit breaker closed for ${this.name}`,
      server: this.name
    });
  }

  /**
   * Schedule probe attempt to transition from OPEN to HALF_OPEN
   * @private
   */
  _scheduleProbe() {
    // Clear any existing probe timeout
    if (this.probeTimeout) {
      clearTimeout(this.probeTimeout);
    }

    this.nextProbeTime = Date.now() + this.config.timeout;

    this.probeTimeout = setTimeout(() => {
      if (this.state === STATES.OPEN) {
        this._transitionToHalfOpen();
      }
    }, this.config.timeout);
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset() {
    if (this.probeTimeout) {
      clearTimeout(this.probeTimeout);
      this.probeTimeout = null;
    }

    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.nextProbeTime = null;

    this.logger.info({
      msg: `Circuit breaker reset for ${this.name}`,
      server: this.name
    });
  }

  /**
   * Get circuit breaker statistics
   *
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      consecutiveFailures: this.consecutiveFailures,
      totalOperations: this.totalOperations,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextProbeTime: this.nextProbeTime,
      successRate: this.totalOperations > 0
        ? (this.totalOperations - this.failureCount) / this.totalOperations
        : 0
    };
  }
}

export default CircuitBreaker;
