#!/bin/bash
# =============================================================================
# 운영서버 배포 스크립트 (배포 패키지 안에 포함되어 함께 전달됨)
#
# 개발서버에서 만든 패키지를 풀고 이 스크립트를 실행하면
#   패키지 -> /srv/staging(SOURCE) -> /opt/it-asset(TARGET) -> 컨테이너 재빌드
# 까지 한 번에 처리한다.
#
# 기존 update.sh 대비 달라진 점:
#   - jar 를 build/libs 와 평평한 경로 양쪽에 두어 Dockerfile 구성과 무관하게 반영되도록 함
#     (update.sh 는 평평한 경로에만 복사해서, Dockerfile 이 build/libs 를 참조하면 옛 jar 가 배포될 수 있음)
#   - backend/uploads(증적 첨부파일)는 절대 건드리지 않음
#   - 단계별 실패 시 즉시 중단
#   - docker compose down 을 하지 않아 서비스 중단 시간을 수 초로 단축
#   - docker-compose.yml / nginx 설정은 손대지 않음 (운영 고유 설정 보존)
#
# 사용법:
#   ./deploy-on-prod.sh
#   SOURCE_DIR=/경로 TARGET_DIR=/경로 ./deploy-on-prod.sh
# =============================================================================
set -e

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-/srv/staging}"
TARGET_DIR="${TARGET_DIR:-/opt/it-asset}"

echo "============================================================"
echo " 운영 배포"
echo "   패키지 : $BUNDLE_DIR"
echo "   스테이징: $SOURCE_DIR"
echo "   배포위치: $TARGET_DIR"
echo "============================================================"
[ -f "$BUNDLE_DIR/BUILD-INFO.txt" ] && sed 's/^/   /' "$BUNDLE_DIR/BUILD-INFO.txt"
echo ""

# ---------------------------------------------------------------- 사전 점검
echo "[1/5] 사전 점검"
[ -f "$TARGET_DIR/docker-compose.yml" ] || { echo "  [중단] $TARGET_DIR/docker-compose.yml 이 없습니다. TARGET_DIR 을 확인하세요."; exit 1; }
[ -d "$SOURCE_DIR/frontend" ] || { echo "  [중단] $SOURCE_DIR/frontend 가 없습니다. SOURCE_DIR 을 확인하세요."; exit 1; }
[ -f "$BUNDLE_DIR/backend/backend-0.0.1-SNAPSHOT.jar" ] || { echo "  [중단] 패키지에 jar 가 없습니다."; exit 1; }
[ -d "$BUNDLE_DIR/frontend/.next" ] || { echo "  [중단] 패키지에 프론트 빌드 결과가 없습니다."; exit 1; }

if ! grep -q 'APP_WIPE_UPLOAD_DIR' "$TARGET_DIR/docker-compose.yml" 2>/dev/null; then
  echo "  [경고] 증적 기능 설정이 아직 적용되지 않았습니다."
  echo "         먼저 migration/setup-prod-wipe.sh 를 실행하세요. (첨부파일 유실 방지)"
  read -r -p "         그래도 계속 진행할까요? [y/N] " ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "  중단합니다."; exit 1; }
fi
echo "      통과"

# ---------------------------------------------------------------- 스테이징
echo "[2/5] 스테이징 폴더 갱신 ($SOURCE_DIR)"
# Dockerfile 이 어느 경로를 참조하든 새 jar 가 반영되도록 양쪽에 배치한다
mkdir -p "$SOURCE_DIR/backend/build/libs"
cp -f "$BUNDLE_DIR/backend/backend-0.0.1-SNAPSHOT.jar" "$SOURCE_DIR/backend/build/libs/"
cp -f "$BUNDLE_DIR/backend/backend-0.0.1-SNAPSHOT.jar" "$SOURCE_DIR/backend/"
echo "      백엔드 jar 갱신 (build/libs 와 backend/ 양쪽)"

rm -rf "$SOURCE_DIR/frontend/.next"
cp -a "$BUNDLE_DIR/frontend/.next"        "$SOURCE_DIR/frontend/"
cp -a "$BUNDLE_DIR/frontend/public"       "$SOURCE_DIR/frontend/" 2>/dev/null || true
cp -f "$BUNDLE_DIR/frontend/package.json" "$SOURCE_DIR/frontend/"
[ -f "$BUNDLE_DIR/frontend/server.js" ] && cp -f "$BUNDLE_DIR/frontend/server.js" "$SOURCE_DIR/frontend/"
echo "      프론트엔드 빌드 결과 갱신 (node_modules 는 유지)"

# ---------------------------------------------------------------- 배포 위치로 복사
echo "[3/5] 배포 위치로 복사 ($TARGET_DIR)"
mkdir -p "$TARGET_DIR/backend/build/libs"
cp -f "$SOURCE_DIR/backend/build/libs/backend-0.0.1-SNAPSHOT.jar" "$TARGET_DIR/backend/build/libs/"
cp -f "$SOURCE_DIR/backend/backend-0.0.1-SNAPSHOT.jar"            "$TARGET_DIR/backend/"

# 프론트엔드는 옛 파일이 남지 않도록 비우고 복사한다.
# (backend/uploads 는 증적 첨부파일이 있으므로 절대 지우지 않는다)
find "$TARGET_DIR/frontend" -mindepth 1 -maxdepth 1 ! -name 'Dockerfile' ! -name 'node_modules' -exec rm -rf {} +
cp -a "$SOURCE_DIR/frontend/." "$TARGET_DIR/frontend/"

command -v restorecon >/dev/null 2>&1 && restorecon -R "$TARGET_DIR" >/dev/null 2>&1 || true
chmod -R 755 "$TARGET_DIR/frontend" >/dev/null 2>&1 || true
echo "      복사 완료 (backend/uploads 는 보존됨)"

# ---------------------------------------------------------------- 재빌드
echo "[4/5] 컨테이너 재빌드 및 기동"
cd "$TARGET_DIR"
docker compose up -d --build

# ---------------------------------------------------------------- 확인
echo "[5/5] 상태 확인"
sleep 10
docker compose ps --format "      {{.Name}}  {{.Status}}" 2>/dev/null || docker compose ps

echo ""
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/api/employees 2>/dev/null || echo "000")
if [ "$HTTP" = "200" ]; then
  echo "      API 정상 응답 (HTTP 200)"
else
  echo "      [경고] API 응답 코드 $HTTP - 로그 확인 필요:"
  echo "             docker compose -f $TARGET_DIR/docker-compose.yml logs --tail 50 backend"
fi

echo ""
echo "============================================================"
echo " 배포 완료"
echo "   증적 기능 점검: $BUNDLE_DIR/migration/check-wipe-env.sh"
echo "   브라우저에서는 Ctrl + Shift + R 로 강력 새로고침하세요."
echo "============================================================"
