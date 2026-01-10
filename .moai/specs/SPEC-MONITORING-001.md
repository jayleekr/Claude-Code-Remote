# SPEC-MONITORING-001: Observability and Health Dashboard

## SPEC Header

- **SPEC ID**: SPEC-MONITORING-001
- **Title**: Observability and Health Dashboard
- **Priority**: HIGH
- **Category**: Infrastructure / Monitoring
- **Author**: Claude Code Remote Team
- **Date**: 2026-01-10
- **Status**: DRAFT
- **Dependencies**: SPEC-RELIABILITY-001 (consumes reliability metrics)
- **Related SPECs**: SPEC-PERFORMANCE-001 (performance metrics)

---

## Executive Summary

### Problem Statement

The current Claude-Code-Remote system lacks comprehensive observability, leading to:

1. **Blind Spots**: No visibility into system health, error rates, or performance degradation
2. **Slow Incident Response**: Manual log inspection required to diagnose issues
3. **No Capacity Planning**: Unable to predict when system will reach resource limits
4. **Poor User Experience**: Users unaware of system status during outages
5. **Limited Debugging**: Difficult to trace issues across distributed components

**Quantified Impact**:
- Mean Time To Detect (MTTD) issues: 30-60 minutes (relies on user reports)
- Mean Time To Diagnose (MTTD): 15-30 minutes (manual log inspection)
- Incident response slowed by lack of metrics and tracing
- No proactive alerting for degraded performance

### Proposed Solution

Implement comprehensive observability infrastructure with:

1. **Metrics Collection**: Prometheus-style metrics for all critical operations
2. **Health Dashboard**: Real-time web dashboard showing system status
3. **Distributed Tracing**: Request tracing across SSH → Notification → Telegram flow
4. **Alerting System**: Proactive alerts for error thresholds and degraded performance
5. **Log Aggregation**: Structured logging with correlation IDs

**High-Level Approach**:
- Instrument all components with metrics (counters, gauges, histograms)
- Create Express-based dashboard endpoint serving real-time metrics
- Implement request correlation with trace IDs
- Add alerting for critical thresholds (error rate, latency, disk usage)

### Business Value

**Quantified Impact**:
- **MTTD Reduction**: 30-60 minutes → <5 minutes (automated detection)
- **MTTD Reduction**: 15-30 minutes → <5 minutes (dashboard-driven diagnosis)
- **Proactive Issue Prevention**: Detect 80% of issues before user impact
- **Operational Efficiency**: Save 5-10 hours/week on manual monitoring

**Cost-Benefit Analysis**:
- Development Effort: ~35 hours
- Maintenance Overhead: +10% (metrics collection, dashboard updates)
- Return on Investment: Positive after 1 week of deployment

### Implementation Effort Estimate

- **Total Effort**: 35 hours across 3 phases
- **Team Size**: 1 developer
- **Timeline**: 2 weeks
- **Risk Level**: Low (additive features, no breaking changes)

---

## EARS Format Requirements

### Ubiquitous Requirements (Always Active)

1. **Metrics Collection**
   - The system **shall** collect metrics for all SSH commands, Telegram notifications, and database operations
   - WHY: Complete metrics enable performance analysis and capacity planning
   - IMPACT: Missing metrics create blind spots in system behavior

2. **Real-Time Dashboard**
   - The system **shall** provide real-time dashboard accessible via HTTP endpoint
   - WHY: Operators need instant visibility into system health
   - IMPACT: Delayed visibility increases incident response time

3. **Correlation IDs**
   - The system **shall** assign unique trace ID to each notification flow
   - WHY: Distributed tracing enables end-to-end request tracking
   - IMPACT: Without trace IDs, debugging multi-component issues becomes manual and error-prone

### Event-Driven Requirements (WHEN/THEN)

1. **High Error Rate Alert**
   - **WHEN** error rate exceeds 10% over 5-minute window, **THEN** the system shall:
     - Send alert to administrator via Telegram
     - Log alert event with context
     - Display alert indicator on dashboard
     - Trigger diagnostic health check

2. **Server Health Degradation**
   - **WHEN** server circuit breaker opens, **THEN** the system shall:
     - Update dashboard with server status "UNAVAILABLE"
     - Log circuit breaker state change
     - Send notification to administrator
     - Start tracking recovery metrics

3. **Dead Letter Queue Growth**
   - **WHEN** dead letter queue size exceeds 100 messages, **THEN** the system shall:
     - Send alert to administrator
     - Display queue size prominently on dashboard
     - Log queue growth trend
     - Provide admin link to inspect queue

4. **Performance Degradation**
   - **WHEN** SSH command P95 latency exceeds 10 seconds, **THEN** the system shall:
     - Log performance degradation event
     - Update dashboard latency chart
     - Send warning notification
     - Suggest capacity review

### State-Driven Requirements (IF/THEN)

1. **System Healthy State**
   - **IF** all servers are HEALTHY (circuit breakers closed, error rate <5%), **THEN** the dashboard shall:
     - Display green health indicator
     - Show normal operational metrics
     - Provide summary statistics
     - Show uptime percentage

2. **System Degraded State**
   - **IF** 1-3 servers are UNAVAILABLE, **THEN** the dashboard shall:
     - Display yellow degraded indicator
     - Highlight affected servers
     - Show error rate trend
     - Provide link to incident response runbook

3. **System Critical State**
   - **IF** >50% servers are UNAVAILABLE or error rate >30%, **THEN** the dashboard shall:
     - Display red critical indicator
     - Show all active incidents
     - Disable non-essential features
     - Provide emergency contact information

### Unwanted Requirements (SHALL NOT)

1. **Performance Overhead**
   - The system **shall NOT** introduce >5% performance overhead due to metrics collection
   - WHY: Observability should not degrade user experience
   - IMPACT: Excessive overhead makes monitoring system part of the problem

2. **Sensitive Data in Metrics**
   - The system **shall NOT** log or expose sensitive data (SSH keys, tokens, user messages) in metrics or dashboards
   - WHY: Security and privacy requirements
   - IMPACT: Data leaks create security and compliance risks

3. **Unbounded Metric Storage**
   - The system **shall NOT** store metrics indefinitely without retention policy
   - WHY: Unbounded storage causes disk exhaustion
   - IMPACT: System failure due to disk space

### Optional Requirements (WHERE/MAY)

1. **Custom Metrics**
   - WHERE users have specific monitoring needs, the system **may** provide custom metric registration API
   - WHY: Extensibility for future requirements
   - IMPACT: Enables advanced monitoring scenarios

2. **Metric Export**
   - WHERE integration with external monitoring systems is required, the system **may** provide Prometheus-compatible export endpoint
   - WHY: Integration with enterprise monitoring infrastructure
   - IMPACT: Enables centralized monitoring

---

## Technical Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│               Observability Layer (New)                  │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Metrics      │  │ Trace ID     │  │ Health       │  │
│  │ Collector    │  │ Manager      │  │ Dashboard    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Alert Manager (New)                      │   │
│  │  - Threshold evaluation                          │   │
│  │  - Alert routing (Telegram, Email)               │   │
│  │  - Alert suppression and aggregation             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Metrics Store (In-Memory)                │   │
│  │  - Time-series data (60 minutes retention)       │   │
│  │  - Aggregation (1min, 5min, 15min buckets)      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│            Instrumented Components                       │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │ Command        │  │ Notification   │                 │
│  │ Executor       │  │ Aggregator     │                 │
│  │ + metrics()    │  │ + metrics()    │                 │
│  └────────────────┘  └────────────────┘                 │
│                                                           │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │ Session        │  │ Telegram       │                 │
│  │ Manager        │  │ Channel        │                 │
│  │ + metrics()    │  │ + metrics()    │                 │
│  └────────────────┘  └────────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

### New Components

#### 1. Metrics Collector (`src/observability/metrics-collector.js`)

**Responsibilities**:
- Collect metrics from instrumented components
- Store metrics in time-series format
- Provide query interface for dashboard
- Implement retention policy (60 minutes rolling window)

**Metric Types**:

**Counters** (monotonically increasing):
- `ssh_commands_total{server, status}`: Total SSH commands executed
- `telegram_notifications_total{status}`: Total Telegram notifications sent
- `db_queries_total{operation, status}`: Total database queries
- `circuit_breaker_state_changes_total{server, from_state, to_state}`: Circuit breaker transitions

**Gauges** (point-in-time values):
- `ssh_connections_active{server}`: Active SSH connections
- `sessions_active{server}`: Active sessions
- `dead_letter_queue_size`: Current DLQ size
- `circuit_breaker_state{server}`: Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)

**Histograms** (distribution of values):
- `ssh_command_duration_seconds{server}`: SSH command execution time
- `telegram_notification_duration_seconds`: Telegram API call duration
- `db_query_duration_seconds{operation}`: Database query duration

**Implementation**:
```javascript
class MetricsCollector {
    constructor() {
        this.counters = new Map();
        this.gauges = new Map();
        this.histograms = new Map();
        this.timeSeries = []; // Rolling 60-minute window
        this.retentionMinutes = 60;
    }

    incrementCounter(name, labels = {}, value = 1) {
        const key = this._serializeKey(name, labels);
        const current = this.counters.get(key) || 0;
        this.counters.set(key, current + value);
        this._recordTimeSeries(name, labels, current + value, 'counter');
    }

    setGauge(name, labels = {}, value) {
        const key = this._serializeKey(name, labels);
        this.gauges.set(key, value);
        this._recordTimeSeries(name, labels, value, 'gauge');
    }

    recordHistogram(name, labels = {}, value) {
        const key = this._serializeKey(name, labels);
        if (!this.histograms.has(key)) {
            this.histograms.set(key, []);
        }
        this.histograms.get(key).push({ timestamp: Date.now(), value });
        this._recordTimeSeries(name, labels, value, 'histogram');
    }

    query(name, labels = {}, timeRange = '5m') {
        // Query time-series data for dashboard
        const endTime = Date.now();
        const startTime = endTime - this._parseTimeRange(timeRange);

        return this.timeSeries
            .filter(entry =>
                entry.name === name &&
                entry.timestamp >= startTime &&
                entry.timestamp <= endTime &&
                this._labelsMatch(entry.labels, labels)
            );
    }

    getSnapshot() {
        // Return current state of all metrics for dashboard
        return {
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
            histograms: this._summarizeHistograms(),
            timestamp: Date.now()
        };
    }
}
```

#### 2. Health Dashboard (`src/observability/health-dashboard.js`)

**Responsibilities**:
- Serve HTML dashboard via HTTP endpoint
- Provide real-time metrics API for frontend
- Display system health status
- Show performance charts and server statuses

**Dashboard Sections**:

**Overview Panel**:
- System health indicator (GREEN/YELLOW/RED)
- Total servers and active sessions
- Current error rate and P95 latency
- Uptime percentage (last 24 hours)

**Server Status Panel**:
- List all configured servers
- Circuit breaker state per server
- Active sessions per server
- Last successful command timestamp

**Performance Metrics Panel**:
- SSH command duration (P50, P95, P99)
- Telegram notification duration
- Database query performance
- Time-series charts (last 60 minutes)

**Alerts Panel**:
- Active alerts with severity
- Alert history (last 24 hours)
- Alert acknowledgment interface

**Dead Letter Queue Panel**:
- Current queue size
- Failed messages by type
- Retry attempts distribution
- Link to manual retry interface

**API Endpoints**:
```javascript
GET /dashboard              // HTML dashboard page
GET /api/metrics/snapshot   // Current metrics snapshot
GET /api/metrics/timeseries // Time-series data for charts
GET /api/health/servers     // Server health status
GET /api/alerts/active      // Active alerts
GET /api/deadletter/stats   // DLQ statistics
```

**Dashboard HTML**:
```html
<!DOCTYPE html>
<html>
<head>
    <title>Claude Code Remote - Health Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        .health-indicator {
            font-size: 48px;
            font-weight: bold;
        }
        .health-green { color: #28a745; }
        .health-yellow { color: #ffc107; }
        .health-red { color: #dc3545; }

        .server-card {
            border: 1px solid #ccc;
            padding: 10px;
            margin: 10px;
            border-radius: 5px;
        }

        .circuit-closed { background: #d4edda; }
        .circuit-open { background: #f8d7da; }
        .circuit-half-open { background: #fff3cd; }
    </style>
</head>
<body>
    <div id="app">
        <h1>Claude Code Remote - Health Dashboard</h1>

        <!-- Overview Section -->
        <div id="overview">
            <div class="health-indicator" id="health-status">●</div>
            <div id="summary-stats"></div>
        </div>

        <!-- Server Status Section -->
        <div id="servers"></div>

        <!-- Performance Charts Section -->
        <div id="charts">
            <canvas id="ssh-latency-chart"></canvas>
            <canvas id="error-rate-chart"></canvas>
        </div>

        <!-- Alerts Section -->
        <div id="alerts"></div>

        <!-- Dead Letter Queue Section -->
        <div id="dead-letter-queue"></div>
    </div>

    <script>
        // Auto-refresh every 5 seconds
        setInterval(updateDashboard, 5000);
        updateDashboard();

        async function updateDashboard() {
            const snapshot = await fetch('/api/metrics/snapshot').then(r => r.json());
            const servers = await fetch('/api/health/servers').then(r => r.json());
            const alerts = await fetch('/api/alerts/active').then(r => r.json());

            updateOverview(snapshot);
            updateServerStatus(servers);
            updateCharts();
            updateAlerts(alerts);
        }
    </script>
</body>
</html>
```

#### 3. Trace ID Manager (`src/observability/trace-manager.js`)

**Responsibilities**:
- Generate unique trace IDs for each notification flow
- Propagate trace IDs across components
- Provide correlation for distributed tracing
- Store trace metadata for debugging

**Trace ID Format**: `trace_{timestamp}_{random}` (e.g., `trace_1704931200000_a7f3c9`)

**Implementation**:
```javascript
class TraceManager {
    constructor() {
        this.activeTraces = new Map();
        this.traceRetentionMs = 3600000; // 1 hour
    }

    createTrace(metadata = {}) {
        const traceId = `trace_${Date.now()}_${this._generateRandomId()}`;

        this.activeTraces.set(traceId, {
            id: traceId,
            createdAt: Date.now(),
            metadata,
            events: []
        });

        return traceId;
    }

    recordEvent(traceId, component, event, data = {}) {
        const trace = this.activeTraces.get(traceId);
        if (!trace) return;

        trace.events.push({
            timestamp: Date.now(),
            component,
            event,
            data
        });
    }

    getTrace(traceId) {
        return this.activeTraces.get(traceId);
    }

    cleanup() {
        const cutoff = Date.now() - this.traceRetentionMs;
        for (const [traceId, trace] of this.activeTraces) {
            if (trace.createdAt < cutoff) {
                this.activeTraces.delete(traceId);
            }
        }
    }
}
```

#### 4. Alert Manager (`src/observability/alert-manager.js`)

**Responsibilities**:
- Evaluate alert rules against metrics
- Send alerts via Telegram or email
- Suppress duplicate alerts (debouncing)
- Track alert history

**Alert Rules**:
```javascript
const alertRules = [
    {
        name: 'HighErrorRate',
        condition: (metrics) => {
            const errorRate = metrics.calculateErrorRate('5m');
            return errorRate > 0.10; // 10% threshold
        },
        severity: 'critical',
        message: '🚨 High error rate detected: {errorRate}%',
        cooldownMinutes: 15
    },
    {
        name: 'ServerUnavailable',
        condition: (metrics) => {
            return metrics.getServerCircuitState() === 'OPEN';
        },
        severity: 'warning',
        message: '⚠️ Server {serverId} circuit breaker OPEN',
        cooldownMinutes: 5
    },
    {
        name: 'DeadLetterQueueGrowth',
        condition: (metrics) => {
            const queueSize = metrics.getGauge('dead_letter_queue_size');
            return queueSize > 100;
        },
        severity: 'warning',
        message: '📬 Dead letter queue size: {queueSize} messages',
        cooldownMinutes: 10
    },
    {
        name: 'HighLatency',
        condition: (metrics) => {
            const p95 = metrics.getHistogramPercentile('ssh_command_duration_seconds', 0.95);
            return p95 > 10; // 10 seconds
        },
        severity: 'info',
        message: '🐌 High SSH latency: P95 = {latency}s',
        cooldownMinutes: 30
    }
];
```

**Alert Evaluation Loop**:
```javascript
class AlertManager {
    constructor(metricsCollector, notificationChannel) {
        this.metrics = metricsCollector;
        this.notifications = notificationChannel;
        this.alertHistory = [];
        this.alertCooldowns = new Map();
    }

    async evaluateRules() {
        for (const rule of alertRules) {
            try {
                if (this._isInCooldown(rule.name)) continue;

                const triggered = rule.condition(this.metrics);

                if (triggered) {
                    await this._sendAlert(rule);
                    this._setCooldown(rule.name, rule.cooldownMinutes);
                }
            } catch (error) {
                console.error(`Alert rule ${rule.name} evaluation failed:`, error);
            }
        }
    }

    async _sendAlert(rule) {
        const alert = {
            timestamp: Date.now(),
            name: rule.name,
            severity: rule.severity,
            message: this._interpolateMessage(rule.message)
        };

        this.alertHistory.push(alert);

        await this.notifications.send({
            type: 'alert',
            title: `Alert: ${rule.name}`,
            message: alert.message,
            metadata: { severity: rule.severity }
        });
    }

    startEvaluation(intervalMs = 60000) {
        setInterval(() => this.evaluateRules(), intervalMs);
    }
}
```

### Existing Components to Modify

#### 1. `command-executor.js` Instrumentation

**Add metrics**:
```javascript
async _executeRemote(server, command, tmuxSession) {
    const traceId = this.traceManager.createTrace({
        server: server.id,
        command,
        tmuxSession
    });

    const startTime = Date.now();

    try {
        this.metrics.incrementCounter('ssh_commands_total', { server: server.id, status: 'attempted' });

        // Existing logic...
        const result = await ssh.execCommand(sshCommand);

        const duration = (Date.now() - startTime) / 1000;
        this.metrics.recordHistogram('ssh_command_duration_seconds', { server: server.id }, duration);
        this.metrics.incrementCounter('ssh_commands_total', { server: server.id, status: 'success' });

        this.traceManager.recordEvent(traceId, 'command-executor', 'success', { duration });

        return result;
    } catch (error) {
        this.metrics.incrementCounter('ssh_commands_total', { server: server.id, status: 'failed' });
        this.traceManager.recordEvent(traceId, 'command-executor', 'error', { error: error.message });
        throw error;
    }
}
```

#### 2. `notification-aggregator.js` Instrumentation

**Add metrics**:
```javascript
async _handleNotification(req, res) {
    const traceId = this.traceManager.createTrace({
        serverId: req.body.serverId,
        type: req.body.type
    });

    this.metrics.incrementCounter('notifications_received_total', { server: req.body.serverId });

    try {
        // Existing logic...
        await this.telegramChannel.send(notification, traceId);

        this.metrics.incrementCounter('notifications_sent_total', { status: 'success' });
        this.traceManager.recordEvent(traceId, 'notification-aggregator', 'sent');

        res.status(200).json({ success: true, traceId });
    } catch (error) {
        this.metrics.incrementCounter('notifications_sent_total', { status: 'failed' });
        this.traceManager.recordEvent(traceId, 'notification-aggregator', 'error', { error: error.message });
        res.status(500).json({ error: error.message, traceId });
    }
}
```

#### 3. `session-manager.js` Instrumentation

**Add metrics**:
```javascript
createSession({ serverId, project, metadata = {} }) {
    const startTime = Date.now();

    try {
        this.metrics.setGauge('sessions_active', { server: serverId }, this.getServerSessions(serverId).length + 1);

        // Existing logic...
        const session = this.db.prepare(/* ... */).run(session);

        const duration = (Date.now() - startTime) / 1000;
        this.metrics.recordHistogram('db_query_duration_seconds', { operation: 'create_session' }, duration);
        this.metrics.incrementCounter('db_queries_total', { operation: 'create_session', status: 'success' });

        return session;
    } catch (error) {
        this.metrics.incrementCounter('db_queries_total', { operation: 'create_session', status: 'failed' });
        throw error;
    }
}
```

### Database Schema Changes

#### New Table: `metric_snapshots`

**Optional**: For persistence of metrics across restarts

```sql
CREATE TABLE metric_snapshots (
    timestamp INTEGER PRIMARY KEY,
    snapshot TEXT NOT NULL  -- JSON serialized metrics
);

-- Retention: Keep only last 24 hours
CREATE INDEX idx_metric_timestamp ON metric_snapshots(timestamp);
```

### API Endpoint Changes

**New Endpoints**:

```javascript
// Health Dashboard
GET /dashboard              // Serve dashboard HTML
GET /api/metrics/snapshot   // Current metrics
GET /api/metrics/query      // Time-series query
GET /api/health/servers     // Server health status
GET /api/alerts/active      // Active alerts

// Admin Endpoints
POST /api/alerts/acknowledge  // Acknowledge alert
GET /api/deadletter/inspect   // Inspect DLQ
POST /api/deadletter/retry    // Manually retry message
```

---

## Implementation Details

### File Structure Changes

```
src/
├── observability/                 # New directory
│   ├── metrics-collector.js       # Time-series metrics storage
│   ├── health-dashboard.js        # HTTP dashboard server
│   ├── trace-manager.js           # Distributed tracing
│   ├── alert-manager.js           # Alert evaluation and routing
│   └── dashboard.html             # Dashboard frontend
├── remote/
│   └── command-executor.js        # Modified: Add metrics
├── hub/
│   ├── notification-aggregator.js # Modified: Add metrics
│   └── session-manager.js         # Modified: Add metrics
└── channels/telegram/
    └── telegram.js                # Modified: Add metrics
```

### Key Algorithms

#### Metrics Aggregation

**Rolling Window Aggregation**:
```javascript
class RollingWindow {
    constructor(windowSizeMs) {
        this.windowSize = windowSizeMs;
        this.buckets = [];
        this.bucketInterval = 60000; // 1 minute buckets
    }

    add(value) {
        const now = Date.now();
        const bucketKey = Math.floor(now / this.bucketInterval);

        // Find or create bucket
        let bucket = this.buckets.find(b => b.key === bucketKey);
        if (!bucket) {
            bucket = { key: bucketKey, values: [] };
            this.buckets.push(bucket);
        }

        bucket.values.push(value);

        // Remove old buckets
        const cutoff = now - this.windowSize;
        this.buckets = this.buckets.filter(b =>
            b.key * this.bucketInterval >= cutoff
        );
    }

    aggregate(fn) {
        const allValues = this.buckets.flatMap(b => b.values);
        return fn(allValues);
    }

    calculatePercentile(p) {
        const allValues = this.buckets.flatMap(b => b.values).sort((a, b) => a - b);
        const index = Math.ceil(allValues.length * p) - 1;
        return allValues[index] || 0;
    }
}
```

#### Alert Debouncing

**Prevent Alert Fatigue**:
```javascript
class AlertDebouncer {
    constructor(cooldownMs = 900000) { // 15 minutes default
        this.lastAlerted = new Map();
        this.cooldown = cooldownMs;
    }

    shouldAlert(ruleName) {
        const lastTime = this.lastAlerted.get(ruleName);
        if (!lastTime) return true;

        const elapsed = Date.now() - lastTime;
        return elapsed >= this.cooldown;
    }

    markAlerted(ruleName) {
        this.lastAlerted.set(ruleName, Date.now());
    }
}
```

### Testing Strategy

#### Unit Tests

**Metrics Collector**:
- Test counter increment
- Test gauge set
- Test histogram recording
- Test time-series query with time range
- Test retention cleanup

**Alert Manager**:
- Test alert rule evaluation
- Test cooldown enforcement
- Test alert history tracking
- Test notification sending

**Trace Manager**:
- Test trace ID generation
- Test event recording
- Test trace cleanup

#### Integration Tests

**Dashboard API**:
- Test `/api/metrics/snapshot` returns current metrics
- Test `/api/health/servers` returns correct server states
- Test `/api/alerts/active` returns active alerts
- Test dashboard HTML serves correctly

**Metrics Collection**:
- Test SSH command metrics recorded correctly
- Test notification metrics recorded correctly
- Test database metrics recorded correctly
- Test circuit breaker state metrics

#### End-to-End Tests

**Scenario: Full Notification Flow with Tracing**:
1. Send notification from remote server
2. Verify trace ID created
3. Verify metrics recorded for notification aggregator
4. Verify Telegram send metrics recorded
5. Query dashboard API for trace details
6. Verify all events present in trace

**Scenario: Alert Triggering**:
1. Simulate high error rate (>10%)
2. Verify alert evaluation detects condition
3. Verify alert sent via Telegram
4. Verify alert visible on dashboard
5. Verify cooldown prevents duplicate alerts

### Rollback Plan

**Phase 1: Disable Dashboard**
- Stop dashboard HTTP server
- Metrics collection continues
- Expected time: Immediate

**Phase 2: Disable Metrics Collection**
- Set `METRICS_ENABLED=false` environment variable
- Metrics calls become no-ops
- No performance impact
- Expected time: Immediate (no restart)

**Phase 3: Disable Alerts**
- Stop alert evaluation loop
- Alerts stop firing
- Expected time: Immediate

**Phase 4: Full Rollback**
- Remove observability code
- Redeploy previous version
- Expected time: 10 minutes

---

## Acceptance Criteria

### Functional Acceptance Criteria

#### 1. Dashboard Accessibility

**GIVEN** observability system is running
**WHEN** user navigates to `http://localhost:3002/dashboard`
**THEN** dashboard HTML page shall load successfully
**AND** display system health indicator (GREEN/YELLOW/RED)
**AND** show list of all configured servers

#### 2. Metrics Collection

**GIVEN** SSH command is executed successfully
**WHEN** metrics are queried via API
**THEN** `ssh_commands_total{status="success"}` counter shall increment
**AND** `ssh_command_duration_seconds` histogram shall record execution time
**AND** metrics shall be visible on dashboard within 5 seconds

#### 3. Alert Triggering

**GIVEN** error rate exceeds 10% over 5-minute window
**WHEN** alert evaluation runs
**THEN** alert shall be sent to administrator via Telegram
**AND** alert shall appear on dashboard active alerts panel
**AND** duplicate alert shall not fire within 15-minute cooldown period

#### 4. Distributed Tracing

**GIVEN** notification is sent from remote server
**WHEN** trace ID is created
**THEN** trace events shall be recorded for each component
**AND** trace details shall be queryable via API
**AND** dashboard shall display trace timeline

### Performance Benchmarks

**Metric 1: Metrics Collection Overhead**
- **Target**: <5% performance overhead
- **Measurement**: Compare SSH command execution time with and without metrics
- **Acceptance**: Overhead ≤5%

**Metric 2: Dashboard Response Time**
- **Target**: Dashboard API responds in <200ms
- **Measurement**: Measure `/api/metrics/snapshot` response time
- **Acceptance**: P95 ≤200ms

**Metric 3: Memory Usage**
- **Target**: Metrics storage uses <100MB RAM
- **Measurement**: Monitor process memory with metrics enabled
- **Acceptance**: Steady state ≤100MB

**Metric 4: Alert Latency**
- **Target**: Alerts fire within 60 seconds of condition
- **Measurement**: Measure time from threshold breach to alert
- **Acceptance**: Mean ≤60 seconds

### Quality Metrics

**Code Coverage**:
- **Target**: ≥80% line coverage for observability modules
- **Measurement**: Jest coverage report
- **Acceptance**: All critical paths covered

**Dashboard Usability**:
- **Target**: All key metrics visible without scrolling
- **Measurement**: Manual usability review
- **Acceptance**: Pass usability checklist

**Metric Accuracy**:
- **Target**: Metrics match actual operations with <1% error
- **Measurement**: Compare metrics to actual operation counts
- **Acceptance**: Error rate <1%

### Security Considerations

**Security Requirement 1: No Sensitive Data in Metrics**
- Metrics shall not contain SSH keys, tokens, passwords, or user message content
- Acceptance: Security scan passes

**Security Requirement 2: Dashboard Authentication**
- Dashboard shall require authentication before displaying metrics
- Acceptance: Unauthorized access returns 401

**Security Requirement 3: Admin-Only Endpoints**
- Alert acknowledgment and DLQ retry endpoints shall require admin role
- Acceptance: Non-admin access returns 403

---

## Dependencies

### External Library Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",     // Existing: HTTP server
    "pino": "^9.7.0"          // Existing: Logging
  },
  "devDependencies": {
    "chart.js": "^4.4.0"      // New: Dashboard charting (CDN)
  }
}
```

**Note**: Chart.js loaded via CDN, not bundled dependency.

### Internal Component Dependencies

1. **Metrics Collector** depends on:
   - Timer infrastructure for retention cleanup
   - Configuration for retention policy

2. **Health Dashboard** depends on:
   - `metrics-collector.js` for metrics data
   - `alert-manager.js` for alert status
   - Express for HTTP server

3. **Alert Manager** depends on:
   - `metrics-collector.js` for threshold evaluation
   - `telegram.js` for alert delivery
   - Configuration for alert rules

4. **Trace Manager** depends on:
   - UUID generation for trace IDs
   - Timer infrastructure for trace cleanup

### Infrastructure Requirements

**Node.js Version**:
- Minimum version: 14.0.0 (existing requirement)
- No change required

**Browser Compatibility**:
- Modern browsers with JavaScript enabled
- Chart.js compatible (Chrome 91+, Firefox 89+, Safari 15+)

**Network Requirements**:
- Dashboard port (default 3002) accessible
- No external dependencies for metrics

---

## Cross-SPEC Dependencies

**SPEC-RELIABILITY-001 (Error Recovery)**:
- Reliability metrics (retry count, circuit breaker state) consumed by dashboard
- Circuit breaker state changes trigger alerts
- Coordination Required: Standardize metric naming

**SPEC-PERFORMANCE-001 (Connection Pooling)**:
- Connection pool metrics (active connections, wait time) displayed on dashboard
- Pool saturation triggers alerts
- Coordination Required: Pool metrics API

**SPEC-UX-001 (Enhanced Feedback)**:
- User notifications include trace IDs for support debugging
- Error messages link to dashboard for status
- Coordination Required: Trace ID propagation

---

## Risk Assessment

### Technical Risks

**Risk 1: Metrics Storage Growth**
- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**: Enforce 60-minute retention, implement cleanup, monitor disk usage
- **Rollback Complexity**: Low (disable metrics collection)

**Risk 2: Dashboard Performance Under Load**
- **Probability**: Low
- **Impact**: Medium
- **Mitigation**: Implement caching, limit query complexity, use CDN for static assets
- **Rollback Complexity**: Low (stop dashboard server)

**Risk 3: Alert Fatigue**
- **Probability**: Medium
- **Impact**: Low
- **Mitigation**: Implement cooldowns, aggregate related alerts, provide mute functionality
- **Rollback Complexity**: Low (disable alerts)

### Operational Risks

**Risk 1: False Positive Alerts**
- **Probability**: Medium
- **Impact**: Low
- **Mitigation**: Tune thresholds based on production data, implement alert review process
- **Rollback Complexity**: N/A (configuration tuning)

**Risk 2: Dashboard Accessibility**
- **Probability**: Low
- **Impact**: Medium
- **Mitigation**: Ensure dashboard port accessible, add network diagnostics
- **Rollback Complexity**: N/A (network configuration)

---

## Implementation Phases

### Phase 1: Metrics Infrastructure (Week 1, 12 hours)

**Milestone**: Metrics collection operational across all components

**Tasks**:
1. Implement metrics collector (4 hours)
2. Instrument command-executor.js (2 hours)
3. Instrument notification-aggregator.js (2 hours)
4. Instrument session-manager.js (2 hours)
5. Add unit tests (2 hours)

**Testing Checkpoints**:
- ✅ Metrics recorded for all operations
- ✅ Time-series data stored correctly
- ✅ Retention cleanup working

**Deliverables**:
- `src/observability/metrics-collector.js`
- Instrumented components
- Unit test suite

---

### Phase 2: Dashboard and Alerts (Week 2, 15 hours)

**Milestone**: Dashboard accessible with real-time metrics and alerts functional

**Tasks**:
1. Implement health dashboard (6 hours)
2. Create dashboard HTML/CSS/JS (4 hours)
3. Implement alert manager (3 hours)
4. Add API endpoints (2 hours)

**Testing Checkpoints**:
- ✅ Dashboard loads and displays metrics
- ✅ Charts update in real-time
- ✅ Alerts trigger correctly

**Deliverables**:
- `src/observability/health-dashboard.js`
- `src/observability/dashboard.html`
- `src/observability/alert-manager.js`

---

### Phase 3: Tracing and Production (Week 2, 8 hours)

**Milestone**: Distributed tracing functional and system deployed to production

**Tasks**:
1. Implement trace manager (3 hours)
2. Integration testing (3 hours)
3. Production deployment (2 hours)

**Testing Checkpoints**:
- ✅ Traces recorded correctly
- ✅ E2E tests pass
- ✅ Production metrics visible

**Deliverables**:
- `src/observability/trace-manager.js`
- E2E test suite
- Production deployment

---

## Git Strategy

### Branch Naming Convention

- `feature/SPEC-MONITORING-001-metrics-collector`
- `feature/SPEC-MONITORING-001-health-dashboard`
- `feature/SPEC-MONITORING-001-alerts`
- `feature/SPEC-MONITORING-001-tracing`

### Commit Message Format

```
feat(SPEC-MONITORING-001): Add metrics collector with time-series storage

- Implement counter, gauge, histogram metrics
- Add 60-minute rolling window retention
- Add query interface for dashboard

Closes #MONITORING-001-METRICS
```

### PR Review Checklist

- [ ] Metrics collection overhead <5%
- [ ] Dashboard loads in <2 seconds
- [ ] No sensitive data in metrics
- [ ] Alert thresholds documented
- [ ] Unit tests ≥80% coverage

### Merge Strategy

Squash and merge to integration branch `feature/SPEC-MONITORING-001-integration`

---

**End of SPEC-MONITORING-001**

**Next Steps**:
1. Review and approve SPEC
2. Coordinate with SPEC-RELIABILITY-001 for metric naming
3. Begin Phase 1 implementation

**Estimated Start Date**: 2026-01-20
**Estimated Completion Date**: 2026-02-03
**Status**: Ready for Review
