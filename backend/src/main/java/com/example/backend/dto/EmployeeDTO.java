package com.example.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class EmployeeDTO {
    @NotBlank(message = "사번은 필수입니다.")
    private String employeeId;
    @NotBlank(message = "이름은 필수입니다.")
    private String name;
    private String department1;
    private String department2;
    private String department3;
    private String rank;
    private String status;
    private String email; // 💡 추가
    private int assetCount;
}