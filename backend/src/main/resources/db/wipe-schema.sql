-- 퇴직자 IT자산(노트북/PC) 초기화 증적 테이블
-- 애플리케이션 기동 시 WipeSchemaInitializer 가 실행한다. (없을 때만 생성되므로 반복 실행해도 안전)
-- 운영 DB에 수동으로 적용하고 싶다면 이 파일을 그대로 psql 로 실행해도 된다.
--
-- 주의: employees / assets 로의 FK를 일부러 걸지 않는다.
--       사원 정보나 자산이 삭제되어도 3년 보관 의무가 있는 증적은 독립적으로 남아야 하므로,
--       사원명 · 소속 · 모델명 · S/N 은 참조가 아니라 생성 시점의 스냅샷 값으로 보관한다.

CREATE TABLE IF NOT EXISTS asset_wipe_records (
    wipe_id        SERIAL PRIMARY KEY,
    asset_id       VARCHAR(50)  NOT NULL,
    employee_id    VARCHAR(50),
    employee_name  VARCHAR(50),
    department     VARCHAR(160),
    asset_category VARCHAR(50),
    asset_model    VARCHAR(100),
    serial_number  VARCHAR(100),
    status         VARCHAR(20)  NOT NULL DEFAULT '대기',
    wipe_method    VARCHAR(50),
    performed_by   VARCHAR(100),
    note           VARCHAR(500),
    retired_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    wiped_at       TIMESTAMP,
    expires_at     TIMESTAMP,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wipe_status  ON asset_wipe_records(status);
CREATE INDEX IF NOT EXISTS idx_wipe_expires ON asset_wipe_records(expires_at);
CREATE INDEX IF NOT EXISTS idx_wipe_asset   ON asset_wipe_records(asset_id);

CREATE TABLE IF NOT EXISTS asset_wipe_files (
    file_id       SERIAL PRIMARY KEY,
    wipe_id       INTEGER      NOT NULL REFERENCES asset_wipe_records(wipe_id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    stored_name   VARCHAR(255) NOT NULL,
    content_type  VARCHAR(100),
    file_size     BIGINT,
    uploaded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wipe_files_wipe ON asset_wipe_files(wipe_id);
