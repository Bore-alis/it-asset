package com.example.backend.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

// 퇴직자 IT자산 초기화 증적 1건.
// employees / assets 가 나중에 삭제되어도 증적은 3년간 남아 있어야 하므로,
// 사원명 · 소속 · 모델명 · S/N 은 FK 참조가 아니라 생성 시점의 스냅샷 값으로 보관한다.
@Data
public class AssetWipeDTO {
    public static final String STATUS_PENDING = "대기";
    public static final String STATUS_DONE = "완료";

    private Integer wipeId;
    private String assetId;
    private String employeeId;
    private String employeeName;
    private String department;
    private String assetCategory;
    private String assetModel;
    private String serialNumber;
    private String status;
    private String wipeMethod;
    private String performedBy;
    private String note;
    private LocalDateTime retiredAt;
    private LocalDateTime wipedAt;
    private LocalDateTime expiresAt;
    private LocalDateTime createdAt;

    // 조회 시에만 채워지는 첨부파일 목록 (DB 컬럼 아님)
    private List<AssetWipeFileDTO> files;
}
