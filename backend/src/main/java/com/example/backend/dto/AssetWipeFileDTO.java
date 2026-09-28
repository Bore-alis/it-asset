package com.example.backend.dto;

import lombok.Data;

import java.time.LocalDateTime;

// 초기화 증적에 첨부된 파일 1건 (초기화 완료 화면 스크린샷 등).
// storedName 은 서버에 실제로 저장된 파일명(UUID 기반)이며, 원본 파일명은 화면 표시용으로만 쓴다.
@Data
public class AssetWipeFileDTO {
    private Integer fileId;
    private Integer wipeId;
    private String originalName;
    private String storedName;
    private String contentType;
    private Long fileSize;
    private LocalDateTime uploadedAt;
}
