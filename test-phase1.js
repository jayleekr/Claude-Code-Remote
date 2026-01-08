#!/usr/bin/env node

/**
 * Phase 1 Test Script
 *
 * Tests the notification flow: Hook → Central Hub → Telegram
 */

const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

async function testPhase1() {
    console.log('🧪 Phase 1 Testing: Notification Flow\n');

    const hubEndpoint = process.env.CENTRAL_HUB_ENDPOINT || 'http://localhost:3001/notify';
    const serverId = process.env.SERVER_ID || 'local';
    const sharedSecret = process.env.SHARED_SECRET;

    if (!sharedSecret) {
        console.error('❌ SHARED_SECRET not found in .env');
        process.exit(1);
    }

    console.log('📋 Test Configuration:');
    console.log('   Hub Endpoint:', hubEndpoint);
    console.log('   Server ID:', serverId);
    console.log('   Shared Secret:', sharedSecret.substring(0, 8) + '...\n');

    // Test 1: Health Check
    console.log('Test 1: Health Check');
    try {
        const healthUrl = hubEndpoint.replace('/notify', '/health');
        const healthResponse = await axios.get(healthUrl);
        console.log('✅ Aggregator is healthy');
        console.log('   Servers:', healthResponse.data.servers);
        console.log('   Active Sessions:', healthResponse.data.activeSessions, '\n');
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
        console.log('   Make sure aggregator is running: node start-aggregator.js\n');
        process.exit(1);
    }

    // Test 2: Send Test Notification
    console.log('Test 2: Send Test Notification');
    try {
        const testNotification = {
            serverId: serverId,
            type: 'completed',
            project: 'test-project',
            metadata: {
                userQuestion: 'Test question for Phase 1 validation',
                claudeResponse: 'This is a test response to verify the notification aggregator is working correctly.',
                tmuxSession: 'test-session'
            }
        };

        const response = await axios.post(hubEndpoint, testNotification, {
            headers: {
                'X-Shared-Secret': sharedSecret,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Notification sent successfully');
        console.log('   Session ID:', response.data.session.id);
        console.log('   Identifier:', response.data.session.identifier);
        console.log('   Token:', response.data.session.token, '\n');
    } catch (error) {
        console.error('❌ Notification failed:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
        process.exit(1);
    }

    // Test 3: Check Sessions
    console.log('Test 3: Check Active Sessions');
    try {
        const sessionsUrl = hubEndpoint.replace('/notify', '/sessions');
        const sessionsResponse = await axios.get(sessionsUrl);
        console.log('✅ Sessions retrieved');
        console.log('   Total Sessions:', sessionsResponse.data.count);

        if (sessionsResponse.data.count > 0) {
            console.log('\n   Recent Sessions:');
            sessionsResponse.data.sessions.slice(0, 3).forEach(session => {
                console.log(`   - ${session.serverId}:${session.serverNumber} (${session.token}) - ${session.project}`);
            });
        }
        console.log();
    } catch (error) {
        console.error('❌ Sessions check failed:', error.message, '\n');
    }

    // Test 4: Verify Telegram
    console.log('Test 4: Telegram Verification');
    console.log('✅ Check your Telegram for the test notification');
    console.log('   Expected format: ✅ [' + serverId.toUpperCase() + '] Claude Task Completed');
    console.log('   Session format: ' + serverId + ':1');
    console.log();

    console.log('🎉 Phase 1 Testing Complete!\n');
    console.log('Next Steps:');
    console.log('1. Verify Telegram received the notification');
    console.log('2. Try sending a command: /cmd ' + serverId + ':1 echo "test"');
    console.log('3. Move to Phase 2: Command Routing\n');
}

testPhase1().catch(error => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
});
