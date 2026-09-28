package com.example.backend.dto;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class EmployeeHistoryDTO {
    private int historyId;
    private String employeeId;
    private String actionType; // 입사, 휴직, 복직, 퇴사 등
    private LocalDateTime changeDate;
}