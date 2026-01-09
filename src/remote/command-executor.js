const { NodeSSH } = require('node-ssh');
const { execSync } = require('child_process');

/**
 * Command Executor
 *
 * Executes commands on local or remote servers via tmux
 * - Local: Direct tmux send-keys
 * - Remote: SSH + tmux send-keys with connection pooling
 */
class CommandExecutor {
    constructor(serverRegistry) {
        this.serverRegistry = serverRegistry;
        this.sshConnections = new Map(); // Connection pool
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

            // Send to tmux session
            const tmuxCommand = `tmux send-keys -t ${tmuxSession} '${escapedCmd}' Enter`;

            execSync(tmuxCommand, { stdio: 'inherit' });

            console.log(`✅ Command sent to local tmux session: ${tmuxSession}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to execute local command:`, error.message);
            throw error;
        }
    }

    /**
     * Execute command remotely via SSH + tmux
     */
    async _executeRemote(server, command, tmuxSession) {
        const ssh = await this._getSSHConnection(server);

        try {
            // Escape single quotes for SSH
            const escapedCmd = command.replace(/'/g, "'\\''");

            // Build SSH command
            const sshCommand = `tmux send-keys -t ${tmuxSession} '${escapedCmd}' Enter`;

            console.log(`🔗 SSH command: ${sshCommand}`);

            const result = await ssh.execCommand(sshCommand);

            if (result.code !== 0) {
                throw new Error(`SSH command failed: ${result.stderr}`);
            }

            console.log(`✅ Command sent to remote tmux session: ${tmuxSession}`);
            return true;
        } catch (error) {
            // Remove failed connection from pool
            this.sshConnections.delete(server.id);
            console.error(`❌ Failed to execute remote command:`, error.message);
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

module.exports = CommandExecutor;
