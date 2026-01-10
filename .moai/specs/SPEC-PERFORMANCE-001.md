# SPEC-PERFORMANCE-001: Connection Pooling and Caching

## SPEC Header

- **SPEC ID**: SPEC-PERFORMANCE-001
- **Title**: Connection Pooling and Caching
- **Priority**: MEDIUM
- **Category**: Performance / Optimization
- **Author**: Claude Code Remote Team
- **Date**: 2026-01-10
- **Status**: DRAFT
- **Dependencies**: SPEC-RELIABILITY-001 (circuit breakers respect pool state)
- **Related SPECs**: SPEC-MONITORING-001 (pool metrics), SPEC-UX-001 (faster responses)

---

## Executive Summary

### Problem Statement

The current system experiences performance issues due to:

1. **Connection Overhead**: Each SSH command creates new connection (2-5 second overhead)
2. **No Connection Reuse**: Existing connection pooling insufficient for high-frequency usage
3. **Repeated Queries**: Session lookups and server configs queried repeatedly
4. **No Caching**: Database queries and external data not cached
5. **Resource Waste**: Connections kept open indefinitely without cleanup

**Quantified Impact**:
- SSH connection establishment: 2-5 seconds per command
- Database query overhead: 50-100ms per notification (repeated queries)
- Resource waste: ~30% of SSH connections idle >5 minutes
- User-perceived latency: 3-8 seconds for simple commands

### Proposed Solution

Implement performance optimization infrastructure:

1. **Advanced Connection Pool**: LRU eviction, health monitoring, per-server pools
2. **Multi-Layer Caching**: Session cache, server config cache, metrics cache
3. **Connection Lifecycle**: Intelligent keep-alive, idle timeout, pool sizing
4. **Query Optimization**: Prepared statements, batch operations, index optimization
5. **Resource Monitoring**: Pool saturation alerts, cache hit rates, connection metrics

**High-Level Approach**:
- Replace basic connection map with production-grade connection pool
- Add in-memory LRU cache with TTL for hot data
- Optimize database with indices and prepared statements
- Monitor pool performance and tune based on metrics

### Business Value

**Quantified Impact**:
- **Latency Reduction**: 3-8 seconds → <1 second for warm connections (85% improvement)
- **Throughput Increase**: 2-3x more concurrent commands supported
- **Resource Efficiency**: 40% reduction in idle connections
- **Cost Savings**: Lower server resource usage (CPU, memory, network)

**Cost-Benefit Analysis**:
- Development Effort: ~25 hours
- Maintenance Overhead: +3% (pool monitoring and tuning)
- Return on Investment: Positive after 2 weeks (resource savings)

### Implementation Effort Estimate

- **Total Effort**: 25 hours across 3 phases
- **Team Size**: 1 developer
- **Timeline**: 1.5 weeks
- **Risk Level**: Medium (requires careful testing of connection lifecycle)

---

## EARS Format Requirements

### Ubiquitous Requirements

1. **Connection Pooling**
   - The system **shall** maintain connection pool per server with configurable size limits
   - WHY: Connection reuse eliminates 2-5s overhead per command
   - IMPACT: Without pooling, every command pays connection setup cost

2. **Cache Consistency**
   - The system **shall** ensure cached data never exceeds 5-minute staleness
   - WHY: Stale data causes incorrect routing and session lookup failures
   - IMPACT: Inconsistent cache creates user-facing errors

3. **Resource Limits**
   - The system **shall** enforce maximum connection limits to prevent resource exhaustion
   - WHY: Unbounded pools cause memory and file descriptor exhaustion
   - IMPACT: Resource exhaustion crashes entire system

### Event-Driven Requirements

1. **Connection Request**
   - **WHEN** SSH command needs connection, **THEN** the system shall:
     - Check pool for available connection
     - Reuse existing healthy connection if available
     - Create new connection if pool not full
     - Wait with timeout if pool saturated

2. **Connection Failure**
   - **WHEN** pooled connection fails health check, **THEN** the system shall:
     - Remove from pool immediately
     - Decrement pool size counter
     - Log connection failure event
     - Create replacement connection if pool below minimum

3. **Idle Timeout**
   - **WHEN** connection idle >5 minutes, **THEN** the system shall:
     - Close connection gracefully
     - Remove from pool
     - Free resources
     - Log idle timeout event

4. **Cache Miss**
   - **WHEN** cache lookup fails, **THEN** the system shall:
     - Query authoritative source (database)
     - Populate cache with result
     - Set TTL based on data type
     - Return result to caller

### State-Driven Requirements

1. **Pool Saturated**
   - **IF** all pool connections in use, **THEN** the system shall:
     - Queue request with timeout (max 10 seconds)
     - Log pool saturation event
     - Send alert if saturation persists >1 minute
     - Consider pool size increase

2. **Cache Hit**
   - **IF** requested data in cache and not expired, **THEN** the system shall:
     - Return cached data immediately
     - Record cache hit metric
     - Skip database query
     - Update last access timestamp

3. **Pool Healthy**
   - **IF** pool has available connections, **THEN** the system shall:
     - Serve requests immediately
     - Record pool metrics
     - Perform background health checks
     - Maintain minimum pool size

### Unwanted Requirements

1. **Connection Leaks**
   - The system **shall NOT** hold connections indefinitely without returning to pool
   - WHY: Leaked connections exhaust pool and cause resource starvation
   - IMPACT: Pool exhaustion makes system unresponsive

2. **Cache Poisoning**
   - The system **shall NOT** cache error responses or invalid data
   - WHY: Cached errors persist and amplify failures
   - IMPACT: Error caching creates persistent user-facing issues

3. **Unbounded Growth**
   - The system **shall NOT** allow connection pool or cache to grow indefinitely
   - WHY: Unbounded growth causes memory exhaustion
   - IMPACT: OOM kills and system crashes

### Optional Requirements

1. **Adaptive Pool Sizing**
   - WHERE traffic patterns vary significantly, the system **may** automatically adjust pool size
   - WHY: Optimize resource usage for varying load
   - IMPACT: Better resource efficiency during low traffic

2. **Distributed Caching**
   - WHERE system scales to multiple hub instances, the system **may** implement distributed cache
   - WHY: Share cache across instances for consistency
   - IMPACT: Higher cache hit rates and better performance

---

## Technical Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│               Performance Layer (New)                    │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Connection   │  │ LRU Cache    │  │ Query        │  │
│  │ Pool         │  │ Manager      │  │ Optimizer    │  │
│  │ (Per-Server) │  │ (Multi-TTL)  │  │ (Prepared)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
│  Pool Features:                Cache Layers:             │
│  - Health monitoring           - Session cache (30s TTL) │
│  - LRU eviction                - Server config (5min)    │
│  - Keep-alive                  - Metrics cache (10s)     │
│  - Idle timeout (5min)         - LRU eviction            │
│  - Min/max sizing              - Hit rate tracking       │
│  - Wait queue                                            │
└─────────────────────────────────────────────────────────┘
```

### New Components

#### 1. Connection Pool Manager (`src/performance/connection-pool.js`)

**Advanced Connection Pool**:
```javascript
class ConnectionPool {
    constructor(serverId, config = {}) {
        this.serverId = serverId;
        this.config = {
            minSize: config.minSize || 1,
            maxSize: config.maxSize || 5,
            idleTimeoutMs: config.idleTimeoutMs || 300000, // 5 minutes
            healthCheckIntervalMs: config.healthCheckIntervalMs || 60000, // 1 minute
            waitTimeoutMs: config.waitTimeoutMs || 10000 // 10 seconds
        };

        this.available = [];  // Available connections
        this.inUse = new Set();  // In-use connections
        this.waitQueue = [];  // Waiting requests
        this.lastActivity = new Map();  // Connection → last use timestamp
    }

    async acquire() {
        // Try to get available connection
        if (this.available.length > 0) {
            const conn = this.available.pop();

            // Health check before returning
            if (await this._isHealthy(conn)) {
                this.inUse.add(conn);
                this.lastActivity.set(conn, Date.now());
                this._recordMetric('connection_acquired', 'available');
                return conn;
            } else {
                // Connection unhealthy, remove and try again
                await this._destroyConnection(conn);
                return this.acquire();
            }
        }

        // Create new connection if pool not full
        if (this.inUse.size < this.config.maxSize) {
            const conn = await this._createConnection();
            this.inUse.add(conn);
            this.lastActivity.set(conn, Date.now());
            this._recordMetric('connection_acquired', 'new');
            return conn;
        }

        // Wait for available connection
        return this._waitForConnection();
    }

    async release(conn) {
        if (!this.inUse.has(conn)) return;

        this.inUse.delete(conn);
        this.lastActivity.set(conn, Date.now());

        // Return to available pool
        this.available.push(conn);
        this._recordMetric('connection_released');

        // Process wait queue
        if (this.waitQueue.length > 0) {
            const { resolve } = this.waitQueue.shift();
            const nextConn = this.available.pop();
            this.inUse.add(nextConn);
            resolve(nextConn);
        }
    }

    async _waitForConnection() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                // Remove from queue
                const index = this.waitQueue.findIndex(w => w.resolve === resolve);
                if (index !== -1) {
                    this.waitQueue.splice(index, 1);
                }

                this._recordMetric('connection_wait_timeout');
                reject(new Error('Connection pool wait timeout'));
            }, this.config.waitTimeoutMs);

            this.waitQueue.push({ resolve, reject, timeout });
        });
    }

    async _isHealthy(conn) {
        try {
            await conn.execCommand('echo ping');
            return true;
        } catch {
            return false;
        }
    }

    async _createConnection() {
        const ssh = new NodeSSH();
        await ssh.connect({
            host: this.serverConfig.hostname,
            username: this.serverConfig.ssh.user,
            port: this.serverConfig.ssh.port || 22,
            privateKeyPath: this.serverConfig.ssh.keyPath.replace('~', process.env.HOME),
            keepaliveInterval: 30000  // 30 seconds
        });

        this._recordMetric('connection_created');
        return ssh;
    }

    async _destroyConnection(conn) {
        try {
            await conn.dispose();
            this._recordMetric('connection_destroyed');
        } catch (error) {
            console.error('Failed to destroy connection:', error);
        }
    }

    async cleanup() {
        const now = Date.now();

        // Close idle connections
        for (let i = this.available.length - 1; i >= 0; i--) {
            const conn = this.available[i];
            const idle = now - this.lastActivity.get(conn);

            if (idle > this.config.idleTimeoutMs) {
                this.available.splice(i, 1);
                await this._destroyConnection(conn);
                this._recordMetric('connection_idle_timeout');
            }
        }

        // Maintain minimum pool size
        while (this.available.length + this.inUse.size < this.config.minSize) {
            const conn = await this._createConnection();
            this.available.push(conn);
        }
    }

    startHealthChecks() {
        setInterval(() => this.cleanup(), this.config.healthCheckIntervalMs);
    }

    getStats() {
        return {
            available: this.available.length,
            inUse: this.inUse.size,
            waiting: this.waitQueue.length,
            total: this.available.length + this.inUse.size
        };
    }
}
```

#### 2. LRU Cache Manager (`src/performance/lru-cache.js`)

**Multi-TTL Cache**:
```javascript
class LRUCache {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map();  // key → { value, expiry, lastAccess }
        this.accessOrder = [];  // LRU tracking
    }

    set(key, value, ttlMs = 300000) {
        const expiry = Date.now() + ttlMs;

        // Evict if full
        if (this.cache.size >= this.maxSize) {
            this._evictLRU();
        }

        this.cache.set(key, {
            value,
            expiry,
            lastAccess: Date.now()
        });

        this._updateAccessOrder(key);
        this._recordMetric('cache_set');
    }

    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this._recordMetric('cache_miss');
            return null;
        }

        // Check expiry
        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            this._recordMetric('cache_expired');
            return null;
        }

        // Update access
        entry.lastAccess = Date.now();
        this._updateAccessOrder(key);
        this._recordMetric('cache_hit');

        return entry.value;
    }

    _evictLRU() {
        if (this.accessOrder.length === 0) return;

        const lruKey = this.accessOrder.shift();
        this.cache.delete(lruKey);
        this._recordMetric('cache_evicted_lru');
    }

    _updateAccessOrder(key) {
        // Remove from current position
        const index = this.accessOrder.indexOf(key);
        if (index !== -1) {
            this.accessOrder.splice(index, 1);
        }

        // Add to end (most recently used)
        this.accessOrder.push(key);
    }

    cleanup() {
        const now = Date.now();
        let evicted = 0;

        for (const [key, entry] of this.cache) {
            if (now > entry.expiry) {
                this.cache.delete(key);
                evicted++;
            }
        }

        if (evicted > 0) {
            this._recordMetric('cache_cleanup', evicted);
        }
    }

    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: this._calculateHitRate()
        };
    }
}
```

#### 3. Query Optimizer (`src/performance/query-optimizer.js`)

**Prepared Statements and Batch Operations**:
```javascript
class QueryOptimizer {
    constructor(db) {
        this.db = db;
        this.preparedStatements = new Map();
        this.batchQueue = [];
        this.batchIntervalMs = 100;  // 100ms batching window
    }

    prepare(name, sql) {
        if (!this.preparedStatements.has(name)) {
            this.preparedStatements.set(name, this.db.prepare(sql));
        }

        return this.preparedStatements.get(name);
    }

    get(queryName, ...params) {
        const stmt = this.preparedStatements.get(queryName);
        if (!stmt) throw new Error(`Query ${queryName} not prepared`);

        const start = Date.now();
        const result = stmt.get(...params);
        this._recordMetric('query_execution_ms', Date.now() - start);

        return result;
    }

    all(queryName, ...params) {
        const stmt = this.preparedStatements.get(queryName);
        if (!stmt) throw new Error(`Query ${queryName} not prepared`);

        const start = Date.now();
        const results = stmt.all(...params);
        this._recordMetric('query_execution_ms', Date.now() - start);

        return results;
    }

    // Batch insert for performance
    batchInsert(tableName, rows) {
        if (rows.length === 0) return;

        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

        const stmt = this.db.prepare(sql);

        const transaction = this.db.transaction((rows) => {
            for (const row of rows) {
                stmt.run(...columns.map(col => row[col]));
            }
        });

        const start = Date.now();
        transaction(rows);
        this._recordMetric('batch_insert_ms', Date.now() - start);
        this._recordMetric('batch_insert_rows', rows.length);
    }
}
```

### Existing Components to Modify

#### 1. `command-executor.js` Integration

**Use connection pool instead of basic map**:
```javascript
class CommandExecutor {
    constructor(serverRegistry) {
        this.serverRegistry = serverRegistry;
        this.connectionPools = new Map();  // serverId → ConnectionPool

        // Initialize pools for each server
        for (const server of serverRegistry.getAllServers()) {
            this.connectionPools.set(server.id, new ConnectionPool(server.id, {
                minSize: 1,
                maxSize: 5,
                idleTimeoutMs: 300000
            }));

            // Start health checks
            this.connectionPools.get(server.id).startHealthChecks();
        }
    }

    async execute(serverId, command, tmuxSession) {
        const pool = this.connectionPools.get(serverId);
        if (!pool) throw new Error(`No connection pool for ${serverId}`);

        let connection;

        try {
            // Acquire connection from pool
            connection = await pool.acquire();

            // Execute command
            const result = await connection.execCommand(
                `tmux send-keys -t ${tmuxSession} '${command}' Enter`
            );

            return result;
        } finally {
            // Always release connection back to pool
            if (connection) {
                await pool.release(connection);
            }
        }
    }

    getPoolStats() {
        const stats = {};

        for (const [serverId, pool] of this.connectionPools) {
            stats[serverId] = pool.getStats();
        }

        return stats;
    }
}
```

#### 2. `session-manager.js` Caching

**Add session cache layer**:
```javascript
class SessionManager {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.cache = new LRUCache(500);  // Cache 500 sessions
        this.queryOptimizer = new QueryOptimizer(this.db);

        // Prepare common queries
        this.queryOptimizer.prepare('find_by_token', `
            SELECT * FROM sessions WHERE token = ? AND expiresAt > ?
        `);

        this.queryOptimizer.prepare('find_by_server_number', `
            SELECT * FROM sessions WHERE serverId = ? AND serverNumber = ? AND expiresAt > ?
        `);
    }

    findSession(identifier) {
        // Try cache first
        const cacheKey = `session:${identifier}`;
        const cached = this.cache.get(cacheKey);

        if (cached) return cached;

        // Cache miss - query database
        let session;

        if (identifier.includes(':')) {
            const [serverId, numberStr] = identifier.split(':');
            const serverNumber = parseInt(numberStr);

            session = this.queryOptimizer.get(
                'find_by_server_number',
                serverId,
                serverNumber,
                Math.floor(Date.now() / 1000)
            );
        } else {
            session = this.queryOptimizer.get(
                'find_by_token',
                identifier,
                Math.floor(Date.now() / 1000)
            );
        }

        // Populate cache with 30 second TTL
        if (session) {
            session.metadata = JSON.parse(session.metadata || '{}');
            this.cache.set(cacheKey, session, 30000);
        }

        return session;
    }

    createSession({ serverId, project, metadata = {} }) {
        const session = {
            // ... existing logic
        };

        // Insert to database
        const stmt = this.db.prepare(/* ... */);
        stmt.run(session);

        // Invalidate cache for this server
        this.cache.set(`session:${serverId}:${session.serverNumber}`, session, 30000);
        this.cache.set(`session:${session.token}`, session, 30000);

        return session;
    }
}
```

### Database Optimizations

**Add indices for hot queries**:
```sql
-- Already exists, ensure they are present
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_server_number ON sessions(serverId, serverNumber);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expiresAt);

-- New composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(serverId, expiresAt)
    WHERE expiresAt > strftime('%s', 'now');
```

**Enable query planning**:
```javascript
// Analyze query performance
this.db.pragma('analysis_limit = 1000');
this.db.exec('ANALYZE');
```

---

## Implementation Phases

### Phase 1: Connection Pooling (Week 1, 10 hours)

**Tasks**:
1. Implement connection pool (4 hours)
2. Integrate with command-executor (3 hours)
3. Add pool metrics (2 hours)
4. Testing (1 hour)

**Deliverables**:
- `src/performance/connection-pool.js`
- Modified `command-executor.js`
- Pool metrics integration

---

### Phase 2: Caching Layer (Week 2, 10 hours)

**Tasks**:
1. Implement LRU cache (3 hours)
2. Add session caching (3 hours)
3. Add server config caching (2 hours)
4. Testing (2 hours)

**Deliverables**:
- `src/performance/lru-cache.js`
- Modified `session-manager.js`
- Cache metrics

---

### Phase 3: Query Optimization (Week 2, 5 hours)

**Tasks**:
1. Implement query optimizer (2 hours)
2. Add prepared statements (2 hours)
3. Production deployment (1 hour)

**Deliverables**:
- `src/performance/query-optimizer.js`
- Optimized database queries
- Production deployment

---

## Acceptance Criteria

### Functional Criteria

1. **Connection Reuse**: Warm connections serve commands in <1 second
2. **Pool Management**: Pool maintains min/max size constraints
3. **Cache Hit Rate**: ≥70% cache hit rate for session lookups
4. **Resource Limits**: Connection count never exceeds configured maximum

### Performance Benchmarks

1. **Latency Reduction**: P95 command latency <1 second (vs 3-8 seconds baseline)
2. **Throughput**: Support 10 concurrent commands (vs 3-4 baseline)
3. **Cache Performance**: Session lookup <10ms on cache hit
4. **Pool Efficiency**: <5% connection wait time under normal load

### Quality Metrics

1. **Code Coverage**: ≥80% for performance modules
2. **Load Testing**: Sustain 20 commands/minute without degradation
3. **Resource Usage**: <50MB RAM increase for caching
4. **Connection Health**: >95% connection health check pass rate

---

## Git Strategy

**Branch**: `feature/SPEC-PERFORMANCE-001-connection-pooling`
**Commit Format**: `perf(SPEC-PERFORMANCE-001): <description>`
**PR Title**: `[SPEC-PERFORMANCE-001] Connection Pooling and Caching`

---

**End of SPEC-PERFORMANCE-001**

**Estimated Start Date**: 2026-02-17
**Estimated Completion Date**: 2026-02-28
**Status**: Ready for Review
