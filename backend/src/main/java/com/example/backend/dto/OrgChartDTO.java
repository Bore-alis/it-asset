package com.example.backend.dto;

import lombok.Data;

@Data
public class OrgChartDTO {
    private Integer id;
    private String department1;
    private String department2;
    private String department3;
    private Integer sortOrder;
}