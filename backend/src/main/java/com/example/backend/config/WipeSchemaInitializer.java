package com.example.backend.config;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;

// 초기화 증적 테이블이 없으면 기동 시 자동으로 만든다.
// 운영 서버로 배포할 때 DDL 실행을 따로 챙기지 않아도 되도록 하기 위함이며,
// 스크립트가 전부 CREATE ... IF NOT EXISTS 라 매번 실행돼도 기존 데이터에는 영향이 없다.
//
// 실패해도 애플리케이션은 계속 뜬다: 증적 기능 하나 때문에 자산 대장 전체가 멈추는 편이 더 나쁘기 때문.
// 대신 에러 로그를 남기므로, 그 경우 db/wipe-schema.sql 을 수동으로 실행하면 된다.
@Component
@RequiredArgsConstructor
public class WipeSchemaInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(WipeSchemaInitializer.class);
    private static final String SCHEMA_LOCATION = "db/wipe-schema.sql";

    private final DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) {
        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection,
                    new EncodedResource(new ClassPathResource(SCHEMA_LOCATION), StandardCharsets.UTF_8));
            log.info("초기화 증적 테이블 확인 완료 ({} 적용)", SCHEMA_LOCATION);
        } catch (Exception e) {
            log.error("초기화 증적 테이블 자동 생성 실패. {} 를 DB에 수동으로 실행해주세요. (원인: {})",
                    SCHEMA_LOCATION, e.getMessage(), e);
        }
    }
}
