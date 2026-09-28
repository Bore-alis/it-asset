-- 기본 테이블 (데모용)
-- 원 프로젝트에는 기존 DB가 있었기 때문에 DDL이 없었다. MyBatis 매퍼(EmployeeMapper.xml)의
-- 쿼리를 기준으로 역으로 작성한 것이라 컬럼 길이 등은 실제와 다를 수 있다.
-- 증적 테이블(asset_wipe_*)은 백엔드 기동 시 WipeSchemaInitializer 가 자동 생성한다.

CREATE TABLE IF NOT EXISTS employees (
    employee_id  VARCHAR(50)  PRIMARY KEY,
    name         VARCHAR(50)  NOT NULL,
    department1  VARCHAR(100),
    department2  VARCHAR(100),
    department3  VARCHAR(100),
    rank         VARCHAR(50),
    email        VARCHAR(200),
    status       VARCHAR(20)  NOT NULL DEFAULT '재직'
);

CREATE TABLE IF NOT EXISTS employee_history (
    history_id   SERIAL PRIMARY KEY,
    employee_id  VARCHAR(50),
    action_type  VARCHAR(50),
    change_date  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS org_chart (
    id           SERIAL PRIMARY KEY,
    department1  VARCHAR(100),
    department2  VARCHAR(100),
    department3  VARCHAR(100),
    sort_order   INTEGER
);

CREATE TABLE IF NOT EXISTS assets (
    asset_id                 VARCHAR(50) PRIMARY KEY,
    category                 VARCHAR(50),
    model                    VARCHAR(100),
    serial_number            VARCHAR(100),
    accounting_ledger        VARCHAR(100),
    accounting_ledger_index  VARCHAR(50),
    status                   VARCHAR(20) NOT NULL DEFAULT '재고',
    current_user_id          VARCHAR(50),
    reason                   VARCHAR(500),
    purchase_date            VARCHAR(20),
    residual_value           VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS asset_history (
    history_id    SERIAL PRIMARY KEY,
    asset_id      VARCHAR(50),
    employee_id   VARCHAR(50),
    prev_user_id  VARCHAR(50),
    action_type   VARCHAR(30),
    status        VARCHAR(20),
    reason        VARCHAR(500),
    change_date   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assets_user        ON assets(current_user_id);
CREATE INDEX IF NOT EXISTS idx_asset_history_asset ON asset_history(asset_id);
