package com.example.backend.service;

import com.example.backend.dto.AssetDTO;
import com.example.backend.dto.AssetWipeDTO;
import com.example.backend.dto.AssetWipeFileDTO;
import com.example.backend.dto.EmployeeDTO;
import com.example.backend.mapper.AssetWipeMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

// 퇴직자 IT자산(노트북/PC) 초기화 증적 관리.
//
// 흐름: 퇴사 처리 시 대상 자산마다 '대기' 증적이 자동 생성되고,
//       담당자가 초기화를 끝낸 뒤 방식/일자/스크린샷을 채워 '완료'로 바꾼다.
//       완료 시점 기준 보관기한(기본 3년)이 지나면 스케줄러가 파일까지 함께 자동 파기한다.
@Service
@RequiredArgsConstructor
public class AssetWipeService {

    private static final Logger log = LoggerFactory.getLogger(AssetWipeService.class);

    // 첨부 가능한 형식: 초기화 완료 화면 스크린샷(이미지) 또는 확인서(PDF)
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "application/pdf");

    private final AssetWipeMapper wipeMapper;

    // 도커에서는 APP_WIPE_UPLOAD_DIR=/app/uploads/wipe (볼륨 마운트 경로)로 주입된다.
    @Value("${app.wipe.upload-dir:uploads/wipe}")
    private String uploadDir;

    @Value("${app.wipe.retention-years:3}")
    private int retentionYears;

    public List<AssetWipeDTO> getRecords(String status) {
        List<AssetWipeDTO> records = wipeMapper.selectWipeRecords(status);
        if (records.isEmpty()) return records;

        // 목록의 첨부파일을 건별로 조회하면 N+1이 되므로 한 번에 읽어서 나눠 담는다
        List<Integer> ids = records.stream().map(AssetWipeDTO::getWipeId).toList();
        Map<Integer, List<AssetWipeFileDTO>> filesByWipeId = wipeMapper.selectFilesByWipeIds(ids)
                .stream()
                .collect(Collectors.groupingBy(AssetWipeFileDTO::getWipeId));

        for (AssetWipeDTO record : records) {
            record.setFiles(filesByWipeId.getOrDefault(record.getWipeId(), Collections.emptyList()));
        }
        return records;
    }

    public AssetWipeDTO getRecord(Integer wipeId) {
        AssetWipeDTO record = wipeMapper.selectWipeRecordById(wipeId);
        if (record == null) {
            throw new IllegalArgumentException("초기화 증적을 찾을 수 없습니다.");
        }
        record.setFiles(wipeMapper.selectFilesByWipeId(wipeId));
        return record;
    }

    // 퇴사 처리 중 호출된다. 같은 자산에 이미 '대기' 건이 있으면 중복 생성하지 않는다.
    public void createPending(AssetDTO asset, EmployeeDTO employee) {
        // 모니터/주변기기 등 저장장치 없는 자산은 증적 대상이 아니다
        if (asset == null || !AssetDTO.isComputerCategory(asset.getCategory())) return;
        if (wipeMapper.existsPendingByAsset(asset.getAssetId())) return;

        AssetWipeDTO record = new AssetWipeDTO();
        record.setAssetId(asset.getAssetId());
        record.setAssetCategory(asset.getCategory());
        record.setAssetModel(asset.getModel());
        record.setSerialNumber(asset.getSerialNumber());
        if (employee != null) {
            record.setEmployeeId(employee.getEmployeeId());
            record.setEmployeeName(employee.getName());
            record.setDepartment(resolveDepartment(employee));
        }
        record.setRetiredAt(LocalDateTime.now());
        wipeMapper.insertWipeRecord(record);
    }

    private String resolveDepartment(EmployeeDTO employee) {
        if (employee.getDepartment3() != null && !employee.getDepartment3().trim().isEmpty()) {
            return employee.getDepartment3();
        }
        if (employee.getDepartment2() != null && !employee.getDepartment2().trim().isEmpty()) {
            return employee.getDepartment2();
        }
        return employee.getDepartment1();
    }

    // 기능 도입 이전에 이미 퇴사 처리된 건을 나중에 채워 넣기 위한 수동 등록
    public AssetWipeDTO createManual(AssetWipeDTO request) {
        if (request.getAssetId() == null || request.getAssetId().trim().isEmpty()) {
            throw new IllegalArgumentException("자산 관리번호는 필수입니다.");
        }
        request.setStatus(AssetWipeDTO.STATUS_PENDING);
        if (request.getRetiredAt() == null) {
            request.setRetiredAt(LocalDateTime.now());
        }
        wipeMapper.insertWipeRecord(request);
        return getRecord(request.getWipeId());
    }

    @Transactional(rollbackFor = Exception.class)
    public AssetWipeDTO complete(Integer wipeId, String wipeMethod, String performedBy, String note,
            LocalDateTime wipedAt, List<MultipartFile> files) throws IOException {
        AssetWipeDTO record = getRecord(wipeId);

        if (wipeMethod == null || wipeMethod.trim().isEmpty()) {
            throw new IllegalArgumentException("초기화 방식은 필수입니다.");
        }
        if (performedBy == null || performedBy.trim().isEmpty()) {
            throw new IllegalArgumentException("처리 담당자는 필수입니다.");
        }

        LocalDateTime wiped = wipedAt != null ? wipedAt : LocalDateTime.now();

        record.setWipeMethod(wipeMethod);
        record.setPerformedBy(performedBy);
        record.setNote(note);
        record.setWipedAt(wiped);
        record.setExpiresAt(wiped.plusYears(retentionYears));
        wipeMapper.completeWipeRecord(record);

        if (files != null) {
            for (MultipartFile file : files) {
                storeFile(wipeId, file);
            }
        }
        log.info("초기화 증적 완료 처리: wipeId={}, asset={}, 담당자={}, 보관기한={}",
                wipeId, record.getAssetId(), performedBy, record.getExpiresAt());
        return getRecord(wipeId);
    }

    // 완료된 증적에 스크린샷을 나중에 추가하는 경우에도 쓰인다
    public AssetWipeFileDTO storeFile(Integer wipeId, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("빈 파일은 첨부할 수 없습니다.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        if (!ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new IllegalArgumentException("이미지(PNG/JPG/GIF/WEBP) 또는 PDF 파일만 첨부할 수 있습니다.");
        }

        // 저장 파일명은 서버가 새로 만든다 (원본 파일명을 경로에 쓰면 경로 조작 위험)
        String storedName = UUID.randomUUID() + extensionFor(contentType);
        Path dir = recordDir(wipeId);
        Files.createDirectories(dir);
        Path target = dir.resolve(storedName);
        file.transferTo(target.toFile());

        AssetWipeFileDTO dto = new AssetWipeFileDTO();
        dto.setWipeId(wipeId);
        dto.setOriginalName(sanitizeName(file.getOriginalFilename()));
        dto.setStoredName(storedName);
        dto.setContentType(contentType);
        dto.setFileSize(file.getSize());
        wipeMapper.insertWipeFile(dto);
        return dto;
    }

    public Path resolveStoredPath(AssetWipeFileDTO file) {
        return recordDir(file.getWipeId()).resolve(file.getStoredName());
    }

    public AssetWipeFileDTO getFile(Integer fileId) {
        AssetWipeFileDTO file = wipeMapper.selectFileById(fileId);
        if (file == null) {
            throw new IllegalArgumentException("첨부파일을 찾을 수 없습니다.");
        }
        return file;
    }

    public void deleteFile(Integer fileId) {
        AssetWipeFileDTO file = getFile(fileId);
        wipeMapper.deleteWipeFile(fileId);
        deleteQuietly(resolveStoredPath(file));
    }

    // 3년(설정값) 보관기한이 지난 증적을 첨부파일까지 자동 파기.
    // 매일 새벽 3시 실행. 삭제 건은 되돌릴 수 없으므로 무엇이 지워졌는지 로그로 남긴다.
    @Scheduled(cron = "${app.wipe.purge-cron:0 0 3 * * *}")
    public void purgeExpiredRecords() {
        List<AssetWipeDTO> expired = wipeMapper.selectExpiredRecords(LocalDateTime.now());
        if (expired.isEmpty()) return;

        for (AssetWipeDTO record : expired) {
            List<AssetWipeFileDTO> files = wipeMapper.selectFilesByWipeId(record.getWipeId());
            // DB 행은 FK ON DELETE CASCADE 로 함께 지워지고, 실제 파일은 여기서 정리한다
            wipeMapper.deleteWipeRecord(record.getWipeId());
            for (AssetWipeFileDTO file : files) {
                deleteQuietly(resolveStoredPath(file));
            }
            deleteQuietly(recordDir(record.getWipeId()));
            log.info("보관기한 만료 증적 자동 파기: wipeId={}, asset={}, 퇴직자={}({}), 초기화일={}, 만료일={}, 첨부 {}건",
                    record.getWipeId(), record.getAssetId(), record.getEmployeeName(), record.getEmployeeId(),
                    record.getWipedAt(), record.getExpiresAt(), files.size());
        }
        log.info("보관기한 만료 증적 자동 파기 완료: 총 {}건", expired.size());
    }

    private Path recordDir(Integer wipeId) {
        return Paths.get(uploadDir).toAbsolutePath().normalize().resolve(String.valueOf(wipeId));
    }

    private void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            log.warn("파일 삭제 실패 (수동 정리 필요): {} - {}", path, e.getMessage());
        }
    }

    private String extensionFor(String contentType) {
        return switch (contentType) {
            case "image/png" -> ".png";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            case "application/pdf" -> ".pdf";
            default -> ".jpg";
        };
    }

    private String sanitizeName(String originalName) {
        if (originalName == null || originalName.isBlank()) return "attachment";
        String name = Paths.get(originalName).getFileName().toString();
        return name.length() > 200 ? name.substring(name.length() - 200) : name;
    }
}
