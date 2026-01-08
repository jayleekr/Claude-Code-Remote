#!/usr/bin/env node

/**
 * Notification Aggregator Startup Script
 *
 * Starts the central hub notification aggregator server
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const NotificationAggregator = require('./src/hub/notification-aggregator');

async function start() {
    console.log('🚀 Starting Notification Aggregator...\n');

    try {
        // Get Telegram configuration from environment
        const telegramConfig = {
            botToken: process.env.TELEGRAM_BOT_TOKEN,
            chatId: process.env.TELEGRAM_CHAT_ID,
            groupId: process.env.TELEGRAM_GROUP_ID
        };

        if (!telegramConfig.botToken) {
            console.error('❌ TELEGRAM_BOT_TOKEN not found in .env');
            process.exit(1);
        }

        if (!telegramConfig.chatId && !telegramConfig.groupId) {
            console.error('❌ Neither TELEGRAM_CHAT_ID nor TELEGRAM_GROUP_ID found in .env');
            process.exit(1);
        }

        // Create aggregator instance
        const aggregator = new NotificationAggregator({
            port: parseInt(process.env.NOTIFICATION_PORT || '3001'),
            sharedSecret: process.env.SHARED_SECRET,
            serverRegistryPath: path.join(__dirname, 'config/servers.json'),
            sessionManagerPath: path.join(__dirname, 'data/sessions.db'),
            telegram: telegramConfig
        });

        // Start the server
        await aggregator.start();

        console.log('\n✅ Notification Aggregator is running!');
        console.log('📍 Receiving notifications at: http://localhost:' + aggregator.port + '/notify');
        console.log('💬 Forwarding to Telegram chat:', telegramConfig.chatId || telegramConfig.groupId);
        console.log('\n📊 Health check: http://localhost:' + aggregator.port + '/health');
        console.log('📋 Active sessions: http://localhost:' + aggregator.port + '/sessions');
        console.log('\n⌨️  Press Ctrl+C to stop\n');

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n\n🛑 Shutting down gracefully...');
            await aggregator.stop();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('\n\n🛑 Shutting down gracefully...');
            await aggregator.stop();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Failed to start Notification Aggregator:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

start();
