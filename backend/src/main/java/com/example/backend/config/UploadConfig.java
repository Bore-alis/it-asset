package com.example.backend.config;

import jakarta.servlet.MultipartConfigElement;
import org.springframework.boot.servlet.MultipartConfigFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.unit.DataSize;

// 초기화 증적 스크린샷 업로드용 용량 설정.
// 스프링 기본값은 파일 1MB / 요청 10MB 라서 스크린샷 몇 장이면 바로 막힌다.
// application.properties 를 건드리지 않고 코드로 지정해 어느 환경에서든 동일하게 적용되도록 한다.
// (nginx 쪽 client_max_body_size 도 함께 늘려야 실제로 통과된다.)
@Configuration
public class UploadConfig {

    @Bean
    public MultipartConfigElement multipartConfigElement() {
        MultipartConfigFactory factory = new MultipartConfigFactory();
        factory.setMaxFileSize(DataSize.ofMegabytes(20));
        factory.setMaxRequestSize(DataSize.ofMegabytes(60));
        return factory.createMultipartConfig();
    }
}
