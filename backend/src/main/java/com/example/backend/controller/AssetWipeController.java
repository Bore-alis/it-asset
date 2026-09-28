package com.example.backend.controller;

import com.example.backend.dto.AssetWipeDTO;
import com.example.backend.dto.AssetWipeFileDTO;
import com.example.backend.service.AssetWipeService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;

// 퇴직자 IT자산 초기화 증적 API
@RestController
@RequestMapping("/api/wipe")
@RequiredArgsConstructor
public class AssetWipeController {

    private final AssetWipeService wipeService;

    // status: '대기' | '완료' | 비우면 전체
    @GetMapping
    public List<AssetWipeDTO> getRecords(@RequestParam(value = "status", required = false) String status) {
        return wipeService.getRecords(status);
    }

    @GetMapping("/{wipeId}")
    public AssetWipeDTO getRecord(@PathVariable("wipeId") Integer wipeId) {
        return wipeService.getRecord(wipeId);
    }

    // 기능 도입 전에 퇴사한 인원의 증적을 수동으로 추가할 때 사용
    @PostMapping("/manual")
    public AssetWipeDTO createManual(@RequestBody AssetWipeDTO request) {
        return wipeService.createManual(request);
    }

    // 초기화 완료 처리 (스크린샷 등 첨부 포함)
    @PostMapping(value = "/{wipeId}/complete", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AssetWipeDTO complete(@PathVariable("wipeId") Integer wipeId,
            @RequestParam("wipeMethod") String wipeMethod,
            @RequestParam("performedBy") String performedBy,
            @RequestParam(value = "note", required = false) String note,
            @RequestParam(value = "wipedAt", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime wipedAt,
            @RequestParam(value = "files", required = false) List<MultipartFile> files) throws IOException {
        return wipeService.complete(wipeId, wipeMethod, performedBy, note, wipedAt, files);
    }

    // 완료된 증적에 첨부파일을 추가로 올리는 경우
    @PostMapping(value = "/{wipeId}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AssetWipeFileDTO addFile(@PathVariable("wipeId") Integer wipeId,
            @RequestParam("file") MultipartFile file) throws IOException {
        wipeService.getRecord(wipeId); // 존재 확인
        return wipeService.storeFile(wipeId, file);
    }

    @GetMapping("/files/{fileId}")
    public ResponseEntity<Resource> downloadFile(@PathVariable("fileId") Integer fileId) throws IOException {
        AssetWipeFileDTO file = wipeService.getFile(fileId);
        Path path = wipeService.resolveStoredPath(file);
        if (!Files.exists(path)) {
            return ResponseEntity.notFound().build();
        }

        String encodedName = URLEncoder.encode(file.getOriginalName(), StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(
                        file.getContentType() != null ? file.getContentType() : MediaType.APPLICATION_OCTET_STREAM_VALUE))
                // 이미지는 화면에서 바로 보이도록 inline
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''" + encodedName)
                .body(new FileSystemResource(path));
    }

    @DeleteMapping("/files/{fileId}")
    public ResponseEntity<String> deleteFile(@PathVariable("fileId") Integer fileId) {
        wipeService.deleteFile(fileId);
        return ResponseEntity.ok("Success");
    }
}
