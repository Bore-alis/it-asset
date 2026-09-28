#!/bin/bash
# =============================================================================
# 운영 배포용 패키지 생성 (개발서버에서 실행)
#
# 빌드 후 운영에 필요한 파일만 골라 tar.gz 하나로 묶는다.
# FileZilla 로 이 파일 하나만 옮기면 되므로, 폴더째 끌어다 놓는 것보다
# 훨씬 빠르고 전송 누락도 생기지 않는다.
#
# 사용법:
#   ./make-prod-bundle.sh              # 빌드부터 새로 수행
#   ./make-prod-bundle.sh --skip-build # 이미 빌드된 산출물로 묶기만
# =============================================================================
set -e

SRC="${SRC:-/srv/it-asset}"
OUT_DIR="${OUT_DIR:-$SRC/dist}"
STAMP=$(date +%Y%m%d_%H%M)
NAME="prod-bundle_$STAMP"
WORK="$OUT_DIR/$NAME"

echo "============================================================"
echo " 운영 배포 패키지 생성"
echo "============================================================"

# ---------------------------------------------------------------- 빌드
if [ "$1" = "--skip-build" ]; then
  echo "[1/4] 빌드 건너뜀 (--skip-build)"
else
  echo "[1/4] 백엔드 빌드 중..."
  (cd "$SRC/backend" && ./gradlew clean build -x test -q) || { echo "  [중단] 백엔드 빌드 실패"; exit 1; }
  echo "      완료"
  echo "      프론트엔드 빌드 중..."
  (cd "$SRC/frontend" && npm run build > /dev/null) || { echo "  [중단] 프론트엔드 빌드 실패"; exit 1; }
  echo "      완료"
fi

JAR=$(ls "$SRC"/backend/build/libs/*SNAPSHOT.jar 2>/dev/null | grep -v plain | head -1)
[ -f "$JAR" ] || { echo "[중단] 빌드된 jar 를 찾을 수 없습니다"; exit 1; }
[ -d "$SRC/frontend/.next" ] || { echo "[중단] 프론트엔드 빌드 결과(.next)가 없습니다"; exit 1; }

# ---------------------------------------------------------------- 수집
echo "[2/4] 필요한 파일 수집 중..."
rm -rf "$WORK"
mkdir -p "$WORK/backend" "$WORK/frontend" "$WORK/migration"

# 백엔드 jar 는 한 벌만 담는다.
# (Dockerfile 이 build/libs 를 보든 평평한 경로를 보든 상관없도록,
#  배포 시 deploy-on-prod.sh 가 양쪽 경로에 배치한다 - 전송량 26M 절감)
cp "$JAR" "$WORK/backend/backend-0.0.1-SNAPSHOT.jar"

# 프론트엔드: 런타임에 필요한 것만.
#   - .next/cache            : 빌드 캐시라 불필요
#   - .next/standalone/node_modules : 운영 frontend/node_modules 와 중복(50M)이라 제외
tar -C "$SRC/frontend" -cf - \
    --exclude='.next/cache' \
    --exclude='.next/standalone/node_modules' \
    .next public package.json | tar -C "$WORK/frontend" -xf -

# standalone 서버 스크립트를 프론트 루트용으로 갱신 (운영은 node server.js 로 구동)
if [ -f "$SRC/frontend/.next/standalone/server.js" ]; then
  cp "$SRC/frontend/.next/standalone/server.js" "$WORK/frontend/server.js"
fi

# 운영 설정/점검 스크립트와 문서
cp "$SRC/scripts/setup-prod-wipe.sh" "$SRC/scripts/check-wipe-env.sh" "$WORK/migration/"
[ -f "$SRC/docs/deploy-wipe-feature.md" ] && cp "$SRC/docs/deploy-wipe-feature.md" "$WORK/migration/"
cp "$SRC/scripts/deploy-on-prod.sh" "$WORK/"
# 원클릭 배포 스크립트는 패키지 밖(/srv)에서도 쓸 수 있도록 함께 넣어둔다
cp "$SRC/scripts/deploy-all.sh" "$WORK/"
chmod +x "$WORK"/*.sh "$WORK"/migration/*.sh

# 빌드 정보 기록 (나중에 어떤 빌드가 올라갔는지 추적용)
{
  echo "생성일시 : $(date '+%Y-%m-%d %H:%M:%S')"
  echo "생성서버 : $(hostname)"
  echo "jar      : $(basename "$JAR") ($(du -h "$JAR" | cut -f1))"
  echo "BUILD_ID : $(cat "$SRC/frontend/.next/BUILD_ID" 2>/dev/null || echo '-')"
} > "$WORK/BUILD-INFO.txt"

# ---------------------------------------------------------------- 압축
echo "[3/4] 압축 중..."
tar -C "$OUT_DIR" -czf "$OUT_DIR/$NAME.tar.gz" "$NAME"
rm -rf "$WORK"

echo "[4/4] 완료"
echo ""
echo "============================================================"
echo " 생성된 파일"
echo "   $OUT_DIR/$NAME.tar.gz  ($(du -h "$OUT_DIR/$NAME.tar.gz" | cut -f1))"
echo ""
echo " 다음 단계"
echo "   1) FileZilla 로 위 파일을 운영서버 /srv/upload/ 에 업로드"
echo "   2) 운영서버에서:"
echo "        cd /srv/upload"
echo "        tar -xzf $NAME.tar.gz"
echo "        cd $NAME"
echo "        ./deploy-on-prod.sh"
echo "============================================================"
