import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Server Registry
 *
 * Manages server configurations and tracks server status
 */
class ServerRegistry {
    constructor(configPath) {
        this.configPath = configPath || path.join(__dirname, '../../config/servers.json');
        this.servers = new Map();
        this.config = null;

        this._loadConfig();
        this._loadServers();

        console.log(`✅ ServerRegistry initialized with ${this.servers.size} servers`);
    }

    /**
     * Load configuration from file
     */
    _loadConfig() {
        try {
            const configContent = fs.readFileSync(this.configPath, 'utf8');
            this.config = JSON.parse(configContent);

            console.log(`✅ Server configuration loaded from ${this.configPath}`);
        } catch (error) {
            console.error(`❌ Failed to load server configuration: ${error.message}`);
            throw error;
        }
    }

    /**
     * Load servers into registry
     */
    _loadServers() {
        if (!this.config || !this.config.servers) {
            throw new Error('No servers configured in config file');
        }

        for (const server of this.config.servers) {
            this.servers.set(server.id, {
                ...server,
                status: 'unknown',
                lastSeen: null
            });

            console.log(`📦 Server registered: ${server.id} (${server.type})`);
        }
    }

    /**
     * Get server by ID
     *
     * @param {string} serverId - Server identifier
     * @returns {Object|undefined} Server object or undefined
     */
    getServer(serverId) {
        return this.servers.get(serverId);
    }

    /**
     * Get all servers
     *
     * @returns {Array} Array of server objects
     */
    getAllServers() {
        return Array.from(this.servers.values());
    }

    /**
     * Get servers by type
     *
     * @param {string} type - Server type ('local' or 'remote')
     * @returns {Array} Array of server objects
     */
    getServersByType(type) {
        return Array.from(this.servers.values())
            .filter(server => server.type === type);
    }

    /**
     * Update server status
     *
     * @param {string} serverId - Server identifier
     * @param {string} status - Status string ('active', 'inactive', 'error')
     */
    updateServerStatus(serverId, status) {
        const server = this.servers.get(serverId);

        if (server) {
            server.status = status;
            server.lastSeen = Date.now();

            console.log(`📊 Server ${serverId} status updated: ${status}`);
        } else {
            console.warn(`⚠️ Attempted to update unknown server: ${serverId}`);
        }
    }

    /**
     * Get central hub configuration
     *
     * @returns {Object} Central hub config
     */
    getCentralConfig() {
        return this.config.central;
    }

    /**
     * Get shared secret for authentication
     *
     * @returns {string} Shared secret
     */
    getSharedSecret() {
        return this.config.central.sharedSecret;
    }

    /**
     * Reload configuration from file
     */
    reload() {
        console.log('🔄 Reloading server configuration...');
        this.servers.clear();
        this._loadConfig();
        this._loadServers();
        console.log('✅ Server configuration reloaded');
    }

    /**
     * Check if server exists
     *
     * @param {string} serverId - Server identifier
     * @returns {boolean} True if server exists
     */
    hasServer(serverId) {
        return this.servers.has(serverId);
    }

    /**
     * Register a new server dynamically (for testing)
     *
     * @param {string} serverId - Server identifier
     * @param {string} sharedSecret - Shared secret for authentication
     * @param {Object} metadata - Additional server metadata
     */
    registerServer(serverId, sharedSecret, metadata = {}) {
        this.servers.set(serverId, {
            id: serverId,
            type: metadata.type || 'test',
            status: 'unknown',
            lastSeen: null,
            ...metadata
        });
        console.log(`📦 Server registered dynamically: ${serverId}`);
    }
}

export default ServerRegistry;
