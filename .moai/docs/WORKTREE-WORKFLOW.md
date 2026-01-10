# Worktree 기반 병렬 개발 워크플로우

## 📋 개요

Claude-Code-Remote 프로젝트는 Git Worktree를 활용하여 4개의 SPEC을 병렬로 개발합니다. 각 SPEC은 독립적인 worktree 환경에서 작업되며, 서로 간섭 없이 동시 개발이 가능합니다.

## 🌳 생성된 Worktree 목록

| SPEC ID | Branch | 경로 | 상태 | 생성일 |
|---------|--------|------|------|--------|
| SPEC-RELIABILITY-001 | feature/SPEC-RELIABILITY-001 | ~/worktrees/Claude-Code-Remote/SPEC-RELIABILITY-001 | active | 2026-01-10 |
| SPEC-MONITORING-001 | feature/SPEC-MONITORING-001 | ~/worktrees/Claude-Code-Remote/SPEC-MONITORING-001 | active | 2026-01-10 |
| SPEC-UX-001 | feature/SPEC-UX-001 | ~/worktrees/Claude-Code-Remote/SPEC-UX-001 | active | 2026-01-10 |
| SPEC-PERFORMANCE-001 | feature/SPEC-PERFORMANCE-001 | ~/worktrees/Claude-Code-Remote/SPEC-PERFORMANCE-001 | active | 2026-01-10 |

## 🚀 기본 사용법

### 1. Worktree 목록 확인

```bash
moai-worktree list
```

### 2. 특정 Worktree로 이동

**방법 1: 직접 이동**
```bash
moai-worktree switch SPEC-RELIABILITY-001
```

**방법 2: Shell 통합 (권장)**
```bash
eval "$(moai-worktree go SPEC-RELIABILITY-001)"
```

### 3. Worktree에서 작업 시작

```bash
# SPEC-RELIABILITY-001 worktree로 이동
cd ~/worktrees/Claude-Code-Remote/SPEC-RELIABILITY-001

# 개발 시작 (TDD 방식)
/moai:2-run SPEC-RELIABILITY-001

# 현재 브랜치 확인
git branch
# * feature/SPEC-RELIABILITY-001

# 작업 후 커밋
git add .
git commit -m "feat(reliability): implement retry logic"
git push origin feature/SPEC-RELIABILITY-001
```

### 4. Base 브랜치와 동기화

```bash
# Worktree 내에서 실행
moai-worktree sync SPEC-RELIABILITY-001

# 또는 메인 저장소에서
cd /Users/jaylee/CodeWorkspace/Claude-Code-Remote
moai-worktree sync SPEC-RELIABILITY-001
```

### 5. PR 생성 및 병합 후 정리

```bash
# PR 병합 완료 후
moai-worktree remove SPEC-RELIABILITY-001

# 또는 모든 병합된 worktree 정리
moai-worktree clean --merged-only
```

## 🔄 병렬 개발 워크플로우

### Phase 1: 기초 구축 (Week 1-3)

**SPEC-RELIABILITY-001 개발**

```bash
# Step 1: Worktree로 이동
cd ~/worktrees/Claude-Code-Remote/SPEC-RELIABILITY-001

# Step 2: SPEC 문서 확인
cat .moai/specs/SPEC-RELIABILITY-001.md

# Step 3: TDD 사이클 시작
/moai:2-run SPEC-RELIABILITY-001

# Step 4: 정기적으로 master와 동기화
moai-worktree sync SPEC-RELIABILITY-001

# Step 5: 작업 완료 후 PR 생성
git push origin feature/SPEC-RELIABILITY-001
# GitHub에서 PR 생성
```

### Phase 2: 병렬 개발 (Week 4-5)

**두 SPEC 동시 작업**

터미널 1 - SPEC-MONITORING-001:
```bash
cd ~/worktrees/Claude-Code-Remote/SPEC-MONITORING-001
/moai:2-run SPEC-MONITORING-001
# 개발 작업...
```

터미널 2 - SPEC-UX-001:
```bash
cd ~/worktrees/Claude-Code-Remote/SPEC-UX-001
/moai:2-run SPEC-UX-001
# 개발 작업...
```

**빠른 전환**
```bash
# SPEC-MONITORING-001에서 작업 중...
git add . && git commit -m "wip: health check API"

# SPEC-UX-001로 즉시 전환
cd ~/worktrees/Claude-Code-Remote/SPEC-UX-001
# 컨텍스트 스위칭 없이 즉시 작업 가능!
```

### Phase 3: 성능 최적화 (Week 6-7)

**SPEC-PERFORMANCE-001 개발**

```bash
cd ~/worktrees/Claude-Code-Remote/SPEC-PERFORMANCE-001

# 모든 이전 SPEC의 변경사항 통합 필요 시
moai-worktree sync SPEC-PERFORMANCE-001

/moai:2-run SPEC-PERFORMANCE-001
```

## 📊 Worktree 상태 관리

### 현재 상태 확인

```bash
# 모든 worktree 상태
moai-worktree list

# 특정 worktree 상태
moai-worktree status SPEC-RELIABILITY-001
```

### 동기화가 필요한 Worktree 찾기

```bash
# 수동으로 확인
cd ~/worktrees/Claude-Code-Remote/SPEC-RELIABILITY-001
git fetch origin master
git log HEAD..origin/master --oneline

# 변경사항이 있으면 동기화
moai-worktree sync SPEC-RELIABILITY-001
```

## 🛠️ 고급 사용법

### 1. 실험적 기능 개발

```bash
# 임시 worktree 생성 (SPEC ID 없이)
git worktree add ~/worktrees/experiment -b experiment/new-feature

# 실험 완료 후 제거
git worktree remove ~/worktrees/experiment
```

### 2. Code Review Worktree

```bash
# PR 리뷰를 위한 임시 worktree
git worktree add ~/worktrees/review-123 -b review/pr-123
git pull origin feature/SPEC-RELIABILITY-001

# 리뷰 완료 후 제거
git worktree remove ~/worktrees/review-123
```

### 3. 여러 Worktree 일괄 동기화

```bash
# 모든 active worktree 동기화 (bash 스크립트)
for spec in SPEC-RELIABILITY-001 SPEC-MONITORING-001 SPEC-UX-001 SPEC-PERFORMANCE-001; do
    echo "Syncing $spec..."
    moai-worktree sync $spec
done
```

## ⚠️ 주의사항

### 1. Git 상태 관리

- 각 worktree는 **독립적인 Git 상태**를 가집니다
- worktree 간 이동 시 **staged 파일은 독립적**으로 유지됩니다
- **stash는 공유되지 않습니다** - 각 worktree마다 별도 관리

### 2. 파일 시스템 제약

- 동일한 브랜치를 여러 worktree에서 **동시에 체크아웃 불가**
- worktree 삭제 시 **파일도 함께 삭제**되므로 주의
- `.git` 파일은 **절대 수정하지 않기**

### 3. 성능 고려사항

- 각 worktree는 **전체 프로젝트 파일 복사본**을 가집니다
- 대용량 프로젝트의 경우 **디스크 공간** 주의
- **4개 worktree ≈ 프로젝트 크기 × 4**

## 🔍 문제 해결

### Worktree 생성 실패

```bash
Error: Failed to create branch: Ref 'main' did not resolve to an object

# 해결: base 브랜치 명시
moai-worktree new SPEC-ID --base master
```

### Worktree 동기화 충돌

```bash
# 충돌 발생 시
cd ~/worktrees/Claude-Code-Remote/SPEC-RELIABILITY-001
git merge master
# 충돌 해결 후
git add .
git merge --continue
```

### Worktree 경로 찾기

```bash
# 모든 worktree 경로 확인
git worktree list

# 특정 worktree 경로만
moai-worktree list | grep SPEC-RELIABILITY-001
```

## 📚 참고 자료

- [Git Worktree 공식 문서](https://git-scm.com/docs/git-worktree)
- [MoAI Worktree 스킬 문서](.claude/skills/moai-workflow-worktree/)
- [SPEC 문서들](.moai/specs/)
- [구현 로드맵](.moai/specs/IMPLEMENTATION-ROADMAP.md)

## 🎯 빠른 참조

```bash
# Worktree 목록
moai-worktree list

# Worktree로 이동
cd ~/worktrees/Claude-Code-Remote/SPEC-RELIABILITY-001

# 동기화
moai-worktree sync SPEC-RELIABILITY-001

# 제거
moai-worktree remove SPEC-RELIABILITY-001

# 병합된 것들 일괄 정리
moai-worktree clean --merged-only
```

---

**마지막 업데이트**: 2026-01-10
**작성자**: Alfred (Claude Code Orchestrator)
