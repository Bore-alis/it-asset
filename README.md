# IT 자산 관리 시스템

엑셀로 관리하던 업무용 장비(노트북, PC, 모니터 등)의 **지급·회수·교체 이력**과
**퇴직자 장비 초기화 증적**을 웹에서 관리하도록 만든 사내 시스템입니다.

| | |
|---|---|
| 기간 | 2026.04 ~ 2026.09 |
| 역할 | 1인 개발 (요구사항 정리, 백엔드, 프론트엔드, 배포 자동화, 운영) |
| 기술 | Spring Boot · MyBatis · PostgreSQL · Next.js · TypeScript · Docker · nginx |

## 주요 기능

| 화면 | 기능 |
|---|---|
| 대시보드 | 분류별 보유·사용·재고 현황, 모델별 분포 |
| 자산 관리 대장 | 자산 등록·수정·상태 변경, 엑셀 일괄 등록, 자산별 이력 |
| 임직원 현황 | 사원 등록, 3단계 조직도(드래그 정렬), 자산 지급·교체, 휴직·복직·퇴사 처리 |
| 처리 이력 | 지급·회수·교체 이력 조회, 사용자 안내 메일(HTML) 발송 |
| 퇴직자 증적 | 퇴사 시 노트북·PC 초기화 증적 자동 생성, 스크린샷 첨부, 3년 보관 후 자동 파기 |
| NAS 권한 관리 | Synology NAS 공유 폴더별 AD 그룹 권한과 구성원 조회 |

로그인은 Active Directory(LDAP) 계정을 사용하며, 지정된 OU에 속한 사용자만 접근할 수 있습니다.

## 아키텍처

```
브라우저
  │ HTTPS
로드밸런서 ─── TLS 종료, 출처 제어
  │ HTTP
nginx :8001 ─┬─ /api/*  → Spring Boot :8080 ─┬─ PostgreSQL
             │                               ├─ Active Directory (LDAP)
             │                               ├─ SMTP
             │                               └─ Synology NAS Web API
             └─ /*      → Next.js    :3000
```

| 구분 | 기술 |
|---|---|
| Backend | Java 17, Spring Boot 4, MyBatis, Spring Mail, JNDI(LDAP) |
| Frontend | Next.js 16 (App Router, standalone), React 19, TypeScript, Tailwind CSS 4, SheetJS |
| DB | PostgreSQL |
| Infra | Docker Compose, nginx, Bash 배포 스크립트 |

## 설계 포인트

**증적은 원본 데이터와 수명이 다르게 설계했습니다.**
초기화 증적은 3년간 보관해야 하지만 사원·자산 정보는 그보다 먼저 삭제될 수 있습니다.
그래서 증적 테이블에는 외래키를 두지 않고, 사원명·소속·모델·S/N을 생성 시점의 스냅샷으로 저장했습니다.
→ [wipe-schema.sql](backend/src/main/resources/db/wipe-schema.sql)

**되돌릴 수 없는 자동 파기는 흔적을 남깁니다.**
보관기한이 지난 증적은 DB 행과 첨부파일을 함께 삭제하고, 삭제 내역을 건별로 로그에 기록합니다.
아직 초기화하지 않은 '대기' 건은 보관기한이 없어 파기 대상에서 제외됩니다.
→ [AssetWipeService.java](backend/src/main/java/com/example/backend/service/AssetWipeService.java)

**예외를 한 곳에서 처리해 트랜잭션 롤백을 보장했습니다.**
컨트롤러마다 `try/catch`로 500을 반환하던 구조에서는 `@Transactional` 롤백이 동작하지 않았습니다.
예외를 전파시키고 전역 핸들러에서 처리하도록 바꿨습니다.
→ [GlobalExceptionHandler.java](backend/src/main/java/com/example/backend/exception/GlobalExceptionHandler.java)

**보안 완화는 필요한 범위로만 제한했습니다.**
NAS의 자체 서명 인증서 때문에 TLS 검증을 생략해야 했지만, JVM 전역이 아니라 NAS 전용 `RestTemplate`에만 적용했습니다.
LDAP 검색 필터(RFC 4515)와 메일 HTML 본문에는 각각 이스케이프를 적용했습니다.

**SSH 없는 운영서버를 위한 원클릭 배포를 만들었습니다.**
운영서버에는 파일 전송만 가능했기 때문에, 번들 하나를 올리고 스크립트 하나로 백업 → 배포 → 검증까지 끝나도록 구성했습니다.
→ [scripts/](scripts)

구현 과정과 트러블슈팅은 [회고](docs/RETROSPECTIVE.md)에 자세히 정리했습니다.

## 보안 전제

사내망 전용 서비스라는 전제에서 아래와 같이 구성했습니다. 외부에 노출한다면 가장 먼저 보완해야 할 항목입니다.

| 항목 | 현재 구성 | 전제 |
|---|---|---|
| API 인증 | 로그인 후 API 호출에 토큰 검증 없음 | 사내망에서만 접근 |
| CORS | 전체 허용 | 로드밸런서에서 출처 제어 |
| HTTPS | 애플리케이션은 HTTP | 로드밸런서에서 TLS 종료 |

## 로컬 실행

```bash
cd backend && ./gradlew build -x test && cd ..
cd deploy
cp .env.example .env    # 접속 정보 입력
docker compose up -d --build
# http://localhost:8001
```

- 모든 접속 정보는 환경변수로 주입합니다. 설정 항목은 [.env.example](deploy/.env.example)을 참고하세요.
- 로그인하려면 접근 가능한 AD 서버가 필요합니다.
- [deploy/](deploy)의 compose, Dockerfile, DB 스키마는 로컬 실행용 구성입니다. 운영 배포 흐름은 [scripts/](scripts)를 참고하세요.

## 디렉터리

```
backend/    Spring Boot API (controller / service / mapper / dto / config)
frontend/   Next.js 화면 (app/ 아래 페이지별 폴더)
deploy/     로컬 실행용 docker-compose, nginx, DB 스키마
scripts/    운영 배포 스크립트 (번들 생성 → 업로드 → 원클릭 배포 → 환경 점검)
docs/       사용자 매뉴얼, 회고
```
