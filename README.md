# IT 자산 관리 시스템

사내 IT 담당 부서가 엑셀로 관리하던 **업무용 장비(노트북·PC·모니터 등)의 지급·회수·교체 이력**과
**퇴직자 장비 초기화 증적**을 웹으로 옮긴 사내 시스템입니다.

- 기간: 2026.04 ~ 2026.09
- 역할: 1인 개발 — 요구사항 정리, 백엔드, 프론트엔드, 배포 자동화, 운영

> 실제 회사 환경에서 운영 중인 시스템을 포트폴리오용으로 옮긴 저장소입니다.
> 회사명, 내부 IP, 도메인, 조직 구조, 계정, 메일 주소, 서버 경로는 모두 제거하거나 예시 값으로 바꿨고,
> 접속 정보는 환경변수로만 주입하도록 바꿨습니다. ([비식별 처리](#비식별-처리))

## 주요 기능

| 화면 | 기능 |
|---|---|
| 대시보드 | 분류별 보유·사용·재고 현황, 세부 모델별 분포 |
| 자산 관리 대장 | 자산 등록, 수정, 상태 변경, 엑셀 일괄 등록(덮어쓰기), 자산별 이력 |
| 임직원 현황 | 사원 등록, 3단계 조직도(드래그 정렬), 자산 지급·교체, 휴직·복직·퇴사 처리 |
| 처리 이력 | 지급·회수·교체 이력 조회, 사용자에게 **안내 메일(HTML) 발송** |
| 퇴직자 증적 | 퇴사 시 노트북·PC의 **초기화 증적 자동 생성**, 스크린샷 첨부, **3년 보관 후 자동 파기** |
| NAS 권한 관리 | Synology NAS 공유 폴더별 AD 그룹 권한과 그룹 구성원 조회 |

로그인은 **사내 Active Directory(LDAP)** 계정으로 하며, 지정된 OU 소속만 접근할 수 있습니다.

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

## 설계에서 신경 쓴 부분

- **증적은 원본 데이터와 수명이 다르다.** 퇴직자 초기화 증적은 3년간 보관해야 하지만 사원·자산 정보는 그 전에 지워질 수 있습니다.
  그래서 증적 테이블에는 외래키를 걸지 않고 사원명·소속·모델·S/N을 **생성 시점 스냅샷**으로 저장했습니다. ([wipe-schema.sql](backend/src/main/resources/db/wipe-schema.sql))
- **자동 파기는 되돌릴 수 없다.** 만료 건은 DB 행과 디스크 파일을 함께 지우고, 무엇을 지웠는지 건별로 로그를 남깁니다.
  아직 초기화 전인 '대기' 건은 보관기한이 없으므로 파기 대상에서 빠집니다. ([AssetWipeService.java](backend/src/main/java/com/example/backend/service/AssetWipeService.java))
- **예외는 삼키지 않고 전파한다.** 컨트롤러마다 `try/catch`로 500을 돌려주던 구조에서는 `@Transactional` 롤백이 일어나지 않았습니다.
  예외 처리를 [GlobalExceptionHandler](backend/src/main/java/com/example/backend/exception/GlobalExceptionHandler.java)로 모아 롤백이 동작하도록 했습니다.
- **보안 완화는 범위를 좁게 둔다.** 사내 NAS의 자체 서명 인증서 때문에 TLS 검증을 생략하지만, JVM 전역이 아니라 NAS 전용 `RestTemplate`에만 적용했습니다.
- **입력이 들어가는 곳은 이스케이프한다.** LDAP 검색 필터(RFC 4515)와 메일 HTML 본문에 각각 이스케이프를 적용했습니다.
- **SSH 없이 배포한다.** 운영서버에는 파일 전송만 가능해서, 번들 하나를 올리고 스크립트 하나로 백업·배포·검증까지 끝나도록 만들었습니다. ([scripts/](scripts))

자세한 과정과 트러블슈팅은 [회고 문서](docs/RETROSPECTIVE.md)에 정리했습니다.

## 보안 전제

이 시스템은 **사내망 전용**이라는 전제로 다음을 선택했습니다. 외부에 공개한다면 먼저 바꿔야 할 항목입니다.

| 항목 | 현재 | 전제 |
|---|---|---|
| API 인증 | 로그인 후 API 호출에 토큰 검증 없음 | 사내망에서만 접근 가능 |
| CORS | 전체 허용 | 로드밸런서에서 출처 제어 |
| HTTPS | 애플리케이션은 평문 HTTP | 로드밸런서에서 TLS 종료 |

## 로컬 실행

```bash
cd backend && ./gradlew build -x test && cd ..
cd deploy
cp .env.example .env    # 값 채우기
docker compose up -d --build
# http://localhost:8001
```

- 로그인은 실제 AD가 있어야 동작합니다. AD 없이 화면만 보려면 `.env`의 LDAP 값을 테스트용 서버로 바꿔야 합니다.
- 기본 테이블 DDL([deploy/db/init.sql](deploy/db/init.sql))은 원래 없던 파일입니다. 매퍼 쿼리를 보고 역으로 작성했습니다.
- `deploy/` 아래의 Dockerfile과 compose는 데모용으로 새로 작성했습니다. 실제 운영 구성은 [scripts/](scripts)의 배포 흐름을 참고하세요.

## 디렉터리

```
backend/    Spring Boot API (controller / service / mapper / dto / config)
frontend/   Next.js 화면 (app/ 아래 페이지별 폴더)
deploy/     데모용 docker-compose, nginx, DB 초기화 스크립트
scripts/    운영 배포 스크립트 (번들 생성 → 업로드 → 원클릭 배포 → 환경 점검)
docs/       사용자 매뉴얼, 회고
```

## 비식별 처리

원본에서 다음을 바꾸거나 뺐습니다.

- AD 서버 주소, 도메인, 허용 OU → `app.ldap.*` 설정값 (환경변수 주입)
- 메일 고정 참조 주소 → `app.mail.cc` 설정값
- DB, SMTP, NAS 접속 정보 → 환경변수만 사용, 저장소에는 예시 값만 있음
- 서버 경로, 컨테이너 이름 → `/opt/it-asset`, `/srv/...` 같은 일반 경로
- 조직명, 장비명 등 → 예시 값
- 로그, 빌드 결과물, 배포 번들, 운영 관리자 가이드 → 제외
