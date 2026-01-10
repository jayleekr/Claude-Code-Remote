import { NodeSSH } from 'node-ssh';
import { execSync } from 'child_process';
import RetryMiddleware from '../reliability/retry-middleware.js';
import CircuitBreaker from '../reliability/circuit-breaker.js';
import { CircuitOpenError } from '../reliability/errors.js';

/**
 * Command Executor with Reliability Layer Integration
 *
 * Executes commands on local or remote servers via tmux
 * - Local: Direct tmux send-keys
 * - Remote: SSH + tmux send-keys with connection pooling
 * - Reliability: Retry middleware + circuit breaker for fault tolerance
 */
class CommandExecutor {
    constructor(serverRegistry) {
        this.serverRegistry = serverRegistry;
        this.sshConnections = new Map(); // Connection pool

        // Initialize reliability components
        this.retryMiddleware = new RetryMiddleware({
            logger: console
        });

        this.circuitBreakers = new Map(); // Circuit breaker per server

        // Initialize circuit breakers for all registered servers
        this._initializeCircuitBreakers();
    }

    /**
     * Initialize circuit breakers for all servers
     */
    _initializeCircuitBreakers() {
        const servers = this.serverRegistry.getAllServers();
        for (const server of servers) {
            if (server.type === 'remote') {
                this.circuitBreakers.set(server.id, new CircuitBreaker({
                    failureThreshold: 5,
                    successThreshold: 2,
                    timeout: 30000,
                    name: server.id
                }));
            }
        }
    }

    /**
     * Execute command on specified server
     */
    async execute(serverId, command, tmuxSession) {
        const server = this.serverRegistry.getServer(serverId);

        if (!server) {
            throw new Error(`Server ${serverId} not found`);
        }

        console.log(`📤 Executing command on [${serverId.toUpperCase()}]`);
        console.log(`   Command: ${command}`);
        console.log(`   Tmux session: ${tmuxSession}`);

        if (server.type === 'local') {
            return this._executeLocal(command, tmuxSession);
        } else {
            return this._executeRemote(server, command, tmuxSession);
        }
    }

    /**
     * Execute command locally via tmux
     */
    _executeLocal(command, tmuxSession) {
        try {
            // Escape single quotes for shell
            const escapedCmd = command.replace(/'/g, "'\\''");

            // Send command text first
            const sendTextCmd = `tmux send-keys -t ${tmuxSession} '${escapedCmd}'`;
            console.log(`🔧 [DEBUG] Step 1 - Sending text: ${sendTextCmd}`);
            execSync(sendTextCmd, { stdio: 'inherit', shell: '/bin/bash' });

            // Send Enter key separately as a second command
            const sendEnterCmd = `tmux send-keys -t ${tmuxSession} Enter`;
            console.log(`🔧 [DEBUG] Step 2 - Sending Enter key: ${sendEnterCmd}`);
            execSync(sendEnterCmd, { stdio: 'inherit', shell: '/bin/bash' });

            console.log(`✅ Command sent to local tmux session: ${tmuxSession}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to execute local command:`, error.message);
            throw error;
        }
    }

    /**
     * Execute command remotely via SSH + tmux with retry and circuit breaker
     */
    async _executeRemote(server, command, tmuxSession) {
        // Ensure circuit breaker exists for this server
        if (!this.circuitBreakers.has(server.id)) {
            this.circuitBreakers.set(server.id, new CircuitBreaker({
                failureThreshold: 5,
                successThreshold: 2,
                timeout: 30000,
                name: server.id
            }));
        }

        const circuitBreaker = this.circuitBreakers.get(server.id);

        // Check circuit breaker state BEFORE attempting operation
        if (circuitBreaker.isOpen()) {
            const error = new CircuitOpenError(
                `Server ${server.id} temporarily unavailable due to repeated failures`,
                server.id,
                30
            );
            console.error(`⚡ Circuit breaker OPEN for ${server.id}`);
            throw error;
        }

        // Wrap SSH operation with retry middleware
        try {
            const result = await this.retryMiddleware.executeWithRetry(async () => {
                const ssh = await this._getSSHConnection(server);

                // Escape single quotes for SSH
                const escapedCmd = command.replace(/'/g, "'\\''");

                // Build SSH command
                const sshCommand = `tmux send-keys -t ${tmuxSession} '${escapedCmd}' Enter`;

                console.log(`🔗 SSH command: ${sshCommand}`);

                const execResult = await ssh.execCommand(sshCommand);

                if (execResult.code !== 0) {
                    throw new Error(`SSH command failed: ${execResult.stderr}`);
                }

                console.log(`✅ Command sent to remote tmux session: ${tmuxSession}`);
                return true;
            }, 'ssh');

            // Record success in circuit breaker
            circuitBreaker.recordSuccess();

            return result;
        } catch (error) {
            // Record failure in circuit breaker
            circuitBreaker.recordFailure();

            // Remove failed connection from pool
            this.sshConnections.delete(server.id);

            console.error(`❌ Failed to execute remote command after retries:`, error.message);

            // Preserve original error context
            if (error.code) {
                const enhancedError = new Error(error.message);
                enhancedError.code = error.code;
                enhancedError.hostname = error.hostname || server.hostname;
                enhancedError.originalError = error;
                throw enhancedError;
            }

            throw error;
        }
    }

    /**
     * Get or create SSH connection (connection pooling)
     */
    async _getSSHConnection(server) {
        // Check if connection exists and is alive
        if (this.sshConnections.has(server.id)) {
            const ssh = this.sshConnections.get(server.id);
            try {
                // Test connection with simple command
                await ssh.execCommand('echo ping');
                console.log(`♻️ Reusing existing SSH connection to ${server.id}`);
                return ssh;
            } catch {
                console.log(`⚠️ Existing SSH connection dead, reconnecting...`);
                this.sshConnections.delete(server.id);
            }
        }

        // Create new SSH connection
        console.log(`🔌 Creating new SSH connection to ${server.hostname}...`);
        const ssh = new NodeSSH();

        await ssh.connect({
            host: server.hostname,
            username: server.ssh.user,
            port: server.ssh.port || 22,
            privateKeyPath: server.ssh.keyPath.replace('~', process.env.HOME)
        });

        console.log(`✅ SSH connection established to ${server.id}`);
        this.sshConnections.set(server.id, ssh);
        return ssh;
    }

    /**
     * Close all SSH connections
     */
    async close() {
        console.log(`🔌 Closing ${this.sshConnections.size} SSH connections...`);

        for (const [serverId, ssh] of this.sshConnections) {
            try {
                await ssh.dispose();
                console.log(`✅ Closed SSH connection to ${serverId}`);
            } catch (err) {
                console.error(`⚠️ Error closing SSH connection to ${serverId}:`, err.message);
            }
        }

        this.sshConnections.clear();
    }
}

export default CommandExecutor;
