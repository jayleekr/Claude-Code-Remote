#!/usr/bin/env node

/**
 * Webhook Server Startup Script
 *
 * Starts the Telegram webhook server with command routing support
 */

const path = require('path');
const dotenv = require('dotenv');
const ngrok = require('ngrok');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const TelegramWebhookHandler = require('./src/channels/telegram/webhook');
const SessionManager = require('./src/hub/session-manager');
const ServerRegistry = require('./src/hub/server-registry');
const CommandExecutor = require('./src/remote/command-executor');

async function start() {
    console.log('🚀 Starting Telegram Webhook Server...\n');

    try {
        // Validate required environment variables
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!botToken) {
            console.error('❌ TELEGRAM_BOT_TOKEN not found in .env');
            process.exit(1);
        }

        if (!chatId) {
            console.error('❌ TELEGRAM_CHAT_ID not found in .env');
            process.exit(1);
        }

        // Initialize components
        console.log('📦 Initializing components...\n');

        // Server Registry
        const serverRegistry = new ServerRegistry(
            path.join(__dirname, 'config/servers.json')
        );
        console.log(`✅ ServerRegistry: ${serverRegistry.getAllServers().length} servers loaded`);

        // Session Manager
        const sessionManager = new SessionManager(
            path.join(__dirname, 'data/sessions.db')
        );
        console.log('✅ SessionManager initialized');

        // Command Executor
        const commandExecutor = new CommandExecutor(serverRegistry);
        console.log('✅ CommandExecutor initialized\n');

        // Telegram Webhook Handler
        const webhookHandler = new TelegramWebhookHandler({
            botToken,
            chatId,
            sessionManager,
            commandExecutor,
            forceIPv4: true,
            whitelist: process.env.TELEGRAM_WHITELIST?.split(',') || []
        });

        // Start webhook server
        const webhookPort = parseInt(process.env.WEBHOOK_PORT || '3000');
        webhookHandler.start(webhookPort);

        console.log(`🌐 Webhook server started on port ${webhookPort}`);

        // Setup ngrok tunnel
        const ngrokEnabled = process.env.NGROK_ENABLED !== 'false';

        if (ngrokEnabled) {
            console.log('\n🌍 Setting up ngrok tunnel...');

            const url = await ngrok.connect({
                addr: webhookPort,
                authtoken: process.env.NGROK_AUTH_TOKEN
            });

            console.log(`✅ ngrok tunnel established: ${url}`);

            // Set Telegram webhook
            const webhookUrl = `${url}/webhook/telegram`;
            console.log(`\n📡 Setting Telegram webhook to: ${webhookUrl}`);

            await webhookHandler.setWebhook(webhookUrl);

            console.log('✅ Telegram webhook configured successfully');
        } else {
            console.log('\n⚠️  ngrok disabled - webhook must be set manually');
            console.log(`   Webhook URL: http://your-public-ip:${webhookPort}/webhook/telegram`);
        }

        console.log('\n✅ Webhook Server is running!');
        console.log(`📱 Bot: @${process.env.TELEGRAM_BOT_USERNAME || 'your_bot'}`);
        console.log(`💬 Chat ID: ${chatId}`);
        console.log('\n📊 Endpoints:');
        console.log(`   Health: http://localhost:${webhookPort}/health`);
        console.log(`   Webhook: http://localhost:${webhookPort}/webhook/telegram`);
        console.log('\n⌨️  Press Ctrl+C to stop\n');

        // Graceful shutdown
        const cleanup = async () => {
            console.log('\n\n🛑 Shutting down gracefully...');

            // Close SSH connections
            await commandExecutor.close();

            // Close session manager
            sessionManager.close();

            // Disconnect ngrok
            if (ngrokEnabled) {
                await ngrok.disconnect();
                await ngrok.kill();
            }

            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

    } catch (error) {
        console.error('❌ Failed to start Webhook Server:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

start();
