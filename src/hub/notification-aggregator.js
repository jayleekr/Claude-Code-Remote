import express from 'express';
import SessionManager from './session-manager.js';
import ServerRegistry from './server-registry.js';
import TelegramChannel from '../channels/telegram/telegram.js';
import DeadLetterQueue from '../reliability/dead-letter-queue.js';

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

        // Initialize Dead Letter Queue if enabled
        if (config.deadLetterQueue?.enabled) {
            this.dlq = new DeadLetterQueue({
                ...config.deadLetterQueue,
                logger: console
            });
            console.log(`✅ Dead Letter Queue enabled`);

            // Start retry processor
            this._startRetryProcessor();
        }

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

        // DLQ stats endpoint
        if (this.dlq) {
            this.app.get('/dlq/stats', async (req, res) => {
                try {
                    const stats = await this.getDLQStats();
                    res.json(stats);
                } catch (error) {
                    console.error('❌ Error getting DLQ stats:', error);
                    res.status(500).json({ error: 'Failed to get DLQ stats' });
                }
            });
        }

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

            // Store in DLQ if enabled
            if (this.dlq) {
                try {
                    await this.dlq.enqueue('telegram_notification', notification, error);
                    console.log('📦 Notification stored in DLQ for retry');
                } catch (dlqError) {
                    console.error('❌ Failed to store in DLQ:', dlqError);
                }
            }

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
            // Stop retry processor
            if (this.retryInterval) {
                clearInterval(this.retryInterval);
                this.retryInterval = null;
            }

            if (this.server) {
                this.server.close(async () => {
                    console.log('✅ NotificationAggregator stopped');
                    this.sessionManager.close();

                    // Close DLQ
                    if (this.dlq) {
                        await this.dlq.close();
                    }

                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Start automatic retry processor
     * @private
     */
    _startRetryProcessor() {
        if (!this.dlq) return;

        // Process retries every 30 seconds
        this.retryInterval = setInterval(async () => {
            try {
                await this._processRetries();
            } catch (error) {
                console.error('❌ Error processing DLQ retries:', error);
            }
        }, 30000);

        console.log('✅ DLQ retry processor started (30s interval)');
    }

    /**
     * Process pending retries from DLQ
     * @private
     */
    async _processRetries() {
        if (!this.dlq) return;

        const pendingMessages = await this.dlq.dequeuePending(10);

        if (pendingMessages.length === 0) {
            return;
        }

        console.log(`🔄 Processing ${pendingMessages.length} pending DLQ messages`);

        for (const message of pendingMessages) {
            try {
                const payload = JSON.parse(message.payload);

                // Retry sending to Telegram
                await this.telegramChannel.send(payload);

                // Mark as successful
                await this.dlq.recordSuccess(message.id);
                console.log(`✅ DLQ message ${message.id} successfully retried`);

            } catch (error) {
                // Record failed retry attempt
                await this.dlq.recordRetryAttempt(message.id, error);
                console.warn(`⚠️ DLQ message ${message.id} retry failed (attempt ${message.attempt_count + 1}):`, error.message);
            }
        }
    }

    /**
     * Get DLQ statistics
     * @returns {Promise<object>} Statistics object
     */
    async getDLQStats() {
        if (!this.dlq) {
            return {
                enabled: false,
                pendingMessages: 0,
                archivedMessages: 0,
                totalMessages: 0,
                byType: {}
            };
        }

        const stats = await this.dlq.getStats();

        // Get oldest message age
        const pendingMessages = await this.dlq.dequeuePending(1);
        let oldestMessageAge = null;

        if (pendingMessages.length > 0) {
            const oldestMessage = pendingMessages[0];
            oldestMessageAge = Date.now() - oldestMessage.first_failed_at;
        }

        return {
            enabled: true,
            ...stats,
            oldestMessageAge
        };
    }
}

export default NotificationAggregator;
