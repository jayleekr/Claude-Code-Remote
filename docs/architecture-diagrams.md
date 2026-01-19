# 아키텍처 다이어그램 (Architecture Diagrams)

Claude Code Remote 시스템의 전체 아키텍처를 시각적으로 설명하는 문서입니다.

## 목차

1. [시스템 전체 아키텍처](#1-시스템-전체-아키텍처)
2. [데이터 플로우](#2-데이터-플로우)
3. [컴포넌트 상세](#3-컴포넌트-상세)
4. [네트워크 아키텍처](#4-네트워크-아키텍처)
5. [보안 경계](#5-보안-경계)
6. [배포 아키텍처](#6-배포-아키텍처)

---

## 1. 시스템 전체 아키텍처

### 1.1 High-Level Overview

```mermaid
graph TB
    subgraph External["외부 서비스"]
        TG[Telegram Bot API<br/>api.telegram.org]
        NG[ngrok Tunnel<br/>*.ngrok-free.dev]
    end

    subgraph CentralHub["Central Hub (Your Machine)"]
        direction TB
        AGG[Notification Aggregator<br/>:3001]
        WH[Webhook Server<br/>:3000]
        SR[Server Registry<br/>servers.json]
        SM[Session Manager<br/>SQLite WAL]
        CE[Command Executor<br/>SSH Pool]
        TC[Telegram Channel]

        AGG <--> SR
        AGG <--> SM
        AGG --> TC
        WH <--> SM
        WH --> CE
        WH --> TC
        CE <--> SR
    end

    subgraph RemoteServers["Remote Servers"]
        direction LR
        RS1[Server KR4<br/>builder-kr-4]
        RS2[Server AWS1<br/>aws.example.com]
        RS3[Server LOCAL<br/>localhost]

        RS1 --> HOOK1[Claude Hook]
        RS2 --> HOOK2[Claude Hook]
        RS3 --> HOOK3[Claude Hook]
    end

    User((User)) <-->|Commands| TG
    TG <-->|Webhook| NG
    NG <-->|HTTPS| WH

    HOOK1 -.->|HTTP POST<br/>Notification| AGG
    HOOK2 -.->|HTTP POST<br/>Notification| AGG
    HOOK3 -.->|HTTP POST<br/>Notification| AGG

    TC -->|Send Message| TG

    CE ==>|SSH + tmux<br/>send-keys| RS1
    CE ==>|SSH + tmux<br/>send-keys| RS2
    CE ==>|Local tmux<br/>send-keys| RS3

    style CentralHub fill:#e1f5ff
    style RemoteServers fill:#fff4e6
    style External fill:#f0f0f0
```

### 1.2 주요 컴포넌트

| 컴포넌트 | 역할 | 포트/프로토콜 |
|---------|------|--------------|
| **Telegram Bot API** | 사용자 인터페이스 (명령/알림) | HTTPS (443) |
| **ngrok Tunnel** | 공개 웹훅 URL 제공 | HTTPS → HTTP |
| **Notification Aggregator** | 원격 서버 알림 수신 | HTTP (3001) |
| **Webhook Server** | Telegram 명령 처리 | HTTP (3000) |
| **Server Registry** | 서버 목록 및 SSH 설정 | - |
| **Session Manager** | 세션 생명주기 관리 | SQLite WAL |
| **Command Executor** | SSH 연결 풀 및 명령 실행 | SSH (22) |
| **Telegram Channel** | Telegram API 통신 | HTTPS (443) |
| **Claude Hook** | Claude Code 이벤트 감지 | - |

---

## 2. 데이터 플로우

### 2.1 알림 플로우 (Remote Server → User)

```mermaid
sequenceDiagram
    autonumber
    participant Claude as Claude Code<br/>(Remote Server)
    participant Hook as Claude Hook<br/>Notifier
    participant Agg as Notification<br/>Aggregator
    participant SM as Session<br/>Manager
    participant TG as Telegram<br/>Channel
    participant Bot as Telegram<br/>Bot API
    participant User as User

    Claude->>Hook: Task completed event
    Hook->>Hook: Extract conversation<br/>(tmux monitor)
    Hook->>Agg: POST /notify<br/>{serverId, project, metadata}

    Agg->>Agg: Authenticate<br/>(Shared Secret)
    Agg->>SM: Create/Update session
    SM-->>Agg: Session ID + Token<br/>(e.g., kr4:1, ABC12345)

    Agg->>TG: Send notification
    TG->>TG: Split message<br/>(4096 char limit)
    TG->>Bot: sendMessage API
    Bot->>User: Telegram notification

    Note over User: ✅ [KR4] Claude Task Completed<br/>Project: my-project<br/>Session: kr4:1<br/><br/>/cmd kr4:1 <command>
```

### 2.2 명령 플로우 (User → Remote Server)

```mermaid
sequenceDiagram
    autonumber
    participant User as User
    participant Bot as Telegram<br/>Bot API
    participant WH as Webhook<br/>Server
    participant SM as Session<br/>Manager
    participant SR as Server<br/>Registry
    participant CE as Command<br/>Executor
    participant SSH as SSH<br/>Connection
    participant Tmux as tmux Session<br/>(Remote)

    User->>Bot: /cmd kr4:1 pwd
    Bot->>WH: Webhook POST<br/>/webhook

    WH->>WH: Parse command<br/>(serverId: kr4, number: 1)
    WH->>SM: Find session by<br/>serverId + number
    SM-->>WH: Session data<br/>(tmuxSession, project)

    WH->>SR: Get server config<br/>(kr4)
    SR-->>WH: SSH config<br/>(hostname, user, keyPath)

    WH->>CE: Execute command<br/>(serverId, command, tmux)

    alt Remote Server
        CE->>SSH: Get/Create SSH<br/>connection (pool)
        SSH-->>CE: SSH client
        CE->>SSH: execCommand<br/>tmux send-keys 'pwd' Enter
        SSH->>Tmux: Execute in tmux
    else Local Server
        CE->>Tmux: Direct tmux<br/>send-keys
    end

    CE-->>WH: Success
    WH->>Bot: Reply message
    Bot->>User: ✅ Command sent<br/>to kr4:1
```

### 2.3 세션 생명주기

```mermaid
stateDiagram-v2
    [*] --> Created: Notification received

    Created --> Active: Session ID assigned<br/>(e.g., kr4:1)

    Active --> Active: Commands executed<br/>within 24h
    Active --> Expired: 24 hours elapsed
    Active --> Replaced: New session created<br/>(becomes kr4:2)

    Replaced --> Active: Renumbered<br/>(kr4:1 → kr4:2)

    Expired --> Deleted: Cleanup job
    Deleted --> [*]

    note right of Created: Token generated<br/>(e.g., ABC12345)

    note right of Active: Available for commands<br/>/cmd kr4:1 command

    note right of Expired: Session not usable<br/>Error: Session expired
```

---

## 3. 컴포넌트 상세

### 3.1 Central Hub 내부 구조

```mermaid
graph TB
    subgraph CentralHub["Central Hub Process"]
        subgraph AggProcess["Aggregator Process (3001)"]
            AggApp[Express App]
            AggRoute["/notify Route"]
            AggHealth["/health Route"]
            AggSessions["/sessions Route"]
        end

        subgraph WHProcess["Webhook Process (3000)"]
            WHApp[Express App]
            WHWebhook["/webhook Route"]
            WHHealth["/health Route"]
        end

        subgraph SharedComponents["Shared Components"]
            SR[Server Registry<br/>config/servers.json]
            SM[Session Manager<br/>data/sessions.db]
            TC[Telegram Channel]
            CE[Command Executor<br/>SSH Pool: Map<serverId, SSH>]
        end

        AggApp --> AggRoute
        AggApp --> AggHealth
        AggApp --> AggSessions

        AggRoute --> SR
        AggRoute --> SM
        AggRoute --> TC

        WHApp --> WHWebhook
        WHApp --> WHHealth

        WHWebhook --> SM
        WHWebhook --> SR
        WHWebhook --> CE
        WHWebhook --> TC

        CE --> SSH1[SSH: kr4]
        CE --> SSH2[SSH: aws1]
        CE --> LOCAL[Local: exec]
    end

    ExtTelegram[Telegram API] <--> TC
    ExtRemote1[Remote: KR4] <--> AggRoute
    ExtRemote2[Remote: AWS1] <--> AggRoute

    SSH1 -.SSH.-> ExtRemote1
    SSH2 -.SSH.-> ExtRemote2

    style AggProcess fill:#e3f2fd
    style WHProcess fill:#fff3e0
    style SharedComponents fill:#f3e5f5
```

### 3.2 Session Manager (SQLite WAL)

```mermaid
graph LR
    subgraph SessionManager["Session Manager"]
        API[Public API]
        DB[(SQLite Database<br/>WAL Mode)]
        Cache[In-Memory Cache<br/>Optional]

        API --> CreateSession[createSession]
        API --> FindSession[findSession]
        API --> GetSessions[getServerSessions]
        API --> Cleanup[cleanExpiredSessions]

        CreateSession --> DB
        FindSession --> Cache
        Cache -.Cache Miss.-> DB
        GetSessions --> DB
        Cleanup --> DB
    end

    subgraph DBFiles["Database Files"]
        MainDB[sessions.db<br/>Main Database]
        WAL[sessions.db-wal<br/>Write-Ahead Log]
        SHM[sessions.db-shm<br/>Shared Memory]
    end

    DB --> MainDB
    DB --> WAL
    DB --> SHM

    subgraph Schema["Database Schema"]
        Table["sessions Table<br/>------------------<br/>id (UUID)<br/>server_id (TEXT)<br/>server_number (INTEGER)<br/>token (TEXT)<br/>project (TEXT)<br/>tmux_session (TEXT)<br/>created_at (INTEGER)<br/>expires_at (INTEGER)<br/>metadata (JSON)"]
    end

    MainDB -.Schema.-> Table

    style SessionManager fill:#e8f5e9
    style DBFiles fill:#fff9c4
    style Schema fill:#fce4ec
```

### 3.3 Command Executor (SSH Pool)

```mermaid
graph TB
    subgraph CommandExecutor["Command Executor"]
        Execute[execute<br/>serverId, command, tmux]

        Execute --> TypeCheck{Server Type?}

        TypeCheck -->|local| ExecLocal[executeLocal<br/>Direct tmux]
        TypeCheck -->|remote| ExecRemote[executeRemote<br/>SSH + tmux]

        ExecRemote --> GetSSH[getSSHConnection]

        GetSSH --> PoolCheck{Pool has<br/>connection?}

        PoolCheck -->|Yes| HealthCheck[Health Check<br/>echo ping]
        PoolCheck -->|No| CreateSSH[Create New SSH<br/>Connection]

        HealthCheck -->|OK| ReuseSSH[Reuse Connection]
        HealthCheck -->|Failed| RemoveConn[Remove from Pool]
        RemoveConn --> CreateSSH

        CreateSSH --> ConnectSSH[ssh.connect<br/>host, user, keyPath]
        ConnectSSH --> AddPool[Add to Pool]
        AddPool --> ReuseSSH

        ReuseSSH --> SendKeys[ssh.execCommand<br/>tmux send-keys]

        ExecLocal --> SendKeysLocal[execSync<br/>tmux send-keys]
    end

    subgraph ConnectionPool["SSH Connection Pool"]
        PoolMap["Map<serverId, SSHClient>"]
        Conn1["kr4 → SSHClient"]
        Conn2["aws1 → SSHClient"]

        PoolMap --> Conn1
        PoolMap --> Conn2
    end

    GetSSH <--> PoolMap

    style CommandExecutor fill:#e1bee7
    style ConnectionPool fill:#c5cae9
```

### 3.4 Server Registry

```mermaid
graph TB
    subgraph ServerRegistry["Server Registry"]
        LoadConfig[Load config/servers.json]

        LoadConfig --> ParseServers[Parse Server List]

        ParseServers --> CentralConfig[Central Config<br/>webhookPort: 3000<br/>notificationPort: 3001<br/>ngrokEnabled: true<br/>sharedSecret: xxx]

        ParseServers --> ServerList[Server List]

        ServerList --> Server1["Server: LOCAL<br/>type: local<br/>hostname: localhost"]
        ServerList --> Server2["Server: KR4<br/>type: remote<br/>hostname: builder-kr-4.kr.sonatus.com<br/>ssh: {user, port, keyPath}"]
        ServerList --> Server3["Server: AWS1<br/>type: remote<br/>hostname: aws.example.com<br/>ssh: {user, port, keyPath}"]

        API[Public API]
        API --> GetServer[getServer<br/>serverId]
        API --> GetAll[getAllServers]
        API --> HasServer[hasServer<br/>serverId]
        API --> UpdateStatus[updateServerStatus<br/>serverId, status]

        GetServer --> ServerList
        GetAll --> ServerList
        HasServer --> ServerList
        UpdateStatus --> StatusMap[Status Map<br/>serverId → status]
    end

    style ServerRegistry fill:#fff9c4
    style CentralConfig fill:#c8e6c9
    style Server1 fill:#b3e5fc
    style Server2 fill:#b3e5fc
    style Server3 fill:#b3e5fc
```

---

## 4. 네트워크 아키텍처

### 4.1 포트 및 프로토콜

```mermaid
graph TB
    subgraph Internet["Internet"]
        TelegramAPI[Telegram Bot API<br/>api.telegram.org:443<br/>HTTPS]
        NgrokCloud[ngrok Cloud<br/>*.ngrok-free.dev:443<br/>HTTPS]
    end

    subgraph LocalNetwork["Local Network (Central Hub)"]
        NgrokClient[ngrok Client<br/>localhost:4040<br/>Control API]
        WebhookServer[Webhook Server<br/>0.0.0.0:3000<br/>HTTP]
        NotificationAgg[Notification Aggregator<br/>0.0.0.0:3001<br/>HTTP]
    end

    subgraph RemoteNetwork["Remote Networks"]
        RemoteServer1[Remote Server KR4<br/>builder-kr-4:22<br/>SSH]
        RemoteServer2[Remote Server AWS1<br/>aws.example.com:22<br/>SSH]
    end

    User((User<br/>Telegram App)) <-->|HTTPS| TelegramAPI
    TelegramAPI <-->|Webhook<br/>HTTPS| NgrokCloud
    NgrokCloud <-->|Tunnel<br/>HTTPS| NgrokClient
    NgrokClient <-->|HTTP| WebhookServer

    RemoteServer1 -.->|HTTP POST<br/>:3001| NotificationAgg
    RemoteServer2 -.->|HTTP POST<br/>:3001| NotificationAgg

    WebhookServer ==>|SSH<br/>:22| RemoteServer1
    WebhookServer ==>|SSH<br/>:22| RemoteServer2

    NotificationAgg -->|HTTPS<br/>:443| TelegramAPI

    style Internet fill:#ffebee
    style LocalNetwork fill:#e8f5e9
    style RemoteNetwork fill:#e3f2fd
```

### 4.2 방화벽 규칙

```mermaid
graph TB
    subgraph CentralHub["Central Hub Firewall"]
        direction TB
        ALLOW1[✅ ALLOW<br/>0.0.0.0:3001<br/>← Remote Servers<br/>HTTP Inbound]
        ALLOW2[✅ ALLOW<br/>127.0.0.1:3000<br/>← ngrok Client<br/>HTTP Loopback]
        ALLOW3[✅ ALLOW<br/>0.0.0.0:*<br/>→ Telegram API<br/>HTTPS Outbound]
        ALLOW4[✅ ALLOW<br/>0.0.0.0:22<br/>→ Remote Servers<br/>SSH Outbound]

        DENY1[❌ DENY<br/>0.0.0.0:3000<br/>External Access]
    end

    subgraph RemoteServer["Remote Server Firewall"]
        direction TB
        RALLOW1[✅ ALLOW<br/>0.0.0.0:22<br/>← Central Hub<br/>SSH Inbound]
        RALLOW2[✅ ALLOW<br/>0.0.0.0:*<br/>→ Central Hub:3001<br/>HTTP Outbound]

        RDENY1[❌ DENY<br/>Other Inbound]
    end

    style CentralHub fill:#e8f5e9
    style RemoteServer fill:#fff3e0
    style ALLOW1 fill:#c8e6c9
    style ALLOW2 fill:#c8e6c9
    style ALLOW3 fill:#c8e6c9
    style ALLOW4 fill:#c8e6c9
    style DENY1 fill:#ffcdd2
    style RALLOW1 fill:#c8e6c9
    style RALLOW2 fill:#c8e6c9
    style RDENY1 fill:#ffcdd2
```

---

## 5. 보안 경계

### 5.1 인증 및 인가

```mermaid
graph TB
    subgraph TelegramAuth["Telegram Authentication"]
        TUser[User] -->|Telegram App| TBot[Telegram Bot]
        TBot -->|Bot Token<br/>Validation| TAPI[Telegram API]
        TAPI -.->|Webhook| Central
    end

    subgraph CentralAuth["Central Hub Authentication"]
        Central[Webhook Server]
        Central -->|Verify| WebhookSig[Webhook Signature<br/>X-Telegram-Bot-Api-Secret-Token]
    end

    subgraph RemoteAuth["Remote Server Authentication"]
        Remote[Remote Server] -->|HTTP POST<br/>X-Shared-Secret| Aggregator[Notification Aggregator]
        Aggregator -->|Validate| SharedSecret[Shared Secret<br/>64-char hex]
    end

    subgraph SSHAuth["SSH Authentication"]
        CmdExecutor[Command Executor] -->|Public Key| SSHServer[SSH Server<br/>Remote]
        SSHServer -->|Verify| AuthorizedKeys[~/.ssh/authorized_keys]
    end

    style TelegramAuth fill:#e3f2fd
    style CentralAuth fill:#f3e5f5
    style RemoteAuth fill:#fff9c4
    style SSHAuth fill:#c8e6c9
```

### 5.2 보안 계층

```mermaid
graph TB
    subgraph Layer1["Layer 1: Transport Security"]
        HTTPS1[HTTPS<br/>User ↔ Telegram]
        HTTPS2[HTTPS<br/>Telegram ↔ ngrok]
        SSH1[SSH<br/>Central ↔ Remote]
    end

    subgraph Layer2["Layer 2: Application Authentication"]
        BotToken[Telegram Bot Token<br/>TELEGRAM_BOT_TOKEN]
        SharedSecret[Shared Secret<br/>SHARED_SECRET]
        SSHKey[SSH Public Key<br/>~/.ssh/id_ed25519.pub]
    end

    subgraph Layer3["Layer 3: Session Management"]
        SessionToken[Session Token<br/>8-char alphanumeric]
        SessionExpiry[24-hour Expiration]
        SessionDB[SQLite WAL<br/>Encrypted at rest]
    end

    subgraph Layer4["Layer 4: Network Isolation"]
        Firewall[Firewall Rules<br/>ufw/iptables]
        PrivateIP[Private IP Ranges<br/>172.x.x.x]
        RateLimit[Rate Limiting<br/>10 req/s]
    end

    Layer1 --> Layer2
    Layer2 --> Layer3
    Layer3 --> Layer4

    style Layer1 fill:#ffebee
    style Layer2 fill:#fff3e0
    style Layer3 fill:#e8f5e9
    style Layer4 fill:#e3f2fd
```

---

## 6. 배포 아키텍처

### 6.1 단일 Central Hub + 다중 Remote Servers

```mermaid
graph TB
    subgraph CentralLocation["Central Location (e.g., Office)"]
        CentralHub[Central Hub<br/>MacBook Pro<br/>172.24.12.11]

        CentralHub --> Agg[Aggregator :3001]
        CentralHub --> WH[Webhook :3000]
        CentralHub --> Ngrok[ngrok Tunnel]
        CentralHub --> DB[(sessions.db)]
    end

    subgraph Cloud1["AWS (us-east-1)"]
        AWS1[EC2 Instance<br/>aws-east-1<br/>10.0.1.10]
        AWS1 --> Claude1[Claude Code]
    end

    subgraph Cloud2["AWS (ap-northeast-2)"]
        AWS2[EC2 Instance<br/>aws-kr-1<br/>10.0.2.10]
        AWS2 --> Claude2[Claude Code]
    end

    subgraph OnPrem["On-Premise (Korea)"]
        Builder[Builder Server<br/>builder-kr-4<br/>172.16.1.100]
        Builder --> Claude3[Claude Code]
    end

    subgraph Local["Local (Same Machine)"]
        LocalServer[Local Process<br/>localhost]
        LocalServer --> Claude4[Claude Code]
    end

    Internet((Internet))

    Internet <--> Ngrok

    Claude1 -.HTTP POST.-> Agg
    Claude2 -.HTTP POST.-> Agg
    Claude3 -.HTTP POST.-> Agg
    Claude4 -.HTTP POST.-> Agg

    WH ==>|SSH| AWS1
    WH ==>|SSH| AWS2
    WH ==>|SSH| Builder
    WH ==>|Local| LocalServer

    style CentralLocation fill:#e8f5e9
    style Cloud1 fill:#fff3e0
    style Cloud2 fill:#fff3e0
    style OnPrem fill:#e3f2fd
    style Local fill:#f3e5f5
```

### 6.2 확장 시나리오 (다중 Central Hub)

```mermaid
graph TB
    subgraph Internet["Internet"]
        TelegramAPI[Telegram Bot API]
    end

    subgraph Hub1["Central Hub 1 (Primary)<br/>Office Network"]
        H1[Hub Process]
        H1Servers[Servers: kr4, kr5, local]
    end

    subgraph Hub2["Central Hub 2 (Secondary)<br/>AWS Network"]
        H2[Hub Process]
        H2Servers[Servers: aws1, aws2, aws3]
    end

    subgraph Hub3["Central Hub 3 (Tertiary)<br/>GCP Network"]
        H3[Hub Process]
        H3Servers[Servers: gcp1, gcp2]
    end

    LoadBalancer[Telegram Bot<br/>Shared Chat]

    TelegramAPI <--> LoadBalancer

    LoadBalancer <--> H1
    LoadBalancer <--> H2
    LoadBalancer <--> H3

    H1 <--> H1Servers
    H2 <--> H2Servers
    H3 <--> H3Servers

    Note1[각 Hub는 독립적으로<br/>서버 관리]
    Note2[Telegram 명령은<br/>serverId로 라우팅]

    style Hub1 fill:#e8f5e9
    style Hub2 fill:#fff3e0
    style Hub3 fill:#e3f2fd
```

### 6.3 HA (High Availability) 구성

```mermaid
graph TB
    subgraph Primary["Primary Central Hub"]
        P1[Aggregator :3001]
        P2[Webhook :3000]
        P3[(sessions.db<br/>Primary)]

        P1 <--> P3
        P2 <--> P3
    end

    subgraph Secondary["Secondary Central Hub (Standby)"]
        S1[Aggregator :3001]
        S2[Webhook :3000]
        S3[(sessions.db<br/>Replica)]

        S1 <--> S3
        S2 <--> S3
    end

    subgraph Shared["Shared Components"]
        VIP[Virtual IP<br/>172.24.12.100]
        SharedSecret[Shared Secret<br/>Synced via KMS]
    end

    Keepalived[Keepalived<br/>VRRP Protocol]

    Primary -.Health Check.-> Keepalived
    Secondary -.Health Check.-> Keepalived
    Keepalived -->|Assign| VIP

    P3 -.SQLite Replication<br/>Litestream.-> S3

    RemoteServers[Remote Servers] -->|POST to VIP| VIP
    VIP -->|Active| P1
    VIP -.Failover.-> S1

    style Primary fill:#c8e6c9
    style Secondary fill:#ffecb3
    style Shared fill:#e1bee7
```

---

## 7. 기술 스택

```mermaid
graph TB
    subgraph Frontend["User Interface"]
        TelegramApp[Telegram Mobile App<br/>iOS/Android]
    end

    subgraph ExternalServices["External Services"]
        TelegramAPI[Telegram Bot API<br/>REST API]
        Ngrok[ngrok Tunnel Service<br/>HTTP Tunnel]
    end

    subgraph Backend["Backend (Node.js)"]
        Express[Express.js<br/>Web Framework]
        Axios[Axios<br/>HTTP Client]
        NodeSSH[node-ssh<br/>SSH2 Client]
        BetterSQLite[better-sqlite3<br/>SQLite Driver]
    end

    subgraph Storage["Storage"]
        SQLite[(SQLite 3<br/>WAL Mode)]
        JSON[JSON Files<br/>servers.json]
    end

    subgraph OS["Operating System"]
        Tmux[tmux<br/>Terminal Multiplexer]
        OpenSSH[OpenSSH<br/>SSH Client/Server]
        Bash[Bash Shell]
    end

    subgraph AI["AI Platform"]
        ClaudeCode[Claude Code<br/>Anthropic CLI]
    end

    TelegramApp --> TelegramAPI
    TelegramAPI --> Ngrok
    Ngrok --> Express

    Express --> Axios
    Express --> NodeSSH
    Express --> BetterSQLite

    BetterSQLite --> SQLite
    Express --> JSON

    NodeSSH --> OpenSSH
    Express --> Tmux

    Tmux --> ClaudeCode
    ClaudeCode --> Bash

    style Frontend fill:#e3f2fd
    style ExternalServices fill:#fff9c4
    style Backend fill:#c8e6c9
    style Storage fill:#ffecb3
    style OS fill:#e1bee7
    style AI fill:#f8bbd0
```

---

## 8. 성능 및 확장성

### 8.1 처리량 (Throughput)

```mermaid
graph LR
    subgraph Metrics["Performance Metrics"]
        M1[알림 처리<br/>< 2초<br/>Remote → Telegram]
        M2[명령 실행<br/>< 5초<br/>Telegram → Remote]
        M3[세션 조회<br/>< 100ms<br/>SQLite WAL]
        M4[SSH 연결<br/>< 1초<br/>Connection Pool]
    end

    subgraph Limits["Current Limits"]
        L1[동시 서버<br/>5+ tested<br/>20+ supported]
        L2[활성 세션<br/>100+ sessions<br/>per hub]
        L3[SSH 풀<br/>10 connections<br/>per server]
        L4[DB 크기<br/>< 100MB<br/>10K sessions]
    end

    subgraph Bottlenecks["Potential Bottlenecks"]
        B1[Telegram API<br/>Rate Limit<br/>30 msg/sec]
        B2[ngrok Free<br/>40 conn/min<br/>Upgrade needed]
        B3[SQLite WAL<br/>1000 writes/sec<br/>Checkpoint tuning]
        B4[SSH Latency<br/>Network dependent<br/>Use multiplexing]
    end

    style Metrics fill:#c8e6c9
    style Limits fill:#fff9c4
    style Bottlenecks fill:#ffccbc
```

### 8.2 확장 전략

```mermaid
graph TB
    subgraph Vertical["Vertical Scaling (단일 Hub)"]
        V1[더 많은 메모리<br/>8GB → 16GB]
        V2[더 빠른 CPU<br/>멀티코어]
        V3[SSD 스토리지<br/>DB I/O 개선]
        V4[네트워크 대역폭<br/>1Gbps+]
    end

    subgraph Horizontal["Horizontal Scaling (다중 Hub)"]
        H1[지역별 Hub<br/>Asia, US, EU]
        H2[기능별 Hub<br/>Dev, Staging, Prod]
        H3[로드 밸런싱<br/>Round-robin]
        H4[독립 DB<br/>Hub별 sessions.db]
    end

    subgraph Optimization["Optimization"]
        O1[Connection Pooling<br/>SSH 재사용]
        O2[Message Batching<br/>1분 내 통합]
        O3[Caching<br/>세션 메모리 캐시]
        O4[Compression<br/>SSH/HTTP 압축]
    end

    Current[Current: 5 servers] --> Vertical
    Vertical -->|Max: 20 servers| Horizontal
    Horizontal -->|100+ servers| Optimization

    style Vertical fill:#e8f5e9
    style Horizontal fill:#fff3e0
    style Optimization fill:#e3f2fd
```

---

## 부록: Mermaid 다이어그램 렌더링

### GitHub에서 보기
이 문서의 Mermaid 다이어그램은 GitHub에서 자동으로 렌더링됩니다.

### 로컬에서 보기
- **VS Code**: Mermaid Preview Extension 설치
- **IntelliJ/WebStorm**: 기본 지원 (Markdown 미리보기)
- **CLI**: `mmdc` (mermaid-cli) 사용

```bash
# mermaid-cli 설치
npm install -g @mermaid-js/mermaid-cli

# PNG로 변환
mmdc -i architecture-diagrams.md -o architecture-diagrams.png
```

### 온라인 에디터
- [Mermaid Live Editor](https://mermaid.live/)
- 복사/붙여넣기로 실시간 편집 가능

---

**문서 버전**: 1.0.0
**최종 업데이트**: 2026-01-19
**작성자**: Claude Code Remote Team
