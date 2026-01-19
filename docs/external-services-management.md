# 외부 서비스 관리 가이드 (External Services Management Guide)

Claude Code Remote 시스템의 외부 서비스 통합, 설정, 문제 해결 및 최적화에 대한 포괄적인 가이드입니다.

## 목차

1. [Telegram Bot API](#1-telegram-bot-api)
2. [SSH 연결 관리](#2-ssh-연결-관리)
3. [HTTP 통신 (Central Hub)](#3-http-통신-central-hub)
4. [ngrok 터널 관리](#4-ngrok-터널-관리)
5. [보안 강화](#5-보안-강화)
6. [모니터링 및 로깅](#6-모니터링-및-로깅)
7. [장애 상황별 복구 절차](#7-장애-상황별-복구-절차)
8. [성능 최적화](#8-성능-최적화)

---

## 1. Telegram Bot API

### 1.1 설정 및 초기화

**파일**: `src/channels/telegram/telegram.js`

**필수 환경 변수**:
```bash
TELEGRAM_BOT_TOKEN=your-bot-token-here
TELEGRAM_CHAT_ID=your-chat-id-here
# 선택: 그룹 채팅 사용 시
TELEGRAM_GROUP_ID=your-group-id-here
```

**Telegram Bot 생성 방법**:
1. Telegram에서 [@BotFather](https://t.me/botfather) 찾기
2. `/newbot` 명령으로 새 봇 생성
3. 봇 이름과 username 설정
4. Bot Token 복사 → `.env`의 `TELEGRAM_BOT_TOKEN`에 입력

**Chat ID 확인 방법**:
```bash
# 1. 봇에게 메시지 보내기 (아무 메시지나)
# 2. 다음 API 호출로 Chat ID 확인
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates"

# Response에서 "chat":{"id": 123456789} 부분 찾기
```

### 1.2 주요 기능

#### 메시지 자동 분할 (4096자 제한)
```javascript
/**
 * Telegram은 메시지 최대 4096자 제한
 * 자동으로 줄바꿈 기준으로 분할하여 순차 전송
 */
_splitMessage(text, maxLength = 4090) {
  // 줄바꿈 우선 분할 → 가독성 유지
  // 단일 라인이 너무 길면 강제 분할
  // 각 청크에 "Part 1/3" 표시 추가
}
```

#### IPv4 강제 모드
```javascript
// 네트워크 문제 시 IPv4 강제 사용
_getNetworkOptions() {
  if (this.config.forceIPv4) {
    return { family: 4 };
  }
  return {};
}
```

**.env 설정**:
```bash
# IPv6 문제가 있는 경우 활성화
TELEGRAM_FORCE_IPV4=true
```

### 1.3 문제 해결

#### 문제 1: "Unauthorized" 에러
**원인**: Bot Token 오류

**해결**:
```bash
# 1. Bot Token 확인
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# 2. 유효한 응답 확인
{
  "ok": true,
  "result": {
    "id": 123456789,
    "is_bot": true,
    "username": "your_bot_name"
  }
}

# 3. 실패 시 BotFather에서 토큰 재생성
```

#### 문제 2: 메시지가 전송되지 않음
**원인**: Chat ID 불일치

**해결**:
```bash
# 1. 최근 업데이트 확인
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates"

# 2. 올바른 Chat ID 확인 및 .env 업데이트
TELEGRAM_CHAT_ID=올바른_chat_id

# 3. 서비스 재시작
./scripts/stop-all.sh
./scripts/start-all.sh
```

#### 문제 3: 네트워크 타임아웃
**원인**: IPv6 문제 또는 방화벽

**해결**:
```bash
# 1. IPv4 강제 모드 활성화
echo "TELEGRAM_FORCE_IPV4=true" >> .env

# 2. 방화벽에서 Telegram API 허용
# IP: 149.154.160.0/20 (Telegram 서버 대역)

# 3. 프록시 사용 (중국 등 차단 국가)
# .env에 추가:
HTTPS_PROXY=http://proxy.example.com:8080
```

#### 문제 4: 메시지가 잘림
**자동 해결**: 시스템이 자동으로 메시지 분할 처리

**수동 확인**:
```bash
# 로그에서 분할 확인
tail -f logs/aggregator.log | grep "Part"

# 예: "Telegram message sent successfully (3 parts)"
```

### 1.4 Webhook vs Long Polling

**현재 구현**: Webhook 모드 (ngrok 사용)

**Webhook 장점**:
- 실시간 응답 (지연 <100ms)
- 서버 리소스 효율적
- 양방향 통신 지원

**Long Polling 전환** (ngrok 없이 사용):
```javascript
// src/channels/telegram/webhook.js 대신
// src/channels/telegram/polling.js 생성 (미구현)

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
  // 메시지 처리
});
```

---

## 2. SSH 연결 관리

### 2.1 연결 풀링 아키텍처

**파일**: `src/remote/command-executor.js`

**핵심 개념**:
```javascript
class CommandExecutor {
  constructor() {
    // Map<serverId, SSHConnection>
    this.sshConnections = new Map();
  }

  async _getSSHConnection(server) {
    // 1. 기존 연결 재사용 시도
    if (this.sshConnections.has(server.id)) {
      // 헬스 체크
      await ssh.execCommand('echo ping');
      return ssh; // 재사용
    }

    // 2. 새 연결 생성 및 캐시
    const ssh = new NodeSSH();
    await ssh.connect({...});
    this.sshConnections.set(server.id, ssh);
    return ssh;
  }
}
```

**이점**:
- **연결 재사용**: 매번 SSH 핸드셰이크 불필요 (~1-2초 절약)
- **동시성**: 여러 명령을 병렬로 실행 가능
- **장애 복구**: 연결 실패 시 자동 재연결

### 2.2 SSH 키 설정

**권장 구성**:
```bash
# 1. ED25519 키 생성 (RSA보다 빠르고 안전)
ssh-keygen -t ed25519 -C "claude-remote" -f ~/.ssh/claude_remote_ed25519

# 2. 원격 서버에 공개키 복사
ssh-copy-id -i ~/.ssh/claude_remote_ed25519.pub user@remote-server

# 3. config/servers.json 설정
{
  "ssh": {
    "user": "jay.lee",
    "port": 22,
    "keyPath": "~/.ssh/claude_remote_ed25519"
  }
}

# 4. 권한 확인
chmod 600 ~/.ssh/claude_remote_ed25519
```

**다중 키 관리** (서버마다 다른 키):
```json
{
  "servers": [
    {
      "id": "kr4",
      "ssh": {
        "keyPath": "~/.ssh/kr4_key"
      }
    },
    {
      "id": "aws1",
      "ssh": {
        "keyPath": "~/.ssh/aws1_key"
      }
    }
  ]
}
```

### 2.3 SSH 연결 문제 해결

#### 문제 1: "Permission denied (publickey)"
**해결**:
```bash
# 1. SSH 에이전트에 키 추가
ssh-add ~/.ssh/claude_remote_ed25519

# 2. 수동 SSH 테스트
ssh -i ~/.ssh/claude_remote_ed25519 user@remote-server

# 3. 원격 서버 authorized_keys 확인
cat ~/.ssh/authorized_keys | grep "claude-remote"

# 4. 권한 확인
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

#### 문제 2: "Connection timeout"
**해결**:
```bash
# 1. 방화벽 확인
sudo ufw status
# SSH 포트 허용 확인 (기본 22번)

# 2. SSH 데몬 상태 확인 (원격 서버)
sudo systemctl status ssh

# 3. 네트워크 도달성 테스트
ping remote-server
telnet remote-server 22

# 4. config/servers.json에서 포트 확인
{
  "ssh": {
    "port": 22  # 비표준 포트 사용 시 변경
  }
}
```

#### 문제 3: SSH 연결 끊김
**자동 복구 메커니즘**:
```javascript
// 연결 풀에서 자동 제거 및 재연결
try {
  await ssh.execCommand(sshCommand);
} catch (error) {
  // 실패한 연결 제거
  this.sshConnections.delete(server.id);
  throw error; // 다음 요청 시 자동 재연결
}
```

**수동 재연결**:
```bash
# 서비스 재시작으로 연결 풀 초기화
./scripts/stop-all.sh
./scripts/start-all.sh
```

### 2.4 SSH 성능 최적화

**Keep-Alive 설정** (클라이언트):
```bash
# ~/.ssh/config 추가
Host *
  ServerAliveInterval 60
  ServerAliveCountMax 3
  TCPKeepAlive yes
```

**연결 압축** (느린 네트워크):
```json
// 향후 구현 예정
{
  "ssh": {
    "compression": true,
    "compressionLevel": 6
  }
}
```

**동시 연결 제한**:
```javascript
// 향후 구현: 서버당 최대 동시 연결 수
const MAX_CONNECTIONS_PER_SERVER = 5;
```

---

## 3. HTTP 통신 (Central Hub)

### 3.1 인증 메커니즘

**Shared Secret 방식**:
```javascript
// Remote Server → Central Hub
fetch('http://central-hub:3001/notify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shared-Secret': process.env.SHARED_SECRET
  },
  body: JSON.stringify({...})
});

// Central Hub 검증
if (req.headers['x-shared-secret'] !== expectedSecret) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

**Shared Secret 생성**:
```bash
# 설치 시 자동 생성 (64자 hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# .env에 저장
SHARED_SECRET=abc123...
```

### 3.2 API 엔드포인트

#### POST /notify
**용도**: 원격 서버에서 알림 전송

**요청**:
```bash
curl -X POST http://localhost:3001/notify \
  -H "Content-Type: application/json" \
  -H "X-Shared-Secret: your-secret" \
  -d '{
    "serverId": "kr4",
    "type": "completed",
    "project": "my-project",
    "metadata": {
      "userQuestion": "질문 내용",
      "claudeResponse": "응답 내용"
    }
  }'
```

**응답**:
```json
{
  "success": true,
  "session": {
    "id": "uuid-here",
    "identifier": "kr4:1",
    "token": "ABC12345"
  }
}
```

#### GET /health
**용도**: 시스템 상태 확인

**응답**:
```json
{
  "status": "ok",
  "servers": 3,
  "activeSessions": 5
}
```

#### GET /sessions
**용도**: 활성 세션 목록

**응답**:
```json
{
  "count": 2,
  "sessions": [
    {
      "id": "uuid-1",
      "serverId": "kr4",
      "serverNumber": 1,
      "project": "project-name",
      "createdAt": 1705123456,
      "expiresAt": 1705209856
    }
  ]
}
```

### 3.3 방화벽 설정

**Central Hub** (0.0.0.0:3001 리스닝):
```bash
# UFW (Ubuntu)
sudo ufw allow from 원격서버IP to any port 3001

# 예: 특정 서브넷만 허용
sudo ufw allow from 172.24.0.0/16 to any port 3001

# 모든 서버 허용 (비권장)
sudo ufw allow 3001/tcp
```

**Remote Server** (아웃바운드만 필요):
```bash
# 특별한 설정 불필요
# HTTPS 아웃바운드만 허용되면 됨
```

### 3.4 HTTPS 적용 (선택 사항)

**Reverse Proxy (Nginx)**:
```nginx
server {
  listen 443 ssl;
  server_name hub.example.com;

  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location /notify {
    proxy_pass http://localhost:3001;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

**원격 서버 설정 변경**:
```bash
# .env 수정
CENTRAL_HUB_ENDPOINT=https://hub.example.com/notify
```

---

## 4. ngrok 터널 관리

### 4.1 ngrok 설정

**자동 시작** (`scripts/start-all.sh`):
```bash
# 1. ngrok 백그라운드 실행
ngrok http 3000 > logs/ngrok.log 2>&1 &
NGROK_PID=$!

# 2. 공개 URL 추출 (최대 10초 대기)
for i in {1..10}; do
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')
  if [ "$NGROK_URL" != "null" ]; then
    break
  fi
  sleep 1
done

# 3. Telegram 웹훅 설정
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${NGROK_URL}/webhook"
```

**수동 ngrok 관리**:
```bash
# ngrok 설정 파일 (~/.ngrok2/ngrok.yml)
authtoken: your-ngrok-token
tunnels:
  claude-webhook:
    addr: 3000
    proto: http

# ngrok 시작
ngrok start claude-webhook

# 공개 URL 확인
curl http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url'
```

### 4.2 ngrok 대안

#### Option 1: Cloudflare Tunnel (무료, 영구)
```bash
# 1. cloudflared 설치
brew install cloudflared  # macOS
# 또는
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# 2. Cloudflare 로그인
cloudflared tunnel login

# 3. 터널 생성
cloudflared tunnel create claude-remote

# 4. 터널 실행
cloudflared tunnel --url http://localhost:3000
```

**장점**:
- ✅ 무료 (제한 없음)
- ✅ 영구 URL (변경 안 됨)
- ✅ DDoS 보호
- ✅ 더 빠른 속도

**단점**:
- ❌ Cloudflare 계정 필요
- ❌ 초기 설정 복잡

#### Option 2: localhost.run (설정 없음)
```bash
# SSH 터널 1줄로 시작
ssh -R 80:localhost:3000 nokey@localhost.run

# 출력된 URL을 Telegram 웹훅에 설정
# 예: https://abc123.lhr.life
```

**장점**:
- ✅ 설치 불필요
- ✅ 즉시 사용 가능

**단점**:
- ❌ URL이 매번 변경됨
- ❌ 안정성 낮음

#### Option 3: 자체 도메인 + 포트 포워딩
```bash
# 1. 공유기에서 포트 포워딩 설정
# 외부 포트 443 → 내부 IP:3000

# 2. Dynamic DNS 설정 (공인 IP 변경 대응)
# DuckDNS, No-IP 등 사용

# 3. Let's Encrypt SSL 인증서
certbot certonly --standalone -d yourdomain.duckdns.org
```

### 4.3 ngrok 문제 해결

#### 문제 1: ngrok URL이 계속 변경됨
**원인**: 무료 플랜의 랜덤 URL

**해결**:
```bash
# Option 1: ngrok 유료 플랜 ($8/월)
# - 고정 도메인 제공

# Option 2: Cloudflare Tunnel로 전환 (무료)

# Option 3: URL 변경 시 자동 웹훅 업데이트 (현재 구현됨)
# scripts/start-all.sh가 매번 자동 설정
```

#### 문제 2: "ERR_NGROK_108" (터널 제한)
**원인**: ngrok 무료 플랜은 동시 1개 터널만 허용

**해결**:
```bash
# 1. 기존 ngrok 프로세스 종료
pkill ngrok

# 2. 재시작
./scripts/start-all.sh

# 3. 다른 머신에서 ngrok 사용 중인지 확인
# 동일 계정으로 여러 곳에서 실행 불가
```

#### 문제 3: Telegram 웹훅 설정 실패
**해결**:
```bash
# 1. ngrok URL 확인
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')
echo "ngrok URL: $NGROK_URL"

# 2. 수동으로 웹훅 설정
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${NGROK_URL}/webhook"

# 3. 웹훅 상태 확인
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# 4. 예상 응답:
{
  "ok": true,
  "result": {
    "url": "https://abc123.ngrok-free.dev/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## 5. 보안 강화

### 5.1 Shared Secret 관리

**생성 및 배포**:
```bash
# 1. Central Hub에서 생성
cd ~/Claude-Code-Remote
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "SHARED_SECRET=$SECRET" >> .env

# 2. 원격 서버로 안전하게 전송
# Option 1: SSH를 통한 직접 설정
ssh remote-server "echo 'SHARED_SECRET=$SECRET' >> ~/Claude-Code-Remote/.env"

# Option 2: 암호화된 파일 전송
echo "$SECRET" | gpg --symmetric --armor > secret.gpg
scp secret.gpg remote-server:~/
ssh remote-server "gpg --decrypt ~/secret.gpg >> ~/Claude-Code-Remote/.env"
```

**주기적 갱신** (권장: 3개월마다):
```bash
# rotate-secret.sh
#!/bin/bash
NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Central Hub 업데이트
sed -i "s/SHARED_SECRET=.*/SHARED_SECRET=$NEW_SECRET/" .env

# 모든 원격 서버 업데이트
for server in kr4 aws1 prod; do
  ssh $server "sed -i 's/SHARED_SECRET=.*/SHARED_SECRET=$NEW_SECRET/' ~/Claude-Code-Remote/.env"
done

# 서비스 재시작
./scripts/stop-all.sh && ./scripts/start-all.sh
```

### 5.2 SSH 키 보안

**키 암호화**:
```bash
# 비밀번호 보호 키 생성
ssh-keygen -t ed25519 -C "claude-remote" -f ~/.ssh/claude_remote_ed25519
# Passphrase 입력 (권장)

# SSH 에이전트에 추가 (1회 입력으로 세션 동안 사용)
ssh-add ~/.ssh/claude_remote_ed25519
```

**키 제한** (특정 명령만 허용):
```bash
# 원격 서버의 ~/.ssh/authorized_keys
command="tmux send-keys",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 AAAAC3...
```

**키 감사**:
```bash
# 주기적으로 미사용 키 제거
ssh-keygen -l -f ~/.ssh/authorized_keys

# 특정 키 제거
sed -i '/claude-remote-old/d' ~/.ssh/authorized_keys
```

### 5.3 네트워크 보안

**Central Hub 방화벽**:
```bash
# 기본 차단, 허용 목록만 열기
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH (관리용)
sudo ufw allow 22/tcp

# 알림 수신 (특정 IP만)
sudo ufw allow from 172.24.12.0/24 to any port 3001

# ngrok webhook (로컬만)
sudo ufw allow from 127.0.0.1 to any port 3000

# 활성화
sudo ufw enable
```

**Rate Limiting** (DDoS 방어):
```bash
# UFW rate limiting
sudo ufw limit 3001/tcp

# 또는 Nginx rate limiting
limit_req_zone $binary_remote_addr zone=notify:10m rate=10r/s;

server {
  location /notify {
    limit_req zone=notify burst=20;
    proxy_pass http://localhost:3001;
  }
}
```

### 5.4 세션 보안

**자동 만료**:
```javascript
// 현재 구현: 24시간 후 자동 만료
expires: new Date(Date.now() + 24 * 60 * 60 * 1000)

// 더 짧게 설정 (보안 강화):
// .env에 추가
SESSION_EXPIRY_HOURS=8  // 8시간 후 만료
```

**토큰 복잡도 증가**:
```javascript
// 현재: 8자 (대문자 + 숫자)
// 개선: 16자 (대소문자 + 숫자 + 특수문자)
_generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let token = '';
  for (let i = 0; i < 16; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
```

---

## 6. 모니터링 및 로깅

### 6.1 로그 관리

**로그 파일 위치**:
```
logs/
├── aggregator.log      # 알림 수신 기록
├── webhook.log         # Telegram 명령 처리
└── ngrok.log          # ngrok 터널 상태
```

**실시간 모니터링**:
```bash
# 모든 로그 동시 확인
tail -f logs/*.log

# 특정 이벤트 필터링
tail -f logs/aggregator.log | grep "ERROR"
tail -f logs/webhook.log | grep "cmd"

# 색상 구분 (ccze 사용)
tail -f logs/aggregator.log | ccze -A
```

**로그 로테이션** (logrotate):
```bash
# /etc/logrotate.d/claude-remote
/home/user/Claude-Code-Remote/logs/*.log {
  daily
  rotate 7
  compress
  delaycompress
  missingok
  notifempty
  create 0644 user user
}
```

### 6.2 성능 메트릭

**수동 메트릭 확인**:
```bash
# 활성 세션 수
curl -s http://localhost:3001/sessions | jq '.count'

# 서버별 세션 분포
curl -s http://localhost:3001/sessions | jq '[.sessions[] | .serverId] | group_by(.) | map({server: .[0], count: length})'

# ngrok 터널 상태
curl -s http://localhost:4040/api/tunnels | jq '.tunnels[0] | {name, public_url, connections}'
```

**자동 모니터링** (향후 구현):
```bash
# Prometheus 메트릭 엔드포인트
curl http://localhost:3001/metrics

# 예상 출력:
# claude_remote_active_sessions 5
# claude_remote_notifications_total 127
# claude_remote_commands_total 43
# claude_remote_ssh_pool_size 3
```

### 6.3 알림 설정

**Telegram 관리자 알림**:
```javascript
// 시스템 이벤트 알림 (향후 구현)
async _sendAdminAlert(message) {
  await axios.post(
    `${this.apiBaseUrl}/bot${this.config.botToken}/sendMessage`,
    {
      chat_id: this.config.adminChatId,  // 별도 관리자 채널
      text: `🚨 SYSTEM ALERT\n${message}`
    }
  );
}

// 사용 예:
// - SSH 연결 실패 5회 이상
// - 세션 DB 용량 80% 초과
// - 메모리 사용량 90% 초과
```

---

## 7. 장애 상황별 복구 절차

### 7.1 Telegram Bot 응답 없음

**증상**:
- Telegram에서 명령 전송해도 반응 없음
- `/sessions` 명령 무응답

**진단**:
```bash
# 1. Webhook 상태 확인
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# 2. Webhook 서버 동작 확인
curl http://localhost:3000/health

# 3. ngrok 터널 상태
curl http://localhost:4040/api/tunnels
```

**복구**:
```bash
# 1. 모든 서비스 재시작
./scripts/stop-all.sh
./scripts/start-all.sh

# 2. 웹훅 수동 재설정
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${NGROK_URL}/webhook"

# 3. 테스트
# Telegram에서 /help 전송
```

### 7.2 원격 서버에서 알림 안 옴

**증상**:
- 원격 서버에서 작업 완료해도 Telegram 알림 없음
- Central Hub 로그에 알림 수신 기록 없음

**진단**:
```bash
# 1. 원격 서버에서 수동 테스트
ssh remote-server
cd ~/Claude-Code-Remote
node claude-hook-notify.js completed

# 2. Central Hub 로그 확인
tail -f logs/aggregator.log
# "Notification received" 메시지 확인

# 3. 네트워크 연결 테스트
ssh remote-server "curl -v http://central-hub-ip:3001/health"
```

**복구**:
```bash
# 1. 방화벽 확인 (Central Hub)
sudo ufw status | grep 3001

# 2. Shared Secret 일치 확인
# Central Hub
grep SHARED_SECRET ~/Claude-Code-Remote/.env

# Remote Server
ssh remote-server "grep SHARED_SECRET ~/Claude-Code-Remote/.env"

# 3. 불일치 시 동기화
ssh remote-server "echo 'SHARED_SECRET=올바른_시크릿' > ~/Claude-Code-Remote/.env"
```

### 7.3 SSH 명령 실행 실패

**증상**:
- `/cmd kr4:1 pwd` 명령 시 "Failed to execute" 에러
- Webhook 로그에 SSH 연결 실패 기록

**진단**:
```bash
# 1. 수동 SSH 연결 테스트
ssh -i ~/.ssh/id_ed25519 user@remote-server "tmux list-sessions"

# 2. SSH 키 권한 확인
ls -l ~/.ssh/id_ed25519
# 출력: -rw------- (600)

# 3. tmux 세션 존재 확인
ssh remote-server "tmux list-sessions"
```

**복구**:
```bash
# 1. SSH 키 권한 수정
chmod 600 ~/.ssh/id_ed25519

# 2. SSH 에이전트에 키 추가
ssh-add ~/.ssh/id_ed25519

# 3. 연결 풀 초기화 (서비스 재시작)
./scripts/stop-all.sh
./scripts/start-all.sh

# 4. tmux 세션 재생성 (원격 서버)
ssh remote-server
tmux new -s default
```

### 7.4 세션 DB 손상

**증상**:
- "Database is locked" 에러
- 세션 생성/조회 실패

**진단**:
```bash
# 1. DB 파일 확인
ls -lh data/sessions.db*

# 2. DB 무결성 검사
sqlite3 data/sessions.db "PRAGMA integrity_check;"
# 출력: ok (정상) 또는 에러 메시지

# 3. WAL 파일 크기 확인
du -h data/sessions.db-wal
# 너무 크면 체크포인트 필요
```

**복구**:
```bash
# 1. 서비스 중지
./scripts/stop-all.sh

# 2. WAL 체크포인트 (데이터 병합)
sqlite3 data/sessions.db "PRAGMA wal_checkpoint(TRUNCATE);"

# 3. DB 백업
cp data/sessions.db data/sessions.db.backup

# 4. 손상 시 재생성
# 주의: 모든 세션 삭제됨
rm data/sessions.db*
# 서비스 시작 시 자동 재생성

# 5. 서비스 재시작
./scripts/start-all.sh
```

### 7.5 ngrok 터널 끊김

**증상**:
- Telegram 명령 응답 없음
- ngrok.log에 "connection refused" 에러

**복구**:
```bash
# 1. ngrok 재시작
pkill ngrok
ngrok http 3000 > logs/ngrok.log 2>&1 &

# 2. 새 URL 확인
sleep 5
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')
echo "New ngrok URL: $NGROK_URL"

# 3. Telegram 웹훅 업데이트
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${NGROK_URL}/webhook"

# 또는 자동 스크립트 실행
./scripts/start-all.sh
```

---

## 8. 성능 최적화

### 8.1 데이터베이스 최적화

**WAL 모드** (이미 적용됨):
```javascript
// SQLite WAL 모드 설정
this.db.pragma('journal_mode = WAL');
this.db.pragma('synchronous = NORMAL');
this.db.pragma('cache_size = -2000');  // 2MB 캐시
```

**주기적 체크포인트**:
```bash
# Cron job 추가 (매시간 체크포인트)
crontab -e

# 추가:
0 * * * * sqlite3 ~/Claude-Code-Remote/data/sessions.db "PRAGMA wal_checkpoint(PASSIVE);"
```

**인덱스 추가** (향후 개선):
```sql
-- 자주 조회되는 컬럼에 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_server_id ON sessions(server_id);
CREATE INDEX IF NOT EXISTS idx_expires_at ON sessions(expires_at);
```

### 8.2 SSH 연결 최적화

**멀티플렉싱** (~/.ssh/config):
```
Host *
  ControlMaster auto
  ControlPath ~/.ssh/control-%r@%h:%p
  ControlPersist 600
```

**압축 활성화** (느린 네트워크):
```
Host remote-server
  Compression yes
  CompressionLevel 6
```

**연결 풀 크기 조정**:
```javascript
// src/remote/command-executor.js (향후 개선)
const MAX_POOL_SIZE = 10;  // 서버당 최대 10개 연결
```

### 8.3 Telegram 메시지 최적화

**메시지 압축**:
```javascript
// 긴 메시지는 요약 + 상세 링크
if (message.length > 2000) {
  const summary = message.substring(0, 500) + '...';
  // 상세 내용은 웹 페이지로 제공 (향후 구현)
  return summary + '\n\n📄 전체 내용: https://hub.example.com/session/123';
}
```

**배치 알림** (향후 구현):
```javascript
// 1분 내 여러 알림은 통합
const NOTIFICATION_BATCH_WINDOW = 60000; // 1분
```

### 8.4 리소스 모니터링

**메모리 사용량 확인**:
```bash
# Node.js 프로세스 메모리
ps aux | grep "node.*aggregator\|node.*webhook" | awk '{print $6}'

# 권장: 각 프로세스 < 100MB
```

**CPU 사용량 확인**:
```bash
# CPU 상위 프로세스
top -b -n 1 | grep node

# 권장: 평균 CPU < 10%
```

**네트워크 대역폭**:
```bash
# 실시간 네트워크 모니터링
iftop -i eth0

# 또는
nload
```

---

## 부록 A: 환경 변수 전체 목록

```bash
# ===== Central Hub =====
# Telegram 설정
TELEGRAM_BOT_TOKEN=your-bot-token-here
TELEGRAM_CHAT_ID=your-chat-id-here
TELEGRAM_GROUP_ID=your-group-id-here          # 선택
TELEGRAM_FORCE_IPV4=true                       # 선택

# 서버 설정
CENTRAL_HUB_PORT=3001
WEBHOOK_PORT=3000
SHARED_SECRET=auto-generated-64-char-hex

# ngrok 설정
NGROK_ENABLED=true                             # 선택
NGROK_AUTHTOKEN=your-ngrok-token               # 선택

# 세션 설정
SESSION_EXPIRY_HOURS=24                        # 선택 (기본: 24)

# ===== Remote Server =====
SERVER_ID=kr4                                  # 필수
CENTRAL_HUB_ENDPOINT=http://172.24.12.11:3001/notify  # 필수
SHARED_SECRET=same-as-central-hub              # 필수
```

## 부록 B: 문제 해결 체크리스트

### Telegram 알림 문제
- [ ] Bot Token 유효성 확인
- [ ] Chat ID 정확성 확인
- [ ] ngrok 터널 활성 상태
- [ ] Webhook URL 올바름
- [ ] 방화벽에서 HTTPS 아웃바운드 허용

### 원격 서버 연결 문제
- [ ] SSH 키 권한 600 확인
- [ ] authorized_keys에 공개키 존재
- [ ] 방화벽에서 포트 3001 허용
- [ ] Shared Secret 일치 확인
- [ ] 네트워크 연결 가능 (ping, telnet)

### 명령 실행 문제
- [ ] tmux 세션 존재 확인
- [ ] SSH 연결 가능 확인
- [ ] 세션 만료되지 않음 (24시간 이내)
- [ ] 올바른 세션 식별자 사용

---

## 참고 자료

- [Telegram Bot API 공식 문서](https://core.telegram.org/bots/api)
- [ngrok 문서](https://ngrok.com/docs)
- [Cloudflare Tunnel 가이드](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [SQLite WAL 모드](https://www.sqlite.org/wal.html)
- [node-ssh 라이브러리](https://github.com/steelbrain/node-ssh)

---

**문서 버전**: 1.0.0
**최종 업데이트**: 2026-01-19
**작성자**: Claude Code Remote Team
