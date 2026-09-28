package com.example.backend.controller;

import com.example.backend.dto.NasMappingDTO;
import com.example.backend.service.SynologyNasService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/nas")
public class NasController {

    private final SynologyNasService nasService;

    public NasController(SynologyNasService nasService) {
        this.nasService = nasService;
    }

    @GetMapping("/mappings")
    public ResponseEntity<List<NasMappingDTO>> getAllPermissions() {
        List<NasMappingDTO> permissions = nasService.getAllNasPermissions();
        return ResponseEntity.ok(permissions);
    }

    // 💡 신규 추가: 사용자 보기 모달을 클릭했을 때 도메인 그룹 멤버를 반환하는 API
    @GetMapping("/group-members")
    public ResponseEntity<List<String>> getGroupMembers(
            @RequestParam String nasIp,
            @RequestParam String groupName) {
        return ResponseEntity.ok(nasService.getDomainGroupMembers(nasIp, groupName));
    }
}