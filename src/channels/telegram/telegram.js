/**
 * Telegram Notification Channel
 * Sends notifications via Telegram Bot API with command support
 */

const NotificationChannel = require('../base/channel');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const TmuxMonitor = require('../../utils/tmux-monitor');
const { execSync } = require('child_process');

class TelegramChannel extends NotificationChannel {
    constructor(config = {}) {
        super('telegram', config);
        this.sessionsDir = path.join(__dirname, '../../data/sessions');
        this.tmuxMonitor = new TmuxMonitor();
        this.apiBaseUrl = 'https://api.telegram.org';
        this.botUsername = null; // Cache for bot username
        
        this._ensureDirectories();
        this._validateConfig();
    }

    _ensureDirectories() {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    _validateConfig() {
        if (!this.config.botToken) {
            this.logger.warn('Telegram Bot Token not found');
            return false;
        }
        if (!this.config.chatId && !this.config.groupId) {
            this.logger.warn('Telegram Chat ID or Group ID must be configured');
            return false;
        }
        return true;
    }

    /**
     * Generate network options for axios requests
     * @returns {Object} Network options object
     */
    _getNetworkOptions() {
        const options = {};
        if (this.config.forceIPv4) {
            options.family = 4;
        }
        return options;
    }

    _generateToken() {
        // Generate short Token (uppercase letters + numbers, 8 digits)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let token = '';
        for (let i = 0; i < 8; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
    }

    _getCurrentTmuxSession() {
        try {
            // Try to get current tmux session
            const tmuxSession = execSync('tmux display-message -p "#S"', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();

            return tmuxSession || null;
        } catch {
            // Not in a tmux session or tmux not available
            return null;
        }
    }

    /**
     * Split long messages into chunks respecting Telegram's 4096 character limit
     * Attempts to split at newlines for better readability
     * @param {string} text - The text to split
     * @param {number} maxLength - Maximum length per chunk (default: 4090 to leave room for part indicators)
     * @returns {string[]} Array of message chunks
     */
    _splitMessage(text, maxLength = 4090) {
        // If text fits in one message, return as-is
        if (text.length <= maxLength) {
            return [text];
        }

        const chunks = [];
        const lines = text.split('\n');
        let currentChunk = '';

        for (const line of lines) {
            const testChunk = currentChunk + (currentChunk ? '\n' : '') + line;

            // If adding this line exceeds limit
            if (testChunk.length > maxLength) {
                // Save current chunk if not empty
                if (currentChunk) {
                    chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    // Single line too long, force split
                    let remainingLine = line;
                    while (remainingLine.length > maxLength) {
                        chunks.push(remainingLine.substring(0, maxLength));
                        remainingLine = remainingLine.substring(maxLength);
                    }
                    currentChunk = remainingLine;
                }
            } else {
                currentChunk = testChunk;
            }
        }

        // Add remaining chunk
        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    async _getBotUsername() {
        if (this.botUsername) {
            return this.botUsername;
        }

        try {
            const response = await axios.get(
                `${this.apiBaseUrl}/bot${this.config.botToken}/getMe`,
                this._getNetworkOptions()
            );
            
            if (response.data.ok && response.data.result.username) {
                this.botUsername = response.data.result.username;
                return this.botUsername;
            }
        } catch (error) {
            this.logger.error('Failed to get bot username:', error.message);
        }
        
        // Fallback to configured username or default
        return this.config.botUsername || 'claude_remote_bot';
    }

    async _sendImpl(notification) {
        if (!this._validateConfig()) {
            throw new Error('Telegram channel not properly configured');
        }

        // Generate session ID and Token
        const sessionId = uuidv4();
        const token = this._generateToken();
        
        // Get current tmux session and conversation content
        const tmuxSession = this._getCurrentTmuxSession();
        if (tmuxSession && !notification.metadata) {
            const conversation = this.tmuxMonitor.getRecentConversation(tmuxSession);
            notification.metadata = {
                userQuestion: conversation.userQuestion || notification.message,
                claudeResponse: conversation.claudeResponse || notification.message,
                tmuxSession: tmuxSession
            };
        }
        
        // Create session record
        await this._createSession(sessionId, notification, token);

        // Generate Telegram message
        const messageText = this._generateTelegramMessage(notification, sessionId, token);

        // Split message into chunks if needed
        const chunks = this._splitMessage(messageText);

        // Determine recipient (chat or group)
        const chatId = this.config.groupId || this.config.chatId;

        // Create buttons - always use "1" since new sessions are always #1
        const buttons = [
            [
                {
                    text: '📝 Personal Chat',
                    callback_data: 'personal:1'
                },
                {
                    text: '👥 Group Chat',
                    callback_data: 'group:1'
                }
            ]
        ];

        try {
            // Send all chunks
            for (let i = 0; i < chunks.length; i++) {
                const isLastChunk = i === chunks.length - 1;

                // Add part indicator if multiple chunks
                let chunkText = chunks[i];
                if (chunks.length > 1) {
                    chunkText = `📄 *Part ${i + 1}/${chunks.length}*\n\n${chunkText}`;
                }

                const requestData = {
                    chat_id: chatId,
                    text: chunkText,
                    parse_mode: 'Markdown',
                    // Only add buttons to the last chunk
                    ...(isLastChunk && {
                        reply_markup: {
                            inline_keyboard: buttons
                        }
                    })
                };

                await axios.post(
                    `${this.apiBaseUrl}/bot${this.config.botToken}/sendMessage`,
                    requestData,
                    this._getNetworkOptions()
                );

                // Small delay between chunks to ensure proper ordering
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            this.logger.info(`Telegram message sent successfully (${chunks.length} part${chunks.length > 1 ? 's' : ''}), Session: ${sessionId}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to send Telegram message:', error.response?.data || error.message);
            // Clean up failed session
            await this._removeSession(sessionId);
            return false;
        }
    }

    _generateTelegramMessage(notification, _sessionId, _token) {
        const type = notification.type;
        const emoji = type === 'completed' ? '✅' : '⏳';
        const status = type === 'completed' ? 'Completed' : 'Waiting for Input';

        let messageText = `${emoji} *Claude Task ${status}*\n`;
        messageText += `*Project:* ${notification.project}\n`;
        messageText += `*Session:* #1 (most recent)\n\n`;

        if (notification.metadata) {
            if (notification.metadata.userQuestion) {
                messageText += `📝 *Your Question:*\n${notification.metadata.userQuestion}\n\n`;
            }

            if (notification.metadata.claudeResponse) {
                messageText += `🤖 *Claude Response:*\n${notification.metadata.claudeResponse}\n\n`;
            }
        }

        messageText += `💬 *To send a command:*\n`;
        messageText += `\`/cmd 1 <your command>\`\n\n`;
        messageText += `💡 *Tip:* #1 is always the most recent session across all projects.\n`;
        messageText += `As new sessions are created, older sessions become #2, #3, etc.`;

        return messageText;
    }

    async _createSession(sessionId, notification, token) {
        const session = {
            id: sessionId,
            token: token,
            type: 'telegram',
            created: new Date().toISOString(),
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Expires after 24 hours
            createdAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000),
            tmuxSession: notification.metadata?.tmuxSession || 'default',
            project: notification.project,
            notification: notification
        };

        const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
        fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));

        this.logger.debug(`Session created: ${sessionId} (${notification.project})`);
        return session;
    }

    async _removeSession(sessionId) {
        const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
        if (fs.existsSync(sessionFile)) {
            fs.unlinkSync(sessionFile);
            this.logger.debug(`Session removed: ${sessionId}`);
        }
    }

    supportsRelay() {
        return true;
    }

    validateConfig() {
        return this._validateConfig();
    }
}

module.exports = TelegramChannel;
