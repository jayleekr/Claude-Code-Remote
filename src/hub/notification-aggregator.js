const express = require('express');
const SessionManager = require('./session-manager');
const ServerRegistry = require('./server-registry');
const TelegramChannel = require('../channels/telegram/telegram');

/**
 * Notification Aggregator
 *
 * Central HTTP server that receives notifications from all servers
 * and forwards them to Telegram with server prefixes
 */
class NotificationAggregator {
    constructor(config = {}) {
        this.port = config.port || 3001;
        this.sharedSecret = config.sharedSecret;

        // Initialize components
        this.serverRegistry = new ServerRegistry(config.serverRegistryPath);
        this.sessionManager = new SessionManager(config.sessionManagerPath);
        this.telegramChannel = new TelegramChannel(config.telegram || {});

        // Express app
        this.app = express();
        this.app.use(express.json());

        // Setup routes
        this._setupRoutes();

        console.log(`✅ NotificationAggregator initialized on port ${this.port}`);
    }

    /**
     * Setup Express routes
     */
    _setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                servers: this.serverRegistry.getAllServers().length,
                activeSessions: this.sessionManager.getAllSessions().length
            });
        });

        // Notification endpoint
        this.app.post('/notify', async (req, res) => {
            try {
                await this._handleNotification(req, res);
            } catch (error) {
                console.error('❌ Error handling notification:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Debug: List all sessions
        this.app.get('/sessions', (req, res) => {
            const sessions = this.sessionManager.getAllSessions();
            res.json({
                count: sessions.length,
                sessions: sessions
            });
        });
    }

    /**
     * Handle incoming notification from a server
     */
    async _handleNotification(req, res) {
        // 1. Authenticate
        const providedSecret = req.headers['x-shared-secret'];
        const expectedSecret = this.sharedSecret || this.serverRegistry.getSharedSecret();

        if (providedSecret !== expectedSecret) {
            console.warn('⚠️ Unauthorized notification attempt');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // 2. Extract notification data
        const { serverId, type, project, metadata } = req.body;

        if (!serverId || !type || !project) {
            console.warn('⚠️ Invalid notification format');
            return res.status(400).json({ error: 'Missing required fields' });
        }

        console.log(`📨 Notification received from [${serverId.toUpperCase()}]: ${type} - ${project}`);

        // 3. Verify server exists
        if (!this.serverRegistry.hasServer(serverId)) {
            console.warn(`⚠️ Unknown server: ${serverId}`);
            return res.status(400).json({ error: 'Unknown server' });
        }

        // 4. Update server status
        this.serverRegistry.updateServerStatus(serverId, 'active');

        // 5. Create or update session with server context
        const session = await this.sessionManager.createSession({
            serverId,
            project,
            metadata: metadata || {}
        });

        // SessionManager already logs whether session was created or updated

        // 6. Prepare notification object for Telegram
        const notification = {
            type,
            title: `[${serverId.toUpperCase()}] Claude Task ${type === 'completed' ? 'Completed' : 'Waiting'}`,
            message: this._formatMessage(serverId, session, metadata || {}),
            project,
            metadata: {
                ...metadata,
                session: {
                    id: session.id,
                    serverId,
                    serverNumber: session.serverNumber,
                    token: session.token,
                    identifier: `${serverId}:${session.serverNumber}`
                }
            }
        };

        // 7. Send to Telegram
        try {
            await this.telegramChannel.send(notification);
            console.log(`✅ Notification forwarded to Telegram`);

            res.status(200).json({
                success: true,
                session: {
                    id: session.id,
                    identifier: `${serverId}:${session.serverNumber}`,
                    token: session.token
                }
            });
        } catch (error) {
            console.error('❌ Failed to send Telegram notification:', error);
            res.status(500).json({ error: 'Failed to send notification' });
        }
    }

    /**
     * Format message with server prefix for Telegram
     */
    _formatMessage(serverId, session, metadata) {
        const serverName = serverId.toUpperCase();
        const identifier = `${serverId}:${session.serverNumber}`;

        // Extract relevant metadata
        const userQuestion = metadata.userQuestion || 'N/A';
        const claudeResponse = metadata.claudeResponse || 'N/A';

        const message = `✅ [${serverName}] Claude Task Completed
Project: ${session.project}
Session: ${identifier}

📝 Your Question:
${userQuestion}

🤖 Claude Response:
${claudeResponse}

💬 To send a command:
/cmd ${identifier} <your command>

💡 Tip: Use server:number format to target specific servers.
Example: /cmd ${identifier} analyze code`;

        return message;
    }

    /**
     * Start the server
     */
    start() {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                console.log(`🚀 NotificationAggregator listening on port ${this.port}`);
                console.log(`📍 Local endpoint: http://localhost:${this.port}/notify`);
                console.log(`📍 Remote endpoint: http://0.0.0.0:${this.port}/notify`);
                resolve();
            });
        });
    }

    /**
     * Stop the server
     */
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('✅ NotificationAggregator stopped');
                    this.sessionManager.close();
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = NotificationAggregator;
