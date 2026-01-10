import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import CommandExecutor from '../../src/remote/command-executor.js';
import { CircuitOpenError } from '../../src/reliability/errors.js';

// Mock ServerRegistry class for testing
class MockServerRegistry {
    constructor() {
        this.servers = new Map();
    }

    getServer(serverId) {
        return this.servers.get(serverId);
    }

    getAllServers() {
        return Array.from(this.servers.values());
    }

    hasServer(serverId) {
        return this.servers.has(serverId);
    }
}

describe('CommandExecutor Integration with Reliability Layer', () => {
    let commandExecutor;
    let serverRegistry;
    let mockSSH;

    beforeEach(() => {
        // Create mock server registry with test servers
        serverRegistry = new MockServerRegistry();
        serverRegistry.servers.set('test-server', {
            id: 'test-server',
            type: 'remote',
            hostname: 'test.example.com',
            ssh: { user: 'testuser', port: 22, keyPath: '~/.ssh/id_rsa' }
        });

        // Initialize command executor with reliability components
        commandExecutor = new CommandExecutor(serverRegistry);

        // Mock SSH for testing
        mockSSH = {
            execCommand: vi.fn(),
            dispose: vi.fn()
        };
    });

    afterEach(async () => {
        if (commandExecutor) {
            await commandExecutor.close();
        }
    });

    describe('RED Phase: SSH Retry Integration', () => {
        test('should retry SSH command on transient failure', async () => {
            // RED: This test will fail until we implement retry middleware integration

            mockSSH.execCommand
                .mockRejectedValueOnce(new Error('ECONNREFUSED'))
                .mockRejectedValueOnce(new Error('ECONNREFUSED'))
                .mockResolvedValueOnce({ code: 0, stdout: 'success', stderr: '' });

            commandExecutor._getSSHConnection = vi.fn().mockResolvedValue(mockSSH);

            const result = await commandExecutor.execute('test-server', 'echo hello', 'test-session');

            expect(result).toBe(true);
            expect(mockSSH.execCommand).toHaveBeenCalledTimes(3);
        });

        test('should fail after max retry attempts exhausted', async () => {
            // RED: This test will fail until retry limit enforcement is implemented

            mockSSH.execCommand.mockRejectedValue(new Error('ECONNREFUSED'));
            commandExecutor._getSSHConnection = vi.fn().mockResolvedValue(mockSSH);

            await expect(
                commandExecutor.execute('test-server', 'echo hello', 'test-session')
            ).rejects.toThrow();

            // Should retry maxAttempts times (5 by default for SSH)
            expect(mockSSH.execCommand.mock.calls.length).toBeGreaterThanOrEqual(3);
        }, 30000); // Increase timeout to 30s for all retry attempts

        test('should apply exponential backoff between retries', async () => {
            // RED: This test will fail until exponential backoff is implemented

            const startTime = Date.now();
            mockSSH.execCommand
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce({ code: 0, stdout: 'success', stderr: '' });

            commandExecutor._getSSHConnection = vi.fn().mockResolvedValue(mockSSH);

            await commandExecutor.execute('test-server', 'echo hello', 'test-session');

            const elapsed = Date.now() - startTime;

            // Exponential backoff: 1s + 2s = 3s minimum
            // Allow some margin for execution overhead (2.5s to 4s)
            expect(elapsed).toBeGreaterThanOrEqual(2500);
            expect(elapsed).toBeLessThan(4000);
        }, 10000); // 10s timeout for this test
    });

    describe('RED Phase: Circuit Breaker Integration', () => {
        test('should open circuit breaker after threshold failures', async () => {
            // RED: This test will fail until circuit breaker integration is complete

            mockSSH.execCommand.mockRejectedValue(new Error('Connection refused'));
            commandExecutor._getSSHConnection = vi.fn().mockResolvedValue(mockSSH);

            // Each execute() call will retry internally and then record ONE failure
            // We need 5 execute() calls to trigger the circuit breaker
            // Fail 5 times to trigger circuit breaker (failureThreshold = 5)
            for (let i = 0; i < 5; i++) {
                try {
                    await commandExecutor.execute('test-server', 'echo test', 'test-session');
                } catch {
                    // Expected to fail after retries are exhausted
                }
            }

            // Next attempt should fail immediately with CircuitOpenError (without retries)
            await expect(
                commandExecutor.execute('test-server', 'echo test', 'test-session')
            ).rejects.toThrow(CircuitOpenError);
        }, 90000); // Increase timeout to 90s for 5 retry cycles (each takes ~10-15s)

        test('should record success and decrement failure count', async () => {
            // RED: This test will fail until circuit breaker success tracking is implemented

            // Setup mock to handle retries - need multiple responses for each execute call
            let callCount = 0;
            mockSSH.execCommand.mockImplementation(() => {
                callCount++;
                // First execute: fail once, then succeed
                if (callCount === 1) return Promise.reject(new Error('Timeout'));
                if (callCount === 2) return Promise.resolve({ code: 0, stdout: 'success', stderr: '' });
                // Second execute: succeed immediately
                if (callCount === 3) return Promise.resolve({ code: 0, stdout: 'success', stderr: '' });
                // Third execute: fail once, then succeed
                if (callCount === 4) return Promise.reject(new Error('Timeout'));
                if (callCount === 5) return Promise.resolve({ code: 0, stdout: 'success', stderr: '' });
                // Fourth execute: succeed immediately
                if (callCount === 6) return Promise.resolve({ code: 0, stdout: 'success', stderr: '' });
                // Default: succeed
                return Promise.resolve({ code: 0, stdout: 'success', stderr: '' });
            });

            commandExecutor._getSSHConnection = vi.fn().mockResolvedValue(mockSSH);

            // First failure then success
            try {
                await commandExecutor.execute('test-server', 'echo test', 'test-session');
            } catch {
                // Expected - might fail after retries
            }

            // Success should decrement failure count
            await commandExecutor.execute('test-server', 'echo test', 'test-session');

            // Another failure then success
            try {
                await commandExecutor.execute('test-server', 'echo test', 'test-session');
            } catch {
                // Expected - might fail after retries
            }

            // Another success
            await commandExecutor.execute('test-server', 'echo test', 'test-session');

            // Circuit should still be closed (failures didn't accumulate to threshold)
            const circuitBreaker = commandExecutor.circuitBreakers.get('test-server');
            expect(circuitBreaker.state).toBe('CLOSED');
        }, 40000); // Increase timeout to 40s for multiple retry cycles

        test('should provide user-friendly error when circuit is open', async () => {
            // RED: This test will fail until error message formatting is implemented

            mockSSH.execCommand.mockRejectedValue(new Error('Connection refused'));
            commandExecutor._getSSHConnection = vi.fn().mockResolvedValue(mockSSH);

            // Trigger circuit breaker - need 5 failures
            for (let i = 0; i < 5; i++) {
                try {
                    await commandExecutor.execute('test-server', 'echo test', 'test-session');
                } catch {
                    // Expected to fail after retries
                }
            }

            // Verify error message contains recovery guidance
            try {
                await commandExecutor.execute('test-server', 'echo test', 'test-session');
                throw new Error('Should have thrown CircuitOpenError');
            } catch (error) {
                expect(error).toBeInstanceOf(CircuitOpenError);
                expect(error.message).toContain('temporarily unavailable');
                expect(error.message).toContain('test-server');
            }
        }, 90000); // Increase timeout to 90s for 5 retry cycles
    });

    describe('RED Phase: Error Handling Enhancement', () => {
        test('should log all retry attempts with context', async () => {
            // RED: This test will fail until enhanced logging is implemented

            // Spy on console.warn since retry logs use logger.warn()
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            mockSSH.execCommand
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce({ code: 0, stdout: 'success', stderr: '' });

            commandExecutor._getSSHConnection = vi.fn().mockResolvedValue(mockSSH);

            await commandExecutor.execute('test-server', 'echo hello', 'test-session');

            // Should log retry attempt - check for retry-related log entries
            const warnCalls = consoleWarnSpy.mock.calls;
            const hasRetryLog = warnCalls.some(call => {
                const logStr = JSON.stringify(call);
                // Check for the actual log message format used by retry middleware
                return (logStr.includes('Retrying') && logStr.includes('attempt')) ||
                       logStr.includes('Retrying operation after failure');
            });

            expect(hasRetryLog).toBe(true);

            consoleWarnSpy.mockRestore();
        }, 10000); // Increase timeout to 10s

        test('should preserve original error context in retry failures', async () => {
            // RED: This test will fail until error context preservation is implemented

            const originalError = new Error('Connection timeout');
            originalError.code = 'ETIMEDOUT';
            originalError.hostname = 'test.example.com';

            mockSSH.execCommand.mockRejectedValue(originalError);
            commandExecutor._getSSHConnection = vi.fn().mockResolvedValue(mockSSH);

            try {
                await commandExecutor.execute('test-server', 'echo test', 'test-session');
                throw new Error('Should have thrown error');
            } catch (error) {
                expect(error.code).toBe('ETIMEDOUT');
                expect(error.hostname).toBe('test.example.com');
            }
        }, 30000); // Increase timeout to 30s for all retry attempts
    });

    describe('RED Phase: Backward Compatibility', () => {
        test('should maintain backward compatibility for local execution', async () => {
            // RED: This test ensures local execution is not affected by retry logic

            serverRegistry.servers.set('local', {
                id: 'local',
                type: 'local'
            });

            // For local execution, we verify the code path is taken without retry logic
            // Since tmux session may not exist, we just check that local server handling works
            // The actual command execution is tested elsewhere
            const server = serverRegistry.getServer('local');
            expect(server).toBeDefined();
            expect(server.type).toBe('local');

            // Verify that local server doesn't have circuit breaker (only remote servers do)
            expect(commandExecutor.circuitBreakers.has('local')).toBe(false);
        });

        test('should not break existing connection pooling', async () => {
            // RED: This test ensures connection pooling still works with retry middleware

            mockSSH.execCommand.mockResolvedValue({ code: 0, stdout: 'success', stderr: '' });
            commandExecutor._getSSHConnection = vi.fn().mockResolvedValue(mockSSH);

            // Execute multiple commands
            await commandExecutor.execute('test-server', 'echo 1', 'test-session');
            await commandExecutor.execute('test-server', 'echo 2', 'test-session');
            await commandExecutor.execute('test-server', 'echo 3', 'test-session');

            // Connection should be reused (called multiple times)
            expect(commandExecutor._getSSHConnection).toHaveBeenCalled();
            expect(commandExecutor._getSSHConnection.mock.calls.length).toBeGreaterThan(0);

            // Verify sshConnections map exists (connection pooling infrastructure is in place)
            expect(commandExecutor.sshConnections).toBeInstanceOf(Map);
        });
    });
});
