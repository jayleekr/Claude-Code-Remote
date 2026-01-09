#!/usr/bin/env node

/**
 * Command Executor Test Script
 *
 * Tests command execution on local and remote servers
 */

const path = require('path');
const ServerRegistry = require('./src/hub/server-registry');
const CommandExecutor = require('./src/remote/command-executor');

async function test() {
    console.log('🧪 Testing Command Executor\n');

    try {
        // Initialize ServerRegistry
        const serverRegistry = new ServerRegistry(
            path.join(__dirname, 'config/servers.json')
        );

        console.log('✅ ServerRegistry loaded');
        console.log(`📦 Servers: ${serverRegistry.getAllServers().map(s => s.id).join(', ')}\n`);

        // Initialize CommandExecutor
        const commandExecutor = new CommandExecutor(serverRegistry);
        console.log('✅ CommandExecutor initialized\n');

        // Test 1: Local command execution
        console.log('📝 Test 1: Local command execution');
        console.log('   Command: echo "Hello from local"');
        console.log('   Server: local');
        console.log('   Tmux session: claude-code-remote\n');

        try {
            await commandExecutor.execute('local', 'echo "Hello from local"', 'claude-code-remote');
            console.log('✅ Test 1 PASSED\n');
        } catch (error) {
            console.error('❌ Test 1 FAILED:', error.message, '\n');
        }

        // Test 2: Remote command execution
        console.log('📝 Test 2: Remote command execution');
        console.log('   Command: echo "Hello from kr4"');
        console.log('   Server: kr4');
        console.log('   Tmux session: 1\n');

        try {
            await commandExecutor.execute('kr4', 'echo "Hello from kr4"', '1');
            console.log('✅ Test 2 PASSED\n');
        } catch (error) {
            console.error('❌ Test 2 FAILED:', error.message, '\n');
        }

        // Test 3: Test SSH connection reuse
        console.log('📝 Test 3: SSH connection reuse');
        console.log('   Command: pwd');
        console.log('   Server: kr4');
        console.log('   Tmux session: 1\n');

        try {
            await commandExecutor.execute('kr4', 'pwd', '1');
            console.log('✅ Test 3 PASSED (should reuse connection)\n');
        } catch (error) {
            console.error('❌ Test 3 FAILED:', error.message, '\n');
        }

        // Cleanup
        console.log('🔌 Closing SSH connections...');
        await commandExecutor.close();
        console.log('✅ Cleanup complete\n');

        console.log('🎉 All tests completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

test();
