package com.example.backend.mapper;

import com.example.backend.dto.AssetWipeDTO;
import com.example.backend.dto.AssetWipeFileDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

// 퇴직자 자산 초기화 증적 전용 매퍼.
// EmployeeMapper 가 이미 사원/자산/이력을 전부 떠안고 있어서, 신규 기능은 별도 매퍼로 분리한다.
@Mapper
public interface AssetWipeMapper {

    List<AssetWipeDTO> selectWipeRecords(@Param("status") String status);

    AssetWipeDTO selectWipeRecordById(@Param("wipeId") Integer wipeId);

    boolean existsPendingByAsset(@Param("assetId") String assetId);

    void insertWipeRecord(AssetWipeDTO dto);

    void completeWipeRecord(AssetWipeDTO dto);

    void deleteWipeRecord(@Param("wipeId") Integer wipeId);

    // 보관기한이 지난 증적 (자동 파기 대상)
    List<AssetWipeDTO> selectExpiredRecords(@Param("now") LocalDateTime now);

    List<AssetWipeFileDTO> selectFilesByWipeId(@Param("wipeId") Integer wipeId);

    List<AssetWipeFileDTO> selectFilesByWipeIds(@Param("wipeIds") List<Integer> wipeIds);

    AssetWipeFileDTO selectFileById(@Param("fileId") Integer fileId);

    void insertWipeFile(AssetWipeFileDTO dto);

    void deleteWipeFile(@Param("fileId") Integer fileId);
}
