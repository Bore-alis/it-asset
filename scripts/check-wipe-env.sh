#!/bin/bash
# =============================================================================
# 퇴직자 증적 기능 - 배포 환경 점검 스크립트
#
# 배포 후 실행하면 증적 기능이 제대로 동작할 조건이 갖춰졌는지 자동으로 확인한다.
# 데이터를 생성하거나 변경하지 않으므로 운영서버에서도 그대로 실행할 수 있다.
#
# 사용법:
#   ./check-wipe-env.sh                               # 기본값(개발서버)으로 점검
#   BASE_URL=http://10.x.x.x:8001 ./check-wipe-env.sh # 다른 서버 점검
#   CONTAINER=운영백엔드컨테이너명 ./check-wipe-env.sh
# =============================================================================

BASE_URL="${BASE_URL:-http://localhost:8001}"
CONTAINER="${CONTAINER:-it-asset-backend-1}"
UPLOAD_PATH="${UPLOAD_PATH:-/app/uploads}"

PASS=0; FAIL=0; WARN=0
ok()   { echo "  [ OK ]   $1"; PASS=$((PASS+1)); }
bad()  { echo "  [FAIL]   $1"; FAIL=$((FAIL+1)); }
warn() { echo "  [WARN]   $1"; WARN=$((WARN+1)); }

echo "============================================================"
echo " 퇴직자 증적 기능 환경 점검"
echo " 대상: $BASE_URL / 컨테이너: $CONTAINER"
echo "============================================================"

# -----------------------------------------------------------------------------
# 1. API 및 DB 테이블
#    목록 조회가 200이면 asset_wipe_records/asset_wipe_files 조회가 성공했다는 뜻이라
#    DB 접속 정보 없이도 테이블 존재 여부를 확인할 수 있다.
# -----------------------------------------------------------------------------
echo ""
echo "[1] API 및 증적 테이블"
HTTP=$(curl -s -o /tmp/.wipe_check_body -w "%{http_code}" "$BASE_URL/api/wipe" 2>/dev/null)
if [ "$HTTP" = "200" ]; then
  if head -c 1 /tmp/.wipe_check_body | grep -q '\['; then
    COUNT=$(python3 -c "import json;print(len(json.load(open('/tmp/.wipe_check_body'))))" 2>/dev/null || echo "?")
    ok "증적 API 정상 (등록된 증적 ${COUNT}건) - 테이블이 존재하고 조회됩니다"
  else
    bad "증적 API가 200을 반환했지만 응답이 JSON 배열이 아닙니다"
  fi
elif [ "$HTTP" = "500" ]; then
  bad "증적 API 500 오류 - 테이블이 없을 가능성이 높습니다. 백엔드 로그에서 'WipeSchemaInitializer' 확인 필요"
else
  bad "증적 API 응답 코드 $HTTP (백엔드/nginx 기동 상태 확인 필요)"
fi
rm -f /tmp/.wipe_check_body

# -----------------------------------------------------------------------------
# 2. 첨부파일 저장소 (도커 볼륨)
#    볼륨 마운트가 없으면 배포(down/up)할 때마다 증적 첨부파일이 전부 사라진다.
# -----------------------------------------------------------------------------
echo ""
echo "[2] 첨부파일 저장소 (가장 중요)"
if ! command -v docker >/dev/null 2>&1; then
  warn "docker 명령을 찾을 수 없어 볼륨 점검을 건너뜁니다"
elif ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  bad "컨테이너 '$CONTAINER' 를 찾을 수 없습니다 (CONTAINER 환경변수로 이름 지정 가능)"
else
  MOUNT_SRC=$(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "'"$UPLOAD_PATH"'"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)
  if [ -n "$MOUNT_SRC" ]; then
    ok "업로드 경로가 호스트에 마운트됨 ($UPLOAD_PATH -> $MOUNT_SRC)"

    PROBE=".envcheck_$$"
    if docker exec "$CONTAINER" sh -c "touch $UPLOAD_PATH/$PROBE" 2>/dev/null; then
      ok "컨테이너에서 업로드 경로에 쓰기 가능"
      if [ -e "$MOUNT_SRC/$PROBE" ]; then
        ok "컨테이너에 쓴 파일이 호스트에도 보임 (볼륨이 실제로 동작함)"
      else
        bad "컨테이너에는 썼지만 호스트에 보이지 않습니다 (마운트가 정상 동작하지 않음)"
      fi
      docker exec "$CONTAINER" sh -c "rm -f $UPLOAD_PATH/$PROBE" 2>/dev/null
    else
      bad "컨테이너에서 업로드 경로에 쓸 수 없습니다 (권한 확인 필요)"
    fi
  else
    bad "업로드 경로($UPLOAD_PATH)에 볼륨이 마운트되어 있지 않습니다 -> 재배포 시 증적 첨부파일이 모두 사라집니다"
  fi
fi

# -----------------------------------------------------------------------------
# 3. 업로드 용량 제한 (nginx)
#    nginx 기본값은 1MB 라서 스크린샷 첨부가 대부분 실패한다.
#    존재하지 않는 증적 번호로 보내므로 데이터는 생성되지 않는다.
#    - 413 이면 nginx 에서 막힌 것
#    - 그 외(400/404/500 등)면 nginx 는 통과해 애플리케이션까지 도달한 것
# -----------------------------------------------------------------------------
echo ""
echo "[3] 업로드 용량 제한"
TMPFILE=$(mktemp /tmp/wipe_size_check_XXXXXX.png)
head -c 5000000 /dev/urandom > "$TMPFILE"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$BASE_URL/api/wipe/99999999/files" \
  -F "file=@$TMPFILE;type=image/png" 2>/dev/null)
rm -f "$TMPFILE"

if [ "$HTTP" = "413" ]; then
  bad "5MB 업로드가 413(Request Entity Too Large)로 거부됨 -> nginx 에 'client_max_body_size 60m;' 설정 필요"
elif [ -z "$HTTP" ] || [ "$HTTP" = "000" ]; then
  bad "업로드 요청이 실패했습니다 (연결 불가)"
else
  ok "5MB 업로드가 nginx 를 통과함 (응답 $HTTP - 존재하지 않는 증적이라 거부되는 것이 정상)"
fi

# -----------------------------------------------------------------------------
# 4. 증적 관련 환경변수
# -----------------------------------------------------------------------------
echo ""
echo "[4] 환경변수 설정"
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  ENVS=$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null)

  UPLOAD_ENV=$(echo "$ENVS" | grep '^APP_WIPE_UPLOAD_DIR=' | cut -d= -f2-)
  if [ -n "$UPLOAD_ENV" ]; then
    ok "APP_WIPE_UPLOAD_DIR=$UPLOAD_ENV"
  else
    warn "APP_WIPE_UPLOAD_DIR 미설정 - 기본값(uploads/wipe, 컨테이너 작업경로 기준)이 사용됩니다"
  fi

  YEARS=$(echo "$ENVS" | grep '^APP_WIPE_RETENTION_YEARS=' | cut -d= -f2-)
  if [ -n "$YEARS" ]; then
    ok "APP_WIPE_RETENTION_YEARS=$YEARS (보관기한 ${YEARS}년)"
  else
    warn "APP_WIPE_RETENTION_YEARS 미설정 - 기본값 3년이 사용됩니다"
  fi

  # 운영에서 스택트레이스를 노출하면 내부 구조가 사용자 화면까지 드러난다
  if echo "$ENVS" | grep -q '^SERVER_ERROR_INCLUDE_STACKTRACE=always'; then
    warn "SERVER_ERROR_INCLUDE_STACKTRACE=always - 오류 시 스택트레이스가 사용자에게 노출됩니다 (운영에서는 제거 권장)"
  fi
else
  warn "컨테이너를 찾을 수 없어 환경변수 점검을 건너뜁니다"
fi

# -----------------------------------------------------------------------------
# 결과
# -----------------------------------------------------------------------------
echo ""
echo "============================================================"
echo " 결과: 통과 $PASS / 실패 $FAIL / 경고 $WARN"
if [ "$FAIL" -gt 0 ]; then
  echo " => 실패 항목을 해결해야 증적 기능이 정상 동작합니다."
  echo "    조치 방법은 README.md 의 배포 섹션을 참고하세요."
else
  echo " => 증적 기능 동작에 필요한 조건이 모두 충족되었습니다."
fi
echo "============================================================"

[ "$FAIL" -gt 0 ] && exit 1
exit 0
