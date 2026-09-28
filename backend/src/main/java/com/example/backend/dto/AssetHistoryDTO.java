package com.example.backend.dto;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class AssetHistoryDTO {
    private int historyId;
    private String assetId;
    private String employeeId;
    private String actionType; // 입고, 지급, 회수
    private String prevUserId;
    private String status;
    private LocalDateTime changeDate;
    private String reason;
}