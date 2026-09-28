package com.example.backend.mapper;

import com.example.backend.dto.AssetDTO;
import com.example.backend.dto.AssetHistoryDTO;
import com.example.backend.dto.EmployeeDTO;
import com.example.backend.dto.EmployeeHistoryDTO;
import com.example.backend.dto.OrgChartDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface EmployeeMapper {
    // ==========================================
    // [1] 임직원 (Employee) 관련
    // ==========================================
    List<EmployeeDTO> selectAllEmployees();
    EmployeeDTO selectEmployeeById(String id);
    void insertEmployee(EmployeeDTO dto);
    void updateEmployee(EmployeeDTO dto);
    void updateEmployeeStatus(@Param("id") String id, @Param("status") String status);
    void retireEmployee(String id);
    void deleteEmployee(String id);
    
    void insertEmployeeHistory(EmployeeHistoryDTO dto);
    List<EmployeeHistoryDTO> selectEmployeeHistory(String id);
    void deleteEmployeeHistory(String id);

    // 💡 [NEW] 전체 사원 및 이력 삭제용 메서드
    void deleteAllEmployees();
    void deleteAllEmployeeHistory();

    // ==========================================
    // 조직도(정렬) 데이터 관리
    // ==========================================
    List<OrgChartDTO> selectOrgChart();
    void deleteAllOrgChart();
    void insertOrgChart(OrgChartDTO dto);

    // ==========================================
    // [2] 자산 (Asset) 관련
    // ==========================================
    List<AssetDTO> selectAllAssets();
    List<AssetDTO> selectAvailableAssets();
    List<AssetDTO> selectAssetsByEmployeeId(String employeeId);
    AssetDTO selectAssetById(String assetId);
    
    void insertAsset(AssetDTO dto);
    void updateAsset(AssetDTO dto);
    void updateAssetOwner(@Param("assetId") String assetId, @Param("employeeId") String employeeId);
    void returnAsset(String assetId);
    void deleteAsset(String assetId);
    
    void insertAssetHistory(AssetHistoryDTO dto);
    List<AssetHistoryDTO> selectAssetHistory(String assetId);
    List<AssetHistoryDTO> selectAllAssetHistories();
    AssetHistoryDTO selectHistoryById(String historyId);
    AssetHistoryDTO selectRecentReplaceReturn(String employeeId);
    
    void clearEmployeeFromAssetHistory(String id);

    // 💡 [NEW] 전체 사원 삭제 전 자산 일괄 반납용 메서드
    List<AssetDTO> selectAssignedAssets();
    void returnAllAssets();
    void clearAllEmployeeFromAssetHistory();

    String selectEmailByHistoryId(String historyId);

    // ==========================================
    // [3] 휴직 처리 (Leave Process) 관련 추가
    // ==========================================
    // 💡 [수정 완료] DB에 없는 updated_at 업데이트 로직 제거
    @Update("UPDATE assets SET status = '휴직보유' WHERE asset_id = #{assetId}")
    void holdAssetForLeave(String assetId);
}