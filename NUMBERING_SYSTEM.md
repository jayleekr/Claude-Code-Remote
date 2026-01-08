# Session Numbering System

## 개요 (Overview)

Telegram 봇에서 session token (예: ABC12345) 대신 간단한 숫자 (1, 2, 3...)를 사용하도록 변경했습니다.

Changed from using session tokens (e.g., ABC12345) to simple numbers (1, 2, 3...) in the Telegram bot.

## 작동 방식 (How It Works)

### 동적 번호 할당 (Dynamic Number Assignment)

- **#1은 항상 가장 최근 세션** (모든 프로젝트 통합)
- 새 세션이 생성되면 이전 세션들은 #2, #3, #4...로 밀림
- 세션 파일에 번호를 저장하지 않음 (동적으로 계산)
- 각 알림에 프로젝트 이름이 표시됨

**#1 is always the most recent session** (across all projects)
- As new sessions are created, older ones become #2, #3, #4...
- Numbers are NOT stored in session files (calculated dynamically)
- Each notification shows which project it belongs to

### 예시 (Example)

```
현재 상태 (Current state):
#1 → container-manager (XNMJUX0U)  ← 가장 최근 (most recent)
#2 → ProfNoh_proj_1 (WH0Q5IRU)
#3 → jaylee (E3KJ09GB)

새로운 ProfNoh_proj_1 세션 생성 후 (After new ProfNoh_proj_1 session):
#1 → ProfNoh_proj_1 (NEW_TOKEN)    ← 새 세션이 #1이 됨
#2 → container-manager (XNMJUX0U)  ← #1에서 #2로 이동
#3 → ProfNoh_proj_1 (WH0Q5IRU)    ← #2에서 #3으로 이동
#4 → jaylee (E3KJ09GB)            ← #3에서 #4로 이동
```

## 사용법 (Usage)

### Telegram에서 명령어 보내기 (Sending commands)

```bash
# 가장 최근 세션에 명령 보내기 (Send to most recent session)
/cmd 1 show me the latest changes

# 또는 /cmd 없이 (Or without /cmd)
1 analyze this code

# 이전 세션에 명령 보내기 (Send to older sessions)
/cmd 2 check the logs
/cmd 3 run tests
```

### 어떤 세션에 명령을 보낼지 확인 (Checking which session to use)

1. Telegram 알림을 확인하면 프로젝트 이름이 표시됩니다
2. 가장 최근에 받은 알림의 세션이 항상 #1입니다
3. 원하는 프로젝트의 알림을 찾아 해당 번호를 사용하세요

When you receive a notification:
1. Check the project name in the notification
2. The most recent notification is always #1
3. Find the notification for the project you want and use that number

## 현재 세션 확인 (Checking Current Sessions)

```bash
# 현재 활성 세션과 번호 확인 (Check active sessions and their numbers)
node test-numbering.js
```

출력 예시 (Example output):
```
📊 Total active sessions: 140

Session Number → Project (Token)
────────────────────────────────────────────────────────────
# 1 → container-manager         (XNMJUX0U) - 1/8/2026, 7:50:20 PM
# 2 → ProfNoh_proj_1            (WH0Q5IRU) - 1/8/2026, 7:49:43 PM
# 3 → jaylee                    (E3KJ09GB) - 1/8/2026, 7:44:43 PM
...

🔍 Finding specific projects:
📦 container-manager: #1, #14, #20, #35, #36 (37 more)
📦 ProfNoh_proj_1: #2, #5, #6, #8, #9 (36 more)
```

## 기술적 구현 (Technical Implementation)

### 변경 사항 (Changes Made)

1. **telegram.js**:
   - 제거: `_assignShortNumber()` 함수
   - 제거: session 객체에서 `shortNumber` 필드
   - 변경: 알림 메시지가 항상 "#1 (most recent)" 표시
   - 변경: 버튼 콜백이 항상 "1" 사용

2. **webhook.js**:
   - `_findSessionByIdentifier()`: 동적으로 번호 계산
     - 모든 세션을 creation time으로 정렬
     - 인덱스 기반으로 번호 할당 (0-based → 1-based)
   - 도움말 메시지 업데이트

### 번호 계산 로직 (Number Calculation Logic)

```javascript
// webhook.js의 _findSessionByIdentifier() 함수
if (/^\d+$/.test(identifier)) {
    const sessionNumber = parseInt(identifier);

    // 생성 시간으로 정렬 (최신 우선)
    sessions.sort((a, b) => b.createdAt - a.createdAt);

    // 1-based 인덱싱: #1 = sessions[0], #2 = sessions[1], ...
    if (sessionNumber > 0 && sessionNumber <= sessions.length) {
        return sessions[sessionNumber - 1];
    }
}
```

## 하위 호환성 (Backward Compatibility)

기존 token 방식도 계속 사용 가능:

Old token-based commands still work:
```bash
/cmd ABC12345 <command>
```

## 장점 (Benefits)

✅ **사용성**: 번호가 token보다 기억하고 입력하기 쉬움
✅ **직관성**: #1이 항상 최신 세션이라는 것을 쉽게 이해
✅ **편의성**: 긴 token을 복사/붙여넣기할 필요 없음
✅ **투명성**: 각 알림에 프로젝트 이름이 명확히 표시됨

✅ **Usability**: Numbers easier to remember and type than tokens
✅ **Intuitive**: #1 always being the most recent is easy to understand
✅ **Convenient**: No need to copy/paste long tokens
✅ **Transparent**: Project name clearly shown in each notification

## 주의사항 (Important Notes)

⚠️ **번호는 동적**: 새 세션이 생성되면 기존 번호가 변경됨
⚠️ **프로젝트 확인**: 명령을 보내기 전에 알림에서 프로젝트 이름 확인
⚠️ **24시간 만료**: 세션은 24시간 후 자동으로 만료됨

⚠️ **Numbers are dynamic**: When new sessions are created, old numbers change
⚠️ **Check project**: Verify project name in notification before sending commands
⚠️ **24-hour expiration**: Sessions automatically expire after 24 hours

## FAQ

### Q: container-manager는 몇 번이야? (What number is container-manager?)
A: 가장 최근 container-manager 알림을 확인하세요. 방금 작업했다면 #1일 가능성이 높습니다. `node test-numbering.js`로 현재 상태를 확인할 수 있습니다.

Check your most recent container-manager notification. If you just worked on it, it's likely #1. Run `node test-numbering.js` to see current state.

### Q: 번호가 계속 바뀌면 혼란스럽지 않나요? (Isn't it confusing if numbers keep changing?)
A: 실제 사용 패턴에서는:
- 대부분 가장 최근 세션(#1)에 명령을 보냄
- Telegram 알림을 보고 즉시 명령을 보내므로 번호가 바뀌기 전
- 각 알림에 프로젝트 이름이 표시되어 확인 가능

In practice:
- Most commands go to the most recent session (#1)
- You send commands right after seeing the notification, before numbers change
- Each notification shows the project name for verification

### Q: 이전 token 방식으로 돌아갈 수 있나요? (Can I go back to the token system?)
A: Token 방식도 여전히 작동하지만, 번호 시스템을 사용하는 것을 권장합니다. Token 방식이 필요하면:

Token system still works, but we recommend using numbers. If you need tokens:
```bash
/cmd ABC12345 <command>  # Still works!
```

### Q: 여러 프로젝트를 동시에 작업하면? (What if I work on multiple projects?)
A: 각 알림은 프로젝트 이름을 표시합니다:

Each notification shows the project name:
```
✅ Claude Task Completed
Project: container-manager
Session: #1 (most recent)

💬 To send a command:
/cmd 1 <your command>
```

원하는 프로젝트의 알림을 찾아 그 번호를 사용하세요.
Find the notification for your desired project and use that number.
