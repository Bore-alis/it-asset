package com.example.backend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Data
@Configuration
@ConfigurationProperties(prefix = "synology.nas")
public class SynologyNasProperties {

    // properties 파일의 synology.nas.devices 와 매핑됩니다.
    private List<Device> devices;

    @Data
    public static class Device {
        private String name;      // 예: TEAM-NAS
        private String url;       // 예: https://nas.example.local:5001
        private String username;  // NAS 관리자 계정
        private String password;
    }
}