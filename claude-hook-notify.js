#!/usr/bin/env node

/**
 * Claude Hook Notification Script
 * Called by Claude Code hooks to send Telegram notifications
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const axios = require('axios');

// Load environment variables from the project directory
const projectDir = path.dirname(__filename);
const envPath = path.join(projectDir, '.env');

console.log('🔍 Hook script started from:', process.cwd());
console.log('📁 Script location:', __filename);
console.log('🔧 Looking for .env at:', envPath);

if (fs.existsSync(envPath)) {
    console.log('✅ .env file found, loading...');
    dotenv.config({ path: envPath });
} else {
    console.error('❌ .env file not found at:', envPath);
    console.log('📂 Available files in script directory:');
    try {
        const files = fs.readdirSync(projectDir);
        console.log(files.join(', '));
    } catch (error) {
        console.error('Cannot read directory:', error.message);
    }
    process.exit(1);
}

const TelegramChannel = require('./src/channels/telegram/telegram');
const DesktopChannel = require('./src/channels/local/desktop');
const EmailChannel = require('./src/channels/email/smtp');

/**
 * Find Claude project root by looking for .claude directory
 * @param {string} startDir - Starting directory
 * @returns {string|null} - Project root directory or null
 */
function findClaudeProjectRoot(startDir) {
    let currentPath = startDir;
    const root = path.parse(startDir).root;

    while (currentPath !== root) {
        const claudeDir = path.join(currentPath, '.claude');
        if (fs.existsSync(claudeDir)) {
            return currentPath;
        }
        currentPath = path.dirname(currentPath);
    }

    return null;
}

/**
 * Debug logging helper
 * @param {string} message - Log message
 */
function log(message) {
    if (process.env.CLAUDE_HOOK_DEBUG === 'true') {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [hook-notify] ${message}`);
    }
}

/**
 * Check if current completion is from a subagent
 * @returns {boolean} true if subagent, false if main task
 */
function isSubagentCompletion() {
    // Check for Claude Code subagent environment variables
    const subagentSignals = [
        process.env.CLAUDE_SUBAGENT === 'true',
        process.env.CLAUDE_TASK_LEVEL && parseInt(process.env.CLAUDE_TASK_LEVEL) > 0,
        process.env.CLAUDE_PARENT_TASK_ID !== undefined
    ];

    if (subagentSignals.some(s => s)) {
        log('Detected subagent via environment variables');
        return true;
    }

    return false;
}

/**
 * Debouncing configuration
 */
const DEBOUNCE_WINDOW = 30000; // 30 seconds

// Get tmux session for stable SESSION_ID across hook invocations
let SESSION_ID = 'default';
try {
    const { execSync } = require('child_process');
    const tmuxSession = execSync('tmux display-message -p "#{session_name}"', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (tmuxSession) {
        SESSION_ID = tmuxSession;
    }
} catch {
    // Not in tmux or tmux not available, use process.ppid as fallback
    SESSION_ID = process.ppid || 'default';
}

const STATE_FILE = `/tmp/claude_notification_${SESSION_ID}.json`;

/**
 * Check if notification should be debounced
 * @returns {boolean} true if should debounce, false otherwise
 */
function shouldDebounce() {
    try {
        if (!fs.existsSync(STATE_FILE)) {
            return false;
        }

        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        const timeSinceLastNotification = Date.now() - state.lastNotification;

        // Detect clock skew
        if (timeSinceLastNotification < 0 || timeSinceLastNotification > 86400000) {
            log('Clock skew detected, resetting state');
            fs.unlinkSync(STATE_FILE);
            return false;
        }

        if (timeSinceLastNotification < DEBOUNCE_WINDOW) {
            log(`Debouncing: ${timeSinceLastNotification}ms since last notification`);

            // Update pending notification
            state.pendingCount++;
            state.lastAttempt = Date.now();
            fs.writeFileSync(STATE_FILE, JSON.stringify(state));

            // Schedule delayed notification
            scheduleDelayedNotification();
            return true;
        }

        return false;
    } catch (error) {
        log(`Debounce check failed: ${error.message}`);
        if (error.name === 'SyntaxError') {
            // State file corrupted
            try {
                fs.unlinkSync(STATE_FILE);
                log('State file corrupted, reset');
            } catch {}
        }
        return false;
    }
}

/**
 * Record notification timestamp
 */
function recordNotification() {
    try {
        const state = {
            lastNotification: Date.now(),
            pendingCount: 0,
            lastAttempt: Date.now()
        };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    } catch (error) {
        log(`Failed to record notification: ${error.message}`);
    }
}

/**
 * Schedule a delayed notification
 */
function scheduleDelayedNotification() {
    const DELAYED_NOTIFICATION_SCRIPT = '/tmp/claude_delayed_notification.sh';

    try {
        // Create delayed notification script
        const script = `#!/bin/bash
sleep 31
node ${__filename} completed --delayed
`;

        fs.writeFileSync(DELAYED_NOTIFICATION_SCRIPT, script);
        fs.chmodSync(DELAYED_NOTIFICATION_SCRIPT, '755');

        // Execute in background
        require('child_process').spawn(DELAYED_NOTIFICATION_SCRIPT, [], {
            detached: true,
            stdio: 'ignore'
        }).unref();

        log('Scheduled delayed notification');
    } catch (error) {
        log(`Failed to schedule delayed notification: ${error.message}`);
    }
}

/**
 * Extract last conversation from Claude Code jsonl log
 * @param {string} currentDir - Current working directory
 * @returns {Object|null} - { userQuestion, claudeResponse } or null
 */
function extractLastConversation(currentDir) {
    try {
        // Find Claude project root (look for .claude directory)
        const projectRoot = findClaudeProjectRoot(currentDir) || currentDir;
        console.log('🔍 Project root:', projectRoot);

        // Build Claude project directory path
        // Claude converts underscores to hyphens in directory names
        const homeDir = require('os').homedir();
        const projectSlug = projectRoot.replace(/\//g, '-').replace(/_/g, '-');
        const claudeProjectDir = path.join(homeDir, '.claude', 'projects', projectSlug);

        if (!fs.existsSync(claudeProjectDir)) {
            console.log('⚠️ Claude project directory not found:', claudeProjectDir);
            return null;
        }

        // Find most recent .jsonl file
        const files = fs.readdirSync(claudeProjectDir)
            .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
            .map(f => ({
                name: f,
                path: path.join(claudeProjectDir, f),
                mtime: fs.statSync(path.join(claudeProjectDir, f)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime);

        if (files.length === 0) {
            console.log('⚠️ No conversation log files found');
            return null;
        }

        const latestFile = files[0].path;
        console.log('📖 Reading conversation from:', latestFile);

        // Read last few lines to get recent conversation
        const content = fs.readFileSync(latestFile, 'utf8');
        const lines = content.trim().split('\n').filter(l => l.trim());

        let userQuestion = null;
        let claudeResponse = null;

        // Read backwards to find last user message and assistant response
        for (let i = lines.length - 1; i >= 0 && i >= lines.length - 50; i--) {
            try {
                const entry = JSON.parse(lines[i]);

                // Find user message
                if (!userQuestion && entry.type === 'user' && entry.message?.content) {
                    const content = entry.message.content;
                    if (typeof content === 'string') {
                        userQuestion = content.substring(0, 500);
                    } else if (Array.isArray(content)) {
                        const textContent = content.find(c => c.type === 'text');
                        if (textContent) {
                            userQuestion = textContent.text.substring(0, 500);
                        }
                    }
                }

                // Find assistant response with actual text content
                if (!claudeResponse && entry.type === 'assistant' && entry.message?.content) {
                    const content = entry.message.content;
                    if (typeof content === 'string') {
                        claudeResponse = content.substring(0, 2000);
                    } else if (Array.isArray(content)) {
                        // Look for text content first, skip tool-only responses
                        let responseText = '';
                        for (const item of content) {
                            if (item.type === 'text' && item.text) {
                                responseText += item.text + '\n';
                            }
                        }

                        // Only use this response if it has actual text content
                        if (responseText.trim().length > 0) {
                            claudeResponse = responseText.substring(0, 2000);
                        }
                        // If no text, continue searching for a better response
                    }
                }

                // Stop if we found both
                if (userQuestion && claudeResponse) {
                    break;
                }
            } catch {
                // Skip malformed lines
                continue;
            }
        }

        if (userQuestion || claudeResponse) {
            console.log('✅ Extracted conversation context');
            console.log('   User:', userQuestion ? userQuestion.substring(0, 100) + '...' : 'N/A');
            console.log('   Assistant:', claudeResponse ? claudeResponse.substring(0, 100) + '...' : 'N/A');
            return { userQuestion, claudeResponse };
        }

        return null;
    } catch (error) {
        console.error('⚠️ Failed to extract conversation:', error.message);
        return null;
    }
}

/**
 * Send notification to central hub with retry logic
 * @param {string} serverId - Server identifier
 * @param {Object} notification - Notification object
 * @param {string} endpoint - Central hub endpoint URL
 * @param {string} secret - Shared secret for authentication
 * @returns {boolean} - Success or failure
 */
async function sendToCentralHub(serverId, notification, endpoint, secret) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            console.log(`📤 Attempt ${attempt + 1}/${maxRetries}: Sending to central hub...`);

            await axios.post(endpoint, {
                serverId,
                type: notification.type,
                project: notification.project,
                metadata: notification.metadata
            }, {
                headers: {
                    'X-Shared-Secret': secret,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            console.log('✅ Notification sent to central hub');
            return true;
        } catch (error) {
            attempt++;
            console.error(`❌ Attempt ${attempt} failed:`, error.message);

            if (attempt < maxRetries) {
                const delay = 1000 * attempt; // Exponential backoff
                console.log(`⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    console.error('❌ All retry attempts failed');
    return false;
}

async function sendHookNotification() {
    try {
        // Get notification type and check for delayed flag
        const notificationType = process.argv[2] || 'completed';
        const isDelayed = process.argv.includes('--delayed');

        log(`Hook triggered: ${notificationType}, delayed: ${isDelayed}`);

        // Check if this is a subagent completion
        const isSubagent = isSubagentCompletion();

        // Skip subagent notifications unless explicitly enabled
        if (isSubagent && !process.env.ENABLE_SUBAGENT_NOTIFICATIONS) {
            log('Skipping: subagent completion');
            return;
        }

        // Apply debouncing for rapid completions
        if (!isDelayed && shouldDebounce()) {
            log('Debounced: scheduling delayed notification');
            return;
        }

        // Record this notification
        if (!isDelayed) {
            recordNotification();
        }

        console.log('🔔 Claude Hook: Sending notifications...');
        
        const channels = [];
        const results = [];
        
        // Configure Desktop channel (always enabled for sound)
        const desktopChannel = new DesktopChannel({
            completedSound: 'Glass',
            waitingSound: 'Tink'
        });
        channels.push({ name: 'Desktop', channel: desktopChannel });
        
        // Configure Telegram channel if enabled
        if (process.env.TELEGRAM_ENABLED === 'true' && process.env.TELEGRAM_BOT_TOKEN) {
            const telegramConfig = {
                botToken: process.env.TELEGRAM_BOT_TOKEN,
                chatId: process.env.TELEGRAM_CHAT_ID,
                groupId: process.env.TELEGRAM_GROUP_ID
            };
            
            if (telegramConfig.botToken && (telegramConfig.chatId || telegramConfig.groupId)) {
                const telegramChannel = new TelegramChannel(telegramConfig);
                channels.push({ name: 'Telegram', channel: telegramChannel });
            }
        }
        
        // Configure Email channel if enabled
        if (process.env.EMAIL_ENABLED === 'true' && process.env.SMTP_USER) {
            const emailConfig = {
                smtp: {
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT),
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                },
                from: process.env.EMAIL_FROM,
                fromName: process.env.EMAIL_FROM_NAME,
                to: process.env.EMAIL_TO
            };
            
            if (emailConfig.smtp.host && emailConfig.smtp.auth.user && emailConfig.to) {
                const emailChannel = new EmailChannel(emailConfig);
                channels.push({ name: 'Email', channel: emailChannel });
            }
        }
        
        // Get current working directory and project root
        const currentDir = process.cwd();
        const projectRoot = findClaudeProjectRoot(currentDir) || currentDir;
        const projectName = path.basename(projectRoot);
        
        // Try to get current tmux session
        let tmuxSession = process.env.TMUX_SESSION || 'claude-real';
        try {
            const { execSync } = require('child_process');
            const sessionOutput = execSync('tmux display-message -p "#S"', { 
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
            if (sessionOutput) {
                tmuxSession = sessionOutput;
            }
        } catch {
            // Not in tmux or tmux not available, use default
        }

        // Extract conversation context from Claude logs
        const conversation = extractLastConversation(currentDir);

        // Create notification with metadata
        const notification = {
            type: notificationType,
            title: `Claude ${notificationType === 'completed' ? 'Task Completed' : 'Waiting for Input'}`,
            message: `Claude has ${notificationType === 'completed' ? 'completed a task' : 'is waiting for input'}`,
            project: projectName,
            metadata: conversation ? {
                userQuestion: conversation.userQuestion,
                claudeResponse: conversation.claudeResponse,
                tmuxSession: tmuxSession
            } : {
                tmuxSession: tmuxSession
            }
        };
        
        console.log(`📱 Sending ${notificationType} notification for project: ${projectName}`);
        console.log(`🖥️ Tmux session: ${tmuxSession}`);

        // Check if central hub is configured
        const centralHubEndpoint = process.env.CENTRAL_HUB_ENDPOINT;
        const serverId = process.env.SERVER_ID || 'local';
        const sharedSecret = process.env.SHARED_SECRET;

        if (centralHubEndpoint && sharedSecret) {
            console.log(`🌐 Central hub mode enabled for server: ${serverId}`);
            console.log(`📍 Hub endpoint: ${centralHubEndpoint}`);

            // Send to central hub instead of direct channels
            const hubSuccess = await sendToCentralHub(serverId, notification, centralHubEndpoint, sharedSecret);

            if (hubSuccess) {
                console.log('\n✅ Notification successfully sent to central hub');
                console.log('📋 Central hub will forward to Telegram');
                return; // Exit early, hub will handle the rest
            } else {
                console.warn('\n⚠️ Failed to send to central hub, falling back to direct channels...');
                // Continue with fallback to direct channels
            }
        }

        // Send notifications to all configured channels (fallback or no hub configured)
        for (const { name, channel } of channels) {
            try {
                console.log(`📤 Sending to ${name}...`);
                const result = await channel.send(notification);
                results.push({ name, success: result });
                
                if (result) {
                    console.log(`✅ ${name} notification sent successfully!`);
                } else {
                    console.log(`❌ Failed to send ${name} notification`);
                }
            } catch (error) {
                console.error(`❌ ${name} notification error:`, error.message);
                results.push({ name, success: false, error: error.message });
            }
        }
        
        // Report overall results
        const successful = results.filter(r => r.success).length;
        const total = results.length;
        
        if (successful > 0) {
            console.log(`\n✅ Successfully sent notifications via ${successful}/${total} channels`);
            if (results.some(r => r.name === 'Telegram' && r.success)) {
                console.log('📋 You can now send new commands via Telegram');
            }
        } else {
            console.log('\n❌ All notification channels failed');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Hook notification error:', error.message);
        process.exit(1);
    }
}

// Show usage if no arguments
if (process.argv.length < 2) {
    console.log('Usage: node claude-hook-notify.js [completed|waiting]');
    process.exit(1);
}

sendHookNotification();