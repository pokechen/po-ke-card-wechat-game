#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_ID="${TCB_ENV_ID:-po-ke-card-d0gg2ewaac3e700c4}"
# 与线上 pvpRoom 实际运行时保持一致；更换版本需删除函数后重建，updateFunctionCode 不会修改 runtime
RUNTIME="${TCB_RUNTIME:-Nodejs18.15}"
# cos 上传模式会导致控制台出现 ResourceNotFound.Entryfile，固定使用 zip
DEPLOY_MODE="${TCB_DEPLOY_MODE:-zip}"

cd "$ROOT_DIR"

log() {
  printf '\n\033[1;34m==> %s\033[0m\n' "$1"
}

fail() {
  printf '\n\033[1;31m%s\033[0m\n' "$1" >&2
  exit 1
}

run_tcb_default() {
  # CloudBase CLI 3.x 会询问 “Please select an action”，输入回车选择默认项。
  printf '\n' | "$@"
}

ensure_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

check_function_syntax() {
  local file="$1/index.js"
  [[ -f "$file" ]] || fail "找不到云函数入口文件：$file"
  node --check "$file" >/dev/null
}

update_or_deploy_function() {
  local name="$1"
  local dir="$2"

  log "检查 $name"
  check_function_syntax "$dir"

  if tcb fn detail "$name" -e "$ENV_ID" >/dev/null 2>&1; then
    log "更新云函数代码：$name"
    if ! run_tcb_default tcb fn code update "$name" --dir "$dir" --deployMode "$DEPLOY_MODE" -e "$ENV_ID"; then
      log "$name 代码更新失败，尝试重新部署"
      run_tcb_default tcb fn deploy "$name" --dir "$dir" --force --runtime "$RUNTIME" --deployMode "$DEPLOY_MODE" -e "$ENV_ID"
    fi
  else
    log "创建并部署云函数：$name"
    run_tcb_default tcb fn deploy "$name" --dir "$dir" --force --runtime "$RUNTIME" --deployMode "$DEPLOY_MODE" -e "$ENV_ID"
  fi
}

verify_function() {
  local name="$1"
  local params="$2"

  log "验证云函数：$name"
  local output
  if ! output="$(tcb fn invoke "$name" --params "$params" --json -e "$ENV_ID" 2>&1)"; then
    printf '%s\n' "$output"
    fail "$name 调用失败"
  fi

  if printf '%s\n' "$output" | grep -q '"InvokeResult": 0' && printf '%s\n' "$output" | grep -q 'ok.*true'; then
    printf '%s 验证通过\n' "$name"
  else
    printf '%s\n' "$output"
    fail "$name 返回异常"
  fi
}

ensure_cmd node
ensure_cmd tcb

log "目标 CloudBase 环境：$ENV_ID"

log "同步 PVP 共享核心"
node scripts/sync-pvp-core.js

update_or_deploy_function "pvpRoom" "./cloudfunctions/pvpRoom"

verify_function "pvpRoom" '{"action":"getLoginContext"}'

log "云函数同步与部署完成"
printf '环境：%s\n' "$ENV_ID"
printf '函数：pvpRoom\n'
