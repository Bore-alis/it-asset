package com.example.backend.controller;

import com.example.backend.dto.*;
import com.example.backend.mapper.EmployeeMapper;
import com.example.backend.service.AssetWipeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;

// 임직원 CRUD, 조직도, 임직원 상태변경(퇴사/휴직)을 담당.
// 자산(Asset) 관련 엔드포인트는 AssetController로, 이력 메일 발송은 AssetHistoryMailService로 분리됨.
@RestController
@RequestMapping("/api/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeMapper employeeMapper;
    private final AssetWipeService wipeService;

    @GetMapping
    public List<EmployeeDTO> getAllEmployees() {
        return employeeMapper.selectAllEmployees();
    }

    @GetMapping("/departments")
    public ResponseEntity<?> getOrgChart() {
        try {
            return ResponseEntity.ok(employeeMapper.selectOrgChart());
        } catch (Exception e) {
            // 조직도 조회 실패 시에는 화면이 깨지지 않도록 빈 목록으로 응답 (의도된 완화 처리)
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @PostMapping("/departments/save")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> saveOrgChart(@RequestBody List<OrgChartDTO> orgList) {
        employeeMapper.deleteAllOrgChart();
        int order = 1;
        for (OrgChartDTO dto : orgList) {
            dto.setSortOrder(order++);
            employeeMapper.insertOrgChart(dto);
        }
        return ResponseEntity.ok("Success");
    }

    @PostMapping("/register")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> registerEmployee(@Valid @RequestBody EmployeeDTO dto) {
        employeeMapper.insertEmployee(dto);
        EmployeeHistoryDTO history = new EmployeeHistoryDTO();
        history.setEmployeeId(dto.getEmployeeId());
        history.setActionType("입사");
        employeeMapper.insertEmployeeHistory(history);
        return ResponseEntity.ok("Success");
    }

    @PutMapping("/{id}")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> updateEmployee(@PathVariable("id") String id, @RequestBody EmployeeDTO dto) {
        EmployeeDTO existing = employeeMapper.selectEmployeeById(id);
        boolean isDeptChanged = false;
        String targetDept = "";

        if (existing != null) {
            String oldD1 = existing.getDepartment1() == null ? "" : existing.getDepartment1().trim();
            String oldD2 = existing.getDepartment2() == null ? "" : existing.getDepartment2().trim();
            String oldD3 = existing.getDepartment3() == null ? "" : existing.getDepartment3().trim();

            String newD1 = dto.getDepartment1() == null ? "" : dto.getDepartment1().trim();
            String newD2 = dto.getDepartment2() == null ? "" : dto.getDepartment2().trim();
            String newD3 = dto.getDepartment3() == null ? "" : dto.getDepartment3().trim();

            if (!oldD1.equals(newD1) || !oldD2.equals(newD2) || !oldD3.equals(newD3)) {
                isDeptChanged = true;
                targetDept = newD3.isEmpty() ? (newD2.isEmpty() ? newD1 : newD2) : newD3;
            }
        }

        dto.setEmployeeId(id);
        employeeMapper.updateEmployee(dto);

        if (isDeptChanged) {
            EmployeeHistoryDTO history = new EmployeeHistoryDTO();
            history.setEmployeeId(id);

            String actionMsg = "이동 ➡️ " + targetDept;
            if (actionMsg.length() > 30) {
                actionMsg = actionMsg.substring(0, 28) + "..";
            }

            history.setActionType(actionMsg);
            employeeMapper.insertEmployeeHistory(history);
        }

        return ResponseEntity.ok("Success");
    }

    @PutMapping("/{id}/status")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> changeEmployeeStatus(@PathVariable("id") String id,
            @RequestParam("status") String status) {
        employeeMapper.updateEmployeeStatus(id, status);
        EmployeeHistoryDTO history = new EmployeeHistoryDTO();
        history.setEmployeeId(id);
        history.setActionType(status);
        employeeMapper.insertEmployeeHistory(history);
        return ResponseEntity.ok("Success");
    }

    @PutMapping("/{id}/retire")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> retireEmployee(@PathVariable("id") String id) {
        // 자산 회수 후에는 assets 에서 사용자 정보가 지워지므로, 증적 스냅샷용으로 미리 조회해 둔다
        EmployeeDTO employee = employeeMapper.selectEmployeeById(id);
        List<AssetDTO> userAssets = employeeMapper.selectAssetsByEmployeeId(id);

        employeeMapper.retireEmployee(id);
        EmployeeHistoryDTO empHistory = new EmployeeHistoryDTO();
        empHistory.setEmployeeId(id);
        empHistory.setActionType("퇴사");
        employeeMapper.insertEmployeeHistory(empHistory);

        for (AssetDTO asset : userAssets) {
            employeeMapper.returnAsset(asset.getAssetId());
            AssetHistoryDTO ah = new AssetHistoryDTO();
            ah.setAssetId(asset.getAssetId());
            // 누가 쓰던 자산인지 남겨야 나중에 초기화 증적/이력을 퇴직자와 연결할 수 있다
            ah.setPrevUserId(id);
            ah.setActionType("회수");
            ah.setStatus("재고");
            ah.setReason("퇴사 자동 반납");
            employeeMapper.insertAssetHistory(ah);

            // 노트북/PC 는 초기화 증적 '대기' 항목으로 자동 등록
            wipeService.createPending(asset, employee);
        }
        return ResponseEntity.ok("Success");
    }

    @PutMapping("/{id}/leave")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> leaveEmployee(@PathVariable("id") String id) {
        // 1. 임직원 상태 업데이트 ('휴직' 처리) 및 이력 기록
        employeeMapper.updateEmployeeStatus(id, "휴직");
        EmployeeHistoryDTO empHistory = new EmployeeHistoryDTO();
        empHistory.setEmployeeId(id);
        empHistory.setActionType("휴직");
        employeeMapper.insertEmployeeHistory(empHistory);

        // 2. 자산 처리 로직 (노트북/PC 제외 나머지 자동 반납)
        List<AssetDTO> userAssets = employeeMapper.selectAssetsByEmployeeId(id);
        for (AssetDTO asset : userAssets) {
            String category = asset.getCategory();

            if (AssetDTO.isComputerCategory(category)) {
                // 노트북/PC: 회수하지 않고 상태만 변경
                employeeMapper.holdAssetForLeave(asset.getAssetId());

                AssetHistoryDTO ah = new AssetHistoryDTO();
                ah.setAssetId(asset.getAssetId());
                ah.setEmployeeId(id);
                ah.setActionType("휴직(보유)");
                ah.setStatus("휴직보유");
                ah.setReason("휴직으로 인한 장비 보유 유지");
                employeeMapper.insertAssetHistory(ah);
            } else {
                // 모니터, 주변기기 등 기타: 즉시 회수 (재고 처리)
                employeeMapper.returnAsset(asset.getAssetId());

                AssetHistoryDTO ah = new AssetHistoryDTO();
                ah.setAssetId(asset.getAssetId());
                ah.setActionType("회수");
                ah.setStatus("재고");
                ah.setReason("휴직 자동 반납");
                employeeMapper.insertAssetHistory(ah);
            }
        }
        return ResponseEntity.ok("Success");
    }

    @DeleteMapping("/{id}")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> deleteEmployee(@PathVariable("id") String id) {
        List<AssetDTO> userAssets = employeeMapper.selectAssetsByEmployeeId(id);
        for (AssetDTO asset : userAssets) {
            employeeMapper.returnAsset(asset.getAssetId());
            AssetHistoryDTO ah = new AssetHistoryDTO();
            ah.setAssetId(asset.getAssetId());
            ah.setActionType("회수");
            ah.setStatus("재고");
            ah.setReason("사원 정보 삭제로 인한 강제 반납");
            employeeMapper.insertAssetHistory(ah);
        }
        employeeMapper.deleteEmployeeHistory(id);
        employeeMapper.clearEmployeeFromAssetHistory(id);
        employeeMapper.deleteEmployee(id);
        return ResponseEntity.ok("Success");
    }

    @DeleteMapping("/delete-all")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<String> deleteAllEmployees() {
        List<AssetDTO> assignedAssets = employeeMapper.selectAssignedAssets();
        for (AssetDTO asset : assignedAssets) {
            AssetHistoryDTO ah = new AssetHistoryDTO();
            ah.setAssetId(asset.getAssetId());
            ah.setActionType("회수");
            ah.setStatus("재고");
            ah.setReason("사원 전체 삭제 일괄 자동 반납");
            employeeMapper.insertAssetHistory(ah);
        }
        employeeMapper.returnAllAssets();
        employeeMapper.deleteAllEmployeeHistory();
        employeeMapper.clearAllEmployeeFromAssetHistory();
        employeeMapper.deleteAllEmployees();
        return ResponseEntity.ok("Success");
    }

    @GetMapping("/{id}/history")
    public List<EmployeeHistoryDTO> getEmployeeHistory(@PathVariable("id") String id) {
        return employeeMapper.selectEmployeeHistory(id);
    }
}
