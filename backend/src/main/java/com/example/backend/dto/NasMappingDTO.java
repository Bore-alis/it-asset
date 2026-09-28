package com.example.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class NasMappingDTO {
    // 프론트엔드의 interface NasMapping 과 완벽히 일치해야 하는 필드명입니다.
    private String nasName;     // 대상 NAS
    private String folderName;  // 공유 폴더명
    private String authName;    // 할당된 대상 이름
    private String type;        // 유형 (그룹/사용자)
    private String permission;  // 접근 권한
}