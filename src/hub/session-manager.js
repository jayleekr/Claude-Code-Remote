const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

/**
 * Session Manager with Server-Aware Numbering
 *
 * Manages sessions with server-specific numbering system.
 * Each server has its own sequence: kr4:1, kr4:2, local:1, local:2, etc.
 */
class SessionManager {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, '../../data/sessions.db');

        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        this.db = new Database(this.dbPath);
        this._initDatabase();

        console.log(`✅ SessionManager initialized with database: ${this.dbPath}`);
    }

    /**
     * Initialize database schema
     */
    _initDatabase() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                serverId TEXT NOT NULL,
                serverNumber INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                project TEXT NOT NULL,
                tmuxSession TEXT NOT NULL,
                createdAt INTEGER NOT NULL,
                expiresAt INTEGER NOT NULL,
                metadata TEXT,
                UNIQUE(serverId, serverNumber)
            );

            CREATE INDEX IF NOT EXISTS idx_serverId ON sessions(serverId);
            CREATE INDEX IF NOT EXISTS idx_token ON sessions(token);
            CREATE INDEX IF NOT EXISTS idx_expiresAt ON sessions(expiresAt);
            CREATE INDEX IF NOT EXISTS idx_serverNumber ON sessions(serverId, serverNumber);
        `);

        console.log('✅ Database schema initialized');
    }

    /**
     * Create a new session with server-aware numbering
     *
     * @param {Object} options
     * @param {string} options.serverId - Server identifier (e.g., 'kr4', 'local')
     * @param {string} options.project - Project name
     * @param {Object} options.metadata - Additional metadata
     * @returns {Object} Created session object
     */
    async createSession({ serverId, project, metadata = {} }) {
        const now = Math.floor(Date.now() / 1000);
        const tmuxSession = metadata.tmuxSession || 'claude-session';

        // Check if session already exists for this tmux session
        const existingStmt = this.db.prepare(`
            SELECT * FROM sessions
            WHERE serverId = ? AND tmuxSession = ? AND expiresAt > ?
        `);
        const existing = existingStmt.get(serverId, tmuxSession, now);

        if (existing) {
            // Update existing session instead of creating new one
            const updateStmt = this.db.prepare(`
                UPDATE sessions
                SET project = ?,
                    expiresAt = ?,
                    metadata = ?
                WHERE id = ?
            `);

            const newExpiry = now + (24 * 60 * 60); // 24 hours from now
            updateStmt.run(
                project,
                newExpiry,
                JSON.stringify(metadata),
                existing.id
            );

            console.log(`🔄 Session updated: ${serverId}:${existing.serverNumber} (${existing.token})`);

            // Return updated session with parsed metadata
            return {
                id: existing.id,
                serverId: existing.serverId,
                serverNumber: existing.serverNumber,
                token: existing.token,
                project,
                tmuxSession: existing.tmuxSession,
                createdAt: existing.createdAt,
                expiresAt: newExpiry,
                metadata
            };
        }

        // Create new session if none exists
        const serverNumber = this._getNextServerNumber(serverId);
        const token = this._generateToken();

        const session = {
            id: uuidv4(),
            serverId,
            serverNumber,
            token,
            project,
            tmuxSession,
            createdAt: now,
            expiresAt: now + (24 * 60 * 60), // 24 hours
            metadata: JSON.stringify(metadata)
        };

        const stmt = this.db.prepare(`
            INSERT INTO sessions
            (id, serverId, serverNumber, token, project, tmuxSession, createdAt, expiresAt, metadata)
            VALUES
            (@id, @serverId, @serverNumber, @token, @project, @tmuxSession, @createdAt, @expiresAt, @metadata)
        `);

        stmt.run(session);

        console.log(`✅ Session created: ${serverId}:${serverNumber} (${token})`);

        return {
            ...session,
            metadata: JSON.parse(session.metadata)
        };
    }

    /**
     * Find session by identifier (server:number or token)
     *
     * @param {string} identifier - Either "kr4:1" or token like "ABC12345"
     * @returns {Object|null} Session object or null
     */
    findSession(identifier) {
        // Clean expired sessions first
        this._cleanExpiredSessions();

        if (identifier.includes(':')) {
            // Server-specific format: "kr4:1"
            const [serverId, numberStr] = identifier.split(':');
            const serverNumber = parseInt(numberStr);

            if (isNaN(serverNumber)) {
                return null;
            }

            const stmt = this.db.prepare(`
                SELECT * FROM sessions
                WHERE serverId = ? AND serverNumber = ? AND expiresAt > ?
            `);

            const session = stmt.get(serverId, serverNumber, Math.floor(Date.now() / 1000));

            if (session) {
                session.metadata = JSON.parse(session.metadata || '{}');
            }

            return session;
        } else {
            // Token format: "ABC12345"
            const stmt = this.db.prepare(`
                SELECT * FROM sessions
                WHERE token = ? AND expiresAt > ?
            `);

            const session = stmt.get(identifier, Math.floor(Date.now() / 1000));

            if (session) {
                session.metadata = JSON.parse(session.metadata || '{}');
            }

            return session;
        }
    }

    /**
     * Get next available server number for a specific server
     *
     * @param {string} serverId - Server identifier
     * @returns {number} Next available number
     */
    _getNextServerNumber(serverId) {
        const stmt = this.db.prepare(`
            SELECT MAX(serverNumber) as max
            FROM sessions
            WHERE serverId = ?
        `);

        const result = stmt.get(serverId);
        return (result.max || 0) + 1;
    }

    /**
     * Generate random session token
     *
     * @returns {string} 8-character alphanumeric token
     */
    _generateToken() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let token = '';
        for (let i = 0; i < 8; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
    }

    /**
     * Clean up expired sessions
     */
    _cleanExpiredSessions() {
        const stmt = this.db.prepare(`
            DELETE FROM sessions
            WHERE expiresAt < ?
        `);

        const now = Math.floor(Date.now() / 1000);
        const result = stmt.run(now);

        if (result.changes > 0) {
            console.log(`🧹 Cleaned ${result.changes} expired sessions`);
        }
    }

    /**
     * Get all active sessions for a server
     *
     * @param {string} serverId - Server identifier
     * @returns {Array} Array of session objects
     */
    getServerSessions(serverId) {
        this._cleanExpiredSessions();

        const stmt = this.db.prepare(`
            SELECT * FROM sessions
            WHERE serverId = ? AND expiresAt > ?
            ORDER BY serverNumber DESC
        `);

        const sessions = stmt.all(serverId, Math.floor(Date.now() / 1000));

        return sessions.map(session => ({
            ...session,
            metadata: JSON.parse(session.metadata || '{}')
        }));
    }

    /**
     * Get all active sessions across all servers
     *
     * @returns {Array} Array of session objects
     */
    getAllSessions() {
        this._cleanExpiredSessions();

        const stmt = this.db.prepare(`
            SELECT * FROM sessions
            WHERE expiresAt > ?
            ORDER BY createdAt DESC
        `);

        const sessions = stmt.all(Math.floor(Date.now() / 1000));

        return sessions.map(session => ({
            ...session,
            metadata: JSON.parse(session.metadata || '{}')
        }));
    }

    /**
     * Close database connection
     */
    close() {
        this.db.close();
        console.log('✅ SessionManager database closed');
    }
}

module.exports = SessionManager;
