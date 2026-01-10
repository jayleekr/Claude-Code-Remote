/**
 * Custom Error Classes for Reliability Layer
 */

/**
 * CircuitOpenError
 * Thrown when circuit breaker is in OPEN state
 */
export class CircuitOpenError extends Error {
    constructor(message, serverId = null, retryAfter = 30) {
        super(message);
        this.name = 'CircuitOpenError';
        this.code = 'CIRCUIT_OPEN';
        this.serverId = serverId;
        this.retryAfter = retryAfter;
        this.recoveryGuidance = `Server temporarily unavailable. Wait ${retryAfter}s and retry.`;
    }
}

/**
 * MaxRetriesExceededError
 * Thrown when retry attempts are exhausted
 */
export class MaxRetriesExceededError extends Error {
    constructor(message, originalError, attemptCount) {
        super(message);
        this.name = 'MaxRetriesExceededError';
        this.code = 'MAX_RETRIES_EXCEEDED';
        this.originalError = originalError;
        this.attemptCount = attemptCount;
        this.recoveryGuidance = 'Operation failed after multiple retry attempts. Check server status.';
    }
}

/**
 * TransientError
 * Wrapper for errors that should trigger retry
 */
export class TransientError extends Error {
    constructor(message, originalError) {
        super(message);
        this.name = 'TransientError';
        this.code = 'TRANSIENT_ERROR';
        this.originalError = originalError;
        this.isRetryable = true;
    }
}

/**
 * PersistentError
 * Wrapper for errors that should NOT trigger retry
 */
export class PersistentError extends Error {
    constructor(message, originalError) {
        super(message);
        this.name = 'PersistentError';
        this.code = 'PERSISTENT_ERROR';
        this.originalError = originalError;
        this.isRetryable = false;
    }
}
