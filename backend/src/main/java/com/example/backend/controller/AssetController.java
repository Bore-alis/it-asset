package com.example.backend.controller;

import com.example.backend.dto.AssetDTO;
import com.example.backend.dto.AssetHistoryDTO;
import com.example.backend.mapper.EmployeeMapper;
import com.example.backend.service.AssetHistoryMailService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;

// 자산(Asset) CRUD, 지급/반납/교체, 자산 이력, 이력 메일 발송을 담당.
// 기존 EmployeeController(700줄+)에서 자산 관련 엔드포인트만 분리해온 것으로, URL 경로(/api/employees/assets/**)는 그대로 유지.
@RestController
@RequestMapping("/api/employees")
@RequiredArgsConstructor
public class AssetController {

    private final EmployeeMapper employeeMapper;
    private final AssetHistoryMailService mailService;

    @GetMapping("/assets")
    public List<AssetDTO> getAllAssets() {
        return employeeMapper.selectAllAssets();
    }

    @GetMapping("/assets/available")
    public List<AssetDTO> getAvailableAssets() {
        return employeeMapper.selectAvailableAssets();
    }

    @GetMapping("/{id}/assets")
    public List<AssetDTO> getEmployeeAssets(@PathVariable("id") String id) {
        return employeeMapper.selectAssetsByEmployeeId(id);
    }

    @PostMapping("/assets/register")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> registerAsset(@Valid @RequestBody AssetDTO dto) {
        employeeMapper.insertAsset(dto);
        AssetHistoryDTO h = new AssetHistoryDTO();
        h.setAssetId(dto.getAssetId());
        h.setActionType("입고");
        h.setStatus("재고");
        h.setReason(dto.getReason() != null ? dto.getReason() : "수동 입고");
        employeeMapper.insertAssetHistory(h);
        return ResponseEntity.ok("Success");
    }

    @PostMapping("/assets/bulk-register")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> registerBulkAssets(@RequestBody List<AssetDTO> dtos) {
        for (AssetDTO dto : dtos) {
            String remarks = (dto.getReason() == null || dto.getReason().trim().isEmpty()) ? "일괄 등록"
                    : dto.getReason();
            AssetDTO existingAsset = employeeMapper.selectAssetById(dto.getAssetId());
            if (existingAsset != null) {
                employeeMapper.updateAsset(dto);
                AssetHistoryDTO h = new AssetHistoryDTO();
                h.setAssetId(dto.getAssetId());
                h.setActionType("정보수정");
                h.setStatus(existingAsset.getStatus());
                h.setReason(remarks + " (덮어쓰기)");
                employeeMapper.insertAssetHistory(h);
            } else {
                employeeMapper.insertAsset(dto);
                AssetHistoryDTO h = new AssetHistoryDTO();
                h.setAssetId(dto.getAssetId());
                h.setActionType("입고");
                h.setStatus("재고");
                h.setReason(remarks);
                employeeMapper.insertAssetHistory(h);
            }
        }
        return ResponseEntity.ok("Success");
    }

    @PutMapping("/assets/{assetId}/assign/{employeeId}")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> assignAsset(@PathVariable("assetId") String assetId,
            @PathVariable("employeeId") String employeeId) {
        employeeMapper.updateAssetOwner(assetId, employeeId);
        AssetHistoryDTO h = new AssetHistoryDTO();
        h.setAssetId(assetId);
        h.setEmployeeId(employeeId);
        h.setActionType("지급");
        h.setStatus("사용중");
        h.setReason("배정");
        employeeMapper.insertAssetHistory(h);
        return ResponseEntity.ok("Success");
    }

    @PostMapping("/assets/bulk-assign")
    @Transactional(rollbackFor = Exception.class)
    @SuppressWarnings("unchecked")
    public ResponseEntity<String> bulkAssignAssets(@RequestBody Map<String, Object> payload) {
        String employeeId = (String) payload.get("employeeId");
        List<String> assetIds = (List<String>) payload.get("assetIds");

        if (employeeId == null || assetIds == null || assetIds.isEmpty()) {
            return ResponseEntity.badRequest().body("사번 또는 자산 목록이 누락되었습니다.");
        }

        for (String assetId : assetIds) {
            employeeMapper.updateAssetOwner(assetId, employeeId);
            AssetHistoryDTO h = new AssetHistoryDTO();
            h.setAssetId(assetId);
            h.setEmployeeId(employeeId);
            h.setActionType("지급");
            h.setStatus("사용중");
            h.setReason("배정");
            employeeMapper.insertAssetHistory(h);
        }
        return ResponseEntity.ok("Success");
    }

    @PutMapping("/assets/{assetId}/return")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> returnAsset(@PathVariable("assetId") String assetId) {
        employeeMapper.returnAsset(assetId);
        AssetHistoryDTO h = new AssetHistoryDTO();
        h.setAssetId(assetId);
        h.setActionType("회수");
        h.setStatus("재고");
        h.setReason("반납");
        employeeMapper.insertAssetHistory(h);
        return ResponseEntity.ok("Success");
    }

    @PutMapping("/assets/{id}")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> updateAsset(@PathVariable("id") String id, @RequestBody AssetDTO dto) {
        dto.setAssetId(id);
        employeeMapper.updateAsset(dto);
        AssetHistoryDTO h = new AssetHistoryDTO();
        h.setAssetId(id);
        h.setActionType("정보수정");
        h.setStatus(dto.getStatus() != null ? dto.getStatus() : "재고");
        h.setReason(dto.getReason() != null ? dto.getReason() : "정보 수정");
        employeeMapper.insertAssetHistory(h);
        return ResponseEntity.ok("Success");
    }

    @PutMapping("/assets/{id}/status")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> changeAssetStatus(@PathVariable("id") String id,
            @RequestParam("status") String status) {
        AssetDTO asset = employeeMapper.selectAssetById(id);
        if (asset != null) {
            asset.setStatus(status);
            employeeMapper.updateAsset(asset);

            AssetHistoryDTO h = new AssetHistoryDTO();
            h.setAssetId(id);
            h.setActionType("상태변경");
            h.setStatus(status);
            h.setReason(status + " 처리 (빠른 변경)");
            if (asset.getCurrentUserId() != null && !asset.getCurrentUserId().isEmpty()) {
                h.setEmployeeId(asset.getCurrentUserId());
            }
            employeeMapper.insertAssetHistory(h);
        }
        return ResponseEntity.ok("Success");
    }

    @DeleteMapping("/assets/{id}")
    public ResponseEntity<String> deleteAsset(@PathVariable("id") String id) {
        employeeMapper.deleteAsset(id);
        return ResponseEntity.ok("Success");
    }

    @GetMapping("/assets/{id}/history")
    public List<AssetHistoryDTO> getAssetHistory(@PathVariable("id") String id) {
        return employeeMapper.selectAssetHistory(id);
    }

    @GetMapping("/assets/history/all")
    public List<AssetHistoryDTO> getAllAssetHistories() {
        return employeeMapper.selectAllAssetHistories();
    }

    @PostMapping("/assets/replace")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> replaceAsset(@RequestBody Map<String, String> payload) {
        String empId = payload.get("employeeId");
        String oldId = payload.get("oldAssetId");
        String newId = payload.get("newAssetId");
        String reason = payload.get("reason");

        employeeMapper.returnAsset(oldId);
        AssetHistoryDTO oh = new AssetHistoryDTO();
        oh.setAssetId(oldId);
        oh.setPrevUserId(empId);
        oh.setActionType("교체(반납)");
        oh.setStatus("재고");
        oh.setReason(reason);
        employeeMapper.insertAssetHistory(oh);

        employeeMapper.updateAssetOwner(newId, empId);
        AssetHistoryDTO nh = new AssetHistoryDTO();
        nh.setAssetId(newId);
        nh.setEmployeeId(empId);
        nh.setActionType("교체(지급)");
        nh.setStatus("사용중");
        nh.setReason(reason);
        employeeMapper.insertAssetHistory(nh);

        return ResponseEntity.ok("Success");
    }

    @PostMapping("/assets/bulk-replace")
    @Transactional(rollbackFor = Exception.class)
    @SuppressWarnings("unchecked")
    public ResponseEntity<String> bulkReplaceAsset(@RequestBody Map<String, Object> payload) {
        String empId = (String) payload.get("employeeId");
        String reason = (String) payload.get("reason");
        List<Map<String, String>> pairs = (List<Map<String, String>>) payload.get("pairs");

        for (Map<String, String> pair : pairs) {
            String oldId = pair.get("oldAssetId");
            String newId = pair.get("newAssetId");

            employeeMapper.returnAsset(oldId);
            AssetHistoryDTO oh = new AssetHistoryDTO();
            oh.setAssetId(oldId);
            oh.setPrevUserId(empId);
            oh.setActionType("교체(반납)");
            oh.setStatus("재고");
            oh.setReason(reason);
            employeeMapper.insertAssetHistory(oh);

            employeeMapper.updateAssetOwner(newId, empId);
            AssetHistoryDTO nh = new AssetHistoryDTO();
            nh.setAssetId(newId);
            nh.setEmployeeId(empId);
            nh.setActionType("교체(지급)");
            nh.setStatus("사용중");
            nh.setReason(reason);
            employeeMapper.insertAssetHistory(nh);
        }
        return ResponseEntity.ok("Success");
    }

    @PostMapping("/assets/history/{id}/send-email")
    public ResponseEntity<String> sendHistoryEmail(@PathVariable("id") String id) throws Exception {
        return ResponseEntity.ok(mailService.sendBulkHistoryEmail(Collections.singletonList(id)));
    }

    @PostMapping("/assets/history/bulk-send-email")
    public ResponseEntity<String> sendBulkHistoryEmail(@RequestBody List<String> historyIds) throws Exception {
        return ResponseEntity.ok(mailService.sendBulkHistoryEmail(historyIds));
    }
}
