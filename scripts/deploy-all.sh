#!/bin/bash
# =============================================================================
# 운영서버 원클릭 배포 (운영서버 /srv 에서 실행)
#
#   0) 현재 실행 중인 jar 백업 (롤백 지점)
#   1) 배포 패키지 압축 해제
#   2) 증적 기능 설정 적용 (이미 적용됐으면 자동으로 건너뜀)
#   3) 배포 및 컨테이너 재빌드
#   4) 검증 (jar 반영 여부 · 증적 환경 · API 응답)
#
# 사용법:
#   ./deploy-all.sh                 # /srv 또는 /srv/upload 의 최신 패키지 사용
#   ./deploy-all.sh -y              # 확인 프롬프트 없이 진행
#   ./deploy-all.sh 패키지.tar.gz    # 패키지를 직접 지정
# =============================================================================
set -e

WORK_ROOT="${WORK_ROOT:-/srv/upload}"   # 패키지 압축을 푸는 작업 폴더
BACKUP_DIR="${BACKUP_DIR:-/srv/backup}"  # 롤백용 jar 와 설정 원본 백업 보관 폴더
TARGET_DIR="${TARGET_DIR:-/opt/it-asset}"
SOURCE_DIR="${SOURCE_DIR:-/srv/staging}"
CONTAINER="${CONTAINER:-it-asset-backend-1}"
STAMP=$(date +%Y%m%d_%H%M%S)

ASSUME_YES=0
if [ "$1" = "-y" ]; then ASSUME_YES=1; shift; fi
BUNDLE_TGZ="$1"

echo "============================================================"
echo " 운영서버 배포"
echo "============================================================"

# ---------------------------------------------------------------- 패키지 찾기
# 이 스크립트가 있는 폴더 -> /srv -> 작업 폴더 순으로 가장 최근 패키지를 찾는다
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "$BUNDLE_TGZ" ]; then
  # 전송 과정에서 .gz 가 벗겨져 .tar 로 저장되는 경우가 있어 둘 다 찾는다
  BUNDLE_TGZ=$(ls -t "$SCRIPT_DIR"/prod-bundle_*.tar.gz "$SCRIPT_DIR"/prod-bundle_*.tar \
                     /srv/prod-bundle_*.tar.gz /srv/prod-bundle_*.tar \
                     "$WORK_ROOT"/prod-bundle_*.tar.gz "$WORK_ROOT"/prod-bundle_*.tar 2>/dev/null | head -1)
fi
[ -n "$BUNDLE_TGZ" ] && [ -f "$BUNDLE_TGZ" ] || {
  echo "[중단] 배포 패키지(prod-bundle_*.tar.gz 또는 .tar)를 찾을 수 없습니다."
  echo "       /srv 또는 $WORK_ROOT 에 업로드했는지 확인하세요."
  exit 1
}

# ---------------------------------------------------------------- 사전 점검
[ -f "$TARGET_DIR/docker-compose.yml" ] || { echo "[중단] $TARGET_DIR/docker-compose.yml 이 없습니다."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "[중단] docker 명령을 찾을 수 없습니다."; exit 1; }

BEFORE_JAR=$(docker exec "$CONTAINER" ls -l /app/app.jar 2>/dev/null | awk '{print $5}' || echo "확인불가")

echo " 패키지   : $BUNDLE_TGZ"
echo " 배포위치 : $TARGET_DIR"
echo " 현재 실행 중인 jar 크기 : $BEFORE_JAR bytes"
echo "------------------------------------------------------------"
echo " 이 작업은 컨테이너를 재빌드하므로 1~2분간 서비스가 불안정할 수 있습니다."

if [ "$ASSUME_YES" != "1" ]; then
  read -r -p " 진행할까요? [y/N] " ans
  case "$ans" in y|Y) ;; *) echo " 중단합니다."; exit 0;; esac
fi
echo ""

# ---------------------------------------------------------------- 0) 롤백 백업
echo "[0/4] 롤백용 jar 백업"
mkdir -p "$BACKUP_DIR"
ROLLBACK_JAR="$BACKUP_DIR/rollback_$STAMP.jar"
if [ -f "$TARGET_DIR/backend/build/libs/backend-0.0.1-SNAPSHOT.jar" ]; then
  cp -a "$TARGET_DIR/backend/build/libs/backend-0.0.1-SNAPSHOT.jar" "$ROLLBACK_JAR"
  echo "      $ROLLBACK_JAR ($(du -h "$ROLLBACK_JAR" | cut -f1))"
else
  echo "      [경고] 기존 jar 를 찾지 못해 백업을 건너뜁니다."
  ROLLBACK_JAR=""
fi

# ---------------------------------------------------------------- 1) 압축 해제
echo "[1/4] 패키지 압축 해제"
mkdir -p "$WORK_ROOT"
# -xf 는 gzip 압축 여부를 자동 판별하므로 .tar / .tar.gz 모두 처리된다
tar -xf "$BUNDLE_TGZ" -C "$WORK_ROOT"
# 폴더 이름은 파일명이 아니라 아카이브 내용에서 가져온다 (확장자가 바뀌어도 안전)
BUNDLE_TOP=$(tar -tf "$BUNDLE_TGZ" 2>/dev/null | head -1 | cut -d/ -f1)
BUNDLE_DIR="$WORK_ROOT/$BUNDLE_TOP"
[ -d "$BUNDLE_DIR" ] || { echo "[중단] 압축 해제 결과를 찾을 수 없습니다: $BUNDLE_DIR"; exit 1; }
chmod +x "$BUNDLE_DIR"/*.sh "$BUNDLE_DIR"/migration/*.sh 2>/dev/null || true
sed -i 's/\r$//' "$BUNDLE_DIR"/*.sh "$BUNDLE_DIR"/migration/*.sh 2>/dev/null || true
echo "      $BUNDLE_DIR"
[ -f "$BUNDLE_DIR/BUILD-INFO.txt" ] && sed 's/^/      /' "$BUNDLE_DIR/BUILD-INFO.txt"

# ---------------------------------------------------------------- 2) 증적 설정
echo "[2/4] 증적 기능 설정 확인 및 적용"
TARGET="$TARGET_DIR" BACKUP_DIR="$BACKUP_DIR" "$BUNDLE_DIR/migration/setup-prod-wipe.sh" 2>&1 | grep -E '^\s+\[(적용|건너뜀|실패)\]|^\[백업\]' | sed 's/^/      /' || true

# ---------------------------------------------------------------- 3) 배포
echo "[3/4] 배포 및 컨테이너 재빌드"
if ! SOURCE_DIR="$SOURCE_DIR" TARGET_DIR="$TARGET_DIR" "$BUNDLE_DIR/deploy-on-prod.sh" < /dev/null; then
  echo ""
  echo "============================================================"
  echo " [실패] 배포 중 오류가 발생했습니다."
  [ -n "$ROLLBACK_JAR" ] && {
    echo " 되돌리려면:"
    echo "   cp -a $ROLLBACK_JAR $TARGET_DIR/backend/build/libs/backend-0.0.1-SNAPSHOT.jar"
    echo "   cp -a $ROLLBACK_JAR $TARGET_DIR/backend/backend-0.0.1-SNAPSHOT.jar"
    echo "   cd $TARGET_DIR && docker compose up -d --build"
  }
  echo "============================================================"
  exit 1
fi

# ---------------------------------------------------------------- 4) 검증
echo ""
echo "[4/4] 배포 검증"

AFTER_JAR=$(docker exec "$CONTAINER" ls -l /app/app.jar 2>/dev/null | awk '{print $5}' || echo "확인불가")
echo "      실행 중인 jar : $BEFORE_JAR -> $AFTER_JAR bytes"
if [ "$BEFORE_JAR" = "$AFTER_JAR" ]; then
  echo "      [경고] jar 크기가 그대로입니다. 새 코드가 반영되지 않았을 수 있습니다."
else
  echo "      새 jar 가 정상 반영되었습니다."
fi

echo ""
CONTAINER="$CONTAINER" "$BUNDLE_DIR/migration/check-wipe-env.sh" 2>&1 | sed -n '/^\[/,$p' | sed 's/^/      /'

echo ""
echo "============================================================"
echo " 배포 완료"
echo "   백업 폴더  : $BACKUP_DIR"
echo "     - 롤백용 jar : ${ROLLBACK_JAR:-없음}"
echo "     - 설정 원본  : $BACKUP_DIR/docker-compose.yml.bak_* , nginx-default.conf.bak_*"
echo ""
echo " 브라우저에서 Ctrl + Shift + R 로 강력 새로고침 후 아래를 확인하세요."
echo "   - 로그인 / 자산 관리 대장 / 처리 이력"
echo "   - 사이드바에 '퇴직자 증적' 메뉴가 보이는지"
echo "============================================================"
