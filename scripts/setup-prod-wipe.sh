#!/bin/bash
# =============================================================================
# 퇴직자 증적 기능 - 운영서버 최초 설정 스크립트
#
#  - docker-compose.yml : 업로드 볼륨 마운트 + 증적 환경변수 추가,
#                         운영에 부적절한 스택트레이스 노출 설정 제거
#  - nginx/default.conf : 업로드 용량 제한 60m 설정 (기본 1MB 로는 첨부 실패)
#  - 업로드 폴더 및 .dockerignore 생성
#
# 수정 전 원본을 타임스탬프 백업으로 남기며, 이미 적용된 항목은 건너뛰므로
# 여러 번 실행해도 안전합니다. (컨테이너를 재시작하지는 않습니다)
#
# 사용법:
#   ./setup-prod-wipe.sh                          # 기본 경로(/opt/it-asset)
#   TARGET=/다른/배포/경로 ./setup-prod-wipe.sh
# =============================================================================
set -e

TARGET="${TARGET:-/opt/it-asset}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backup}"
COMPOSE="$TARGET/docker-compose.yml"
NGINX="$TARGET/nginx/default.conf"
STAMP=$(date +%Y%m%d_%H%M%S)
# 이 스크립트가 놓인 위치 (안내 문구에서 점검 스크립트 경로를 정확히 알려주기 위함)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo " 퇴직자 증적 기능 - 운영 설정 적용"
echo " 대상: $TARGET"
echo "============================================================"

[ -f "$COMPOSE" ] || { echo "[중단] compose 파일을 찾을 수 없습니다: $COMPOSE"; exit 1; }
[ -f "$NGINX" ]   || { echo "[중단] nginx 설정을 찾을 수 없습니다: $NGINX"; exit 1; }

mkdir -p "$BACKUP_DIR"
COMPOSE_BAK="$BACKUP_DIR/docker-compose.yml.bak_$STAMP"
NGINX_BAK="$BACKUP_DIR/nginx-default.conf.bak_$STAMP"
cp -a "$COMPOSE" "$COMPOSE_BAK"
cp -a "$NGINX"   "$NGINX_BAK"
echo "[백업] $COMPOSE_BAK"
echo "[백업] $NGINX_BAK"
echo ""

python3 - "$COMPOSE" "$NGINX" <<'PYEOF'
import re, sys

compose_path, nginx_path = sys.argv[1], sys.argv[2]
changed = []

# ---------------- docker-compose.yml ----------------
s = open(compose_path, encoding='utf-8').read()

# 1) 운영에서는 스택트레이스를 사용자에게 노출하지 않는다
new = re.sub(r'^[ \t]*SERVER_ERROR_INCLUDE_STACKTRACE:[^\n]*\n', '', s, flags=re.M)
if new != s:
    s = new
    changed.append('스택트레이스 노출 설정 제거')

# 2) 증적 환경변수 + 3) 업로드 볼륨 (backend 서비스의 extra_hosts 앞에 삽입)
add = ''
if 'APP_WIPE_UPLOAD_DIR' not in s:
    add += ('      # 퇴직자 증적: 첨부파일 저장 경로 + 보관기한(년)\n'
            '      APP_WIPE_UPLOAD_DIR: /app/uploads/wipe\n'
            '      APP_WIPE_RETENTION_YEARS: 3\n')
    changed.append('증적 환경변수 추가')
if './backend/uploads:/app/uploads' not in s:
    add += ('    volumes:\n'
            '      # 이 마운트가 없으면 재배포 시 증적 첨부파일이 모두 사라집니다\n'
            '      - ./backend/uploads:/app/uploads:z\n')
    changed.append('업로드 볼륨 마운트 추가')

if add:
    s2, n = re.subn(r'^([ \t]*extra_hosts:)', add + r'\1', s, count=1, flags=re.M)
    if n == 0:
        print('  [실패] compose 파일에서 extra_hosts 위치를 찾지 못했습니다.')
        print('         backend 서비스에 아래 내용을 직접 추가해주세요:')
        print(add)
        sys.exit(2)
    s = s2

open(compose_path, 'w', encoding='utf-8').write(s)

# ---------------- nginx/default.conf ----------------
n = open(nginx_path, encoding='utf-8').read()
if 'client_max_body_size' not in n:
    n2, cnt = re.subn(r'^([ \t]*listen[^\n]*\n)',
                      r'\1\n    # 증적 스크린샷 업로드용 (기본 1MB 로는 첨부가 막힘)\n    client_max_body_size 60m;\n',
                      n, count=1, flags=re.M)
    if cnt == 0:
        print('  [실패] nginx 설정에서 listen 지시자를 찾지 못했습니다.')
        print('         server 블록 안에 client_max_body_size 60m; 를 직접 추가해주세요.')
        sys.exit(2)
    open(nginx_path, 'w', encoding='utf-8').write(n2)
    changed.append('nginx 업로드 용량 60m 설정')

if changed:
    for c in changed:
        print('  [적용] ' + c)
else:
    print('  [건너뜀] 모든 설정이 이미 적용되어 있습니다.')
PYEOF

# ---------------- 폴더 / dockerignore ----------------
if [ ! -d "$TARGET/backend/uploads/wipe" ]; then
  mkdir -p "$TARGET/backend/uploads/wipe"
  echo "  [적용] 업로드 폴더 생성: $TARGET/backend/uploads/wipe"
fi

if ! grep -qs '^uploads/' "$TARGET/backend/.dockerignore" 2>/dev/null; then
  printf 'uploads/\n' >> "$TARGET/backend/.dockerignore"
  echo "  [적용] .dockerignore 에 uploads/ 제외 추가 (배포 속도 저하 방지)"
fi

# SELinux 환경 대비 (update.sh 와 동일하게 처리)
command -v restorecon >/dev/null 2>&1 && restorecon -R "$TARGET/backend/uploads" >/dev/null 2>&1 || true

echo ""
echo "============================================================"
echo " 적용된 설정 확인"
echo "============================================================"
echo "[docker-compose.yml - backend]"
sed -n '/^  backend:/,/^  [a-z]/p' "$COMPOSE" | grep -E "APP_WIPE|volumes:|uploads|STACKTRACE" || echo "  (해당 항목 없음)"
echo ""
echo "[nginx/default.conf]"
grep -n "client_max_body_size" "$NGINX" || echo "  (설정 없음)"
echo ""
echo "============================================================"
echo " 다음 단계"
echo "   1) 설정을 반영하려면 컨테이너를 다시 생성해야 합니다:"
echo "        cd $TARGET && docker compose up -d --build"
echo "   2) 반영 후 점검:"
echo "        CONTAINER=it-asset-backend-1 $SCRIPT_DIR/check-wipe-env.sh"
echo ""
echo " 되돌리려면:"
echo "   cp -a $COMPOSE_BAK $COMPOSE"
echo "   cp -a $NGINX_BAK $NGINX"
echo "============================================================"
