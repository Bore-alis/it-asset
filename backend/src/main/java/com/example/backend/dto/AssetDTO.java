package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AssetDTO {
    private String accountingLedger;       // 회계장부
    private String accountingLedgerIndex;  // 회계장부(index)
    @NotBlank(message = "관리번호는 필수입니다.")
    private String assetId;
    @NotBlank(message = "분류는 필수입니다.")
    private String category;
    private String model;
    private String serialNumber;
    private String status;
    private String currentUserId;
    private String reason;
    private String purchaseDate;   // 구입일자
    private String residualValue;  // 잔존가액

    // 데이터가 남는 저장장치를 가진 컴퓨터류인지 판단.
    // 휴직 시 회수 제외 대상 판단과, 퇴사 시 초기화 증적 대상 판단에 함께 쓰인다.
    // (getter 로 만들면 JSON 응답에 필드가 추가되므로 정적 메서드로 둔다)
    public static boolean isComputerCategory(String category) {
        if (category == null) return false;
        return category.contains("노트북")
                || category.contains("데스크탑")
                || category.equalsIgnoreCase("PC")
                || category.equalsIgnoreCase("LAPTOP")
                || category.equalsIgnoreCase("DESKTOP");
    }
}