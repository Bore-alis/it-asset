package com.example.backend.service;

import com.example.backend.config.SynologyNasProperties;
import com.example.backend.dto.NasMappingDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.client.SimpleClientHttpRequestFactory;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class SynologyNasService {

    private static final Logger log = LoggerFactory.getLogger(SynologyNasService.class);
    private final RestTemplate restTemplate;
    private final SynologyNasProperties nasProperties;

    public SynologyNasService(SynologyNasProperties nasProperties) throws Exception {
        this.nasProperties = nasProperties;
        this.restTemplate = createTrustAllRestTemplate();
    }

    // 사내망 NAS 장비가 자체 서명 인증서를 쓰기 때문에 신뢰 검증을 생략하되,
    // 이 RestTemplate으로 나가는 통신에만 적용하고 JVM 전역 TLS 기본값(HttpsURLConnection.setDefault*)은 건드리지 않음.
    // 그렇지 않으면 메일 발송 등 이 서버가 맺는 다른 모든 HTTPS 통신까지 인증서 검증이 함께 꺼져버림.
    private RestTemplate createTrustAllRestTemplate() throws Exception {
        TrustManager[] trustAllCerts = new TrustManager[]{
            new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                public void checkServerTrusted(X509Certificate[] certs, String authType) {}
            }
        };

        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(null, trustAllCerts, new java.security.SecureRandom());
        final SSLSocketFactory nasSslSocketFactory = sslContext.getSocketFactory();
        final HostnameVerifier nasHostnameVerifier = (hostname, session) -> true;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(HttpURLConnection connection, String httpMethod) throws IOException {
                super.prepareConnection(connection, httpMethod);
                if (connection instanceof HttpsURLConnection httpsConnection) {
                    httpsConnection.setSSLSocketFactory(nasSslSocketFactory);
                    httpsConnection.setHostnameVerifier(nasHostnameVerifier);
                }
            }
        };
        requestFactory.setConnectTimeout(5000);
        requestFactory.setReadTimeout(15000);

        return new RestTemplate(requestFactory);
    }

    private ResponseEntity<Map<String, Object>> callSynologyApiPost(String baseUrl, String api, String version, String method, MultiValueMap<String, String> extraParams, String[] authData) {
        try {
            String cgi = "SYNO.API.Auth".equals(api) ? "/webapi/auth.cgi" : "/webapi/entry.cgi";
            String url = baseUrl + cgi;

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

            String sid = authData != null ? authData[0] : null;
            String synoToken = authData != null ? authData[1] : null;
            String cookieStr = authData != null && authData.length > 2 ? authData[2] : null;

            if (synoToken != null && !synoToken.isEmpty()) {
                headers.add("X-SYNO-TOKEN", synoToken);
            }
            if (cookieStr != null && !cookieStr.isEmpty()) {
                headers.add(HttpHeaders.COOKIE, cookieStr);
            }

            MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
            body.add("api", api);
            body.add("version", version);
            body.add("method", method);
            
            if (sid != null) {
                body.add("_sid", sid);
            }
            if (synoToken != null && !synoToken.isEmpty()) {
                body.add("SynoToken", synoToken);
            }
            if (extraParams != null) {
                body.addAll(extraParams);
            }

            HttpEntity<MultiValueMap<String, String>> entity = new HttpEntity<>(body, headers);

            return restTemplate.exchange(
                    URI.create(url), HttpMethod.POST, entity, new ParameterizedTypeReference<Map<String, Object>>() {}
            );
        } catch (Exception e) {
            log.error("API Call Error [{}]: {}", api, e.getMessage());
            return null;
        }
    }

    public List<NasMappingDTO> getAllNasPermissions() {
        List<NasMappingDTO> allPermissions = new ArrayList<>();

        if (nasProperties.getDevices() == null || nasProperties.getDevices().isEmpty()) {
            return allPermissions;
        }

        for (SynologyNasProperties.Device device : nasProperties.getDevices()) {
            if (device == null || device.getUrl() == null) continue;

            String[] authData = loginToNas(device);
            if (authData != null && authData[0] != null) {
                List<NasMappingDTO> permissions = extractAclData(device, authData);
                allPermissions.addAll(permissions);
            }
        }
        return allPermissions;
    }

    @SuppressWarnings("unchecked")
    private String[] loginToNas(SynologyNasProperties.Device device) {
        MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        params.add("account", device.getUsername());
        params.add("passwd", device.getPassword());
        params.add("session", "Core"); 
        params.add("format", "cookie"); 
        params.add("enable_syno_token", "yes");

        ResponseEntity<Map<String, Object>> response = callSynologyApiPost(device.getUrl(), "SYNO.API.Auth", "6", "login", params, null);

        if (response != null && response.getBody() != null && Boolean.TRUE.equals(response.getBody().get("success"))) {
            Map<String, Object> data = (Map<String, Object>) response.getBody().get("data");
            String sid = (String) data.get("sid");
            String synoToken = (String) data.get("synotoken");
            
            List<String> cookies = response.getHeaders().get(HttpHeaders.SET_COOKIE);
            StringBuilder cookieBuilder = new StringBuilder();
            
            if (cookies != null) {
                for (String setCookie : cookies) {
                    if (setCookie != null) {
                        String[] parts = setCookie.split(";");
                        if (parts.length > 0) {
                            if (cookieBuilder.length() > 0) cookieBuilder.append("; ");
                            cookieBuilder.append(parts[0].trim());
                        }
                    }
                }
            }
            return new String[]{sid, synoToken, cookieBuilder.toString()};
        }
        return null;
    }

    private boolean isNasTargetGroup(String name) {
        if (name == null || name.isEmpty()) return false;
        int slashIdx = name.indexOf("\\");
        String shortName = slashIdx != -1 ? name.substring(slashIdx + 1) : name;
        return shortName.toUpperCase().startsWith("NAS-");
    }

    @SuppressWarnings("unchecked")
    private List<NasMappingDTO> extractAclData(SynologyNasProperties.Device device, String[] authData) {
        List<NasMappingDTO> resultList = new ArrayList<>();
        String targetIp = device.getUrl().replaceAll("https?://", "").split(":")[0];

        ResponseEntity<Map<String, Object>> listRes = callSynologyApiPost(device.getUrl(), "SYNO.Core.Share", "1", "list", null, authData);

        if (listRes != null && listRes.getBody() != null && Boolean.TRUE.equals(listRes.getBody().get("success"))) {
            Map<String, Object> data = (Map<String, Object>) listRes.getBody().get("data");
            List<Map<String, Object>> shares = (List<Map<String, Object>>) data.get("shares");

            if (shares == null) return resultList;

            for (Map<String, Object> share : shares) {
                String folderName = (String) share.get("name");
                String volPath = (String) share.get("vol_path"); 
                if (volPath == null || volPath.isEmpty()) volPath = "/volume1";
                String fullPath = volPath + "/" + folderName;
                
                boolean fetchedAcl = false;
                boolean hasNasGroup = false;
                StringBuilder errorTrace = new StringBuilder();

                MultiValueMap<String, String> aclParams = new LinkedMultiValueMap<>();
                aclParams.add("path", fullPath); 
                aclParams.add("file_path", fullPath); 
                aclParams.add("type", "all"); 

                ResponseEntity<Map<String, Object>> aclRes = callSynologyApiPost(device.getUrl(), "SYNO.Core.ACL", "1", "get", aclParams, authData);

                if (aclRes != null && aclRes.getBody() != null) {
                    if (Boolean.TRUE.equals(aclRes.getBody().get("success"))) {
                        Map<String, Object> aclData = (Map<String, Object>) aclRes.getBody().get("data");
                        
                        if (aclData != null && aclData.containsKey("acl")) {
                            List<Map<String, Object>> aclList = (List<Map<String, Object>>) aclData.get("acl");
                            if (aclList != null && !aclList.isEmpty()) {
                                fetchedAcl = true;
                                for (Map<String, Object> rule : aclList) {
                                    String ownerName = (String) rule.get("owner_name");
                                    if (ownerName == null) ownerName = "Unknown";
                                    
                                    if (isNasTargetGroup(ownerName)) {
                                        hasNasGroup = true;
                                        String ownerType = (String) rule.get("owner_type");
                                        boolean isGroup = "group".equalsIgnoreCase(ownerType);
                                        String permissionType = (String) rule.get("permission_type");
                                        
                                        String permission = "허용";
                                        if ("deny".equalsIgnoreCase(permissionType)) {
                                            permission = "거부";
                                        } else {
                                            Map<String, Object> permDetails = (Map<String, Object>) rule.get("permission");
                                            if (permDetails != null) {
                                                boolean canWrite = Boolean.TRUE.equals(permDetails.get("write_data"));
                                                permission = canWrite ? "읽기/쓰기" : "읽기 전용";
                                            }
                                        }
                                        
                                        String displayType = isGroup ? "그룹(O)" : "사용자(X)";
                                        if (ownerName.contains("\\")) displayType = isGroup ? "도메인 그룹(O)" : "도메인 사용자(X)";
                                        
                                        resultList.add(new NasMappingDTO(targetIp, folderName, ownerName, displayType, permission));
                                    }
                                }
                            }
                        } else if (aclData != null && aclData.containsKey("rules")) {
                            List<Map<String, Object>> rules = (List<Map<String, Object>>) aclData.get("rules");
                            if (rules != null && !rules.isEmpty()) {
                                fetchedAcl = true;
                                for (Map<String, Object> rule : rules) {
                                    String name = (String) rule.get("name");
                                    if (name == null) name = (String) rule.get("principal");
                                    
                                    if (isNasTargetGroup(name)) {
                                        hasNasGroup = true;
                                        boolean isGroup = rule.get("is_group") != null && (Boolean) rule.get("is_group");
                                        String allowStr = String.valueOf(rule.get("allow"));
                                        String right = (String) rule.get("access_right");
                                        if (right == null) right = (String) rule.get("right");
                                        
                                        String permission = "허용";
                                        if (right != null) permission = right.toLowerCase().contains("w") ? "읽기/쓰기" : "읽기 전용";
                                        if ("false".equalsIgnoreCase(allowStr)) permission = "거부";
                                        
                                        String displayType = isGroup ? "그룹(O)" : "사용자(X)";
                                        if (name.contains("\\")) displayType = isGroup ? "도메인 그룹(O)" : "도메인 사용자(X)";
                                        
                                        resultList.add(new NasMappingDTO(targetIp, folderName, name, displayType, permission));
                                    }
                                }
                            }
                        }
                    } else {
                        errorTrace.append(aclRes.getBody().get("error"));
                    }
                }

                if (!fetchedAcl) {
                    MultiValueMap<String, String> privParams = new LinkedMultiValueMap<>();
                    privParams.add("name", folderName);
                    
                    ResponseEntity<Map<String, Object>> privRes = callSynologyApiPost(device.getUrl(), "SYNO.Core.Share.Permission", "1", "list", privParams, authData);

                    if (privRes != null && privRes.getBody() != null) {
                        if (Boolean.TRUE.equals(privRes.getBody().get("success"))) {
                            Map<String, Object> privData = (Map<String, Object>) privRes.getBody().get("data");
                            if (privData != null) {
                                for (Map.Entry<String, Object> entry : privData.entrySet()) {
                                    if (entry.getValue() instanceof List) {
                                        List<Map<String, Object>> entities = (List<Map<String, Object>>) entry.getValue();
                                        for (Map<String, Object> entity : entities) {
                                            String entityName = (String) entity.get("name");
                                            if (isNasTargetGroup(entityName)) {
                                                hasNasGroup = true;
                                                fetchedAcl = true;
                                                String priv = (String) entity.get("privilege");
                                                
                                                if (priv != null && !priv.equals("none")) {
                                                    String permission = priv.equals("rw") ? "읽기/쓰기" : "읽기 전용";
                                                    String displayType = "사용자(X)";
                                                    if (entry.getKey().contains("group")) displayType = entry.getKey().contains("domain") ? "도메인 그룹(O)" : "로컬 그룹(O)";
                                                    else if (entry.getKey().contains("domain")) displayType = "도메인 사용자(X)";
                                                    
                                                    resultList.add(new NasMappingDTO(targetIp, folderName, entityName, displayType, permission));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (!fetchedAcl) {
                    String finalStatus = "조회 실패 (" + errorTrace + ")";
                    if (errorTrace.toString().contains("403")) finalStatus = "시스템/보안 폴더 (API 접근 차단)";
                    resultList.add(new NasMappingDTO(targetIp, folderName, "-", "시스템/레거시", finalStatus));
                } else if (!hasNasGroup) {
                    resultList.add(new NasMappingDTO(targetIp, folderName, "미할당", "-", "NAS- 그룹 없음"));
                }
            }
        }
        return resultList;
    }

    @SuppressWarnings("unchecked")
    public List<String> getDomainGroupMembers(String nasIp, String groupName) {
        List<String> members = new ArrayList<>();
        if (nasProperties.getDevices() == null) return members;

        SynologyNasProperties.Device targetDevice = null;
        for (SynologyNasProperties.Device device : nasProperties.getDevices()) {
            if (device != null && device.getUrl() != null && device.getUrl().contains(nasIp)) {
                targetDevice = device;
                break;
            }
        }

        if (targetDevice == null) {
            members.add("해당 NAS 장비(IP: " + nasIp + ")를 찾을 수 없습니다.");
            return members;
        }

        String[] authData = loginToNas(targetDevice);
        if (authData == null || authData[0] == null) {
            members.add("NAS 보안 토큰 발급에 실패했습니다.");
            return members;
        }

        String shortName = groupName.contains("\\") ? groupName.substring(groupName.indexOf("\\") + 1) : groupName;
        String[] apisToTry = { "SYNO.Core.Directory.Domain.User", "SYNO.Core.User" };

        for (String api : apisToTry) {
            MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
            params.add("limit", "5000"); 
            params.add("offset", "0");
            params.add("additional", "[\"group\"]"); 
            
            if (api.equals("SYNO.Core.User")) {
                params.add("type", "domain"); 
            }

            ResponseEntity<Map<String, Object>> res = callSynologyApiPost(targetDevice.getUrl(), api, "1", "list", params, authData);

            if (res != null && res.getBody() != null && Boolean.TRUE.equals(res.getBody().get("success"))) {
                Map<String, Object> data = (Map<String, Object>) res.getBody().get("data");
                List<Map<String, Object>> users = (List<Map<String, Object>>) data.get("users");
                
                if (users != null && !users.isEmpty()) {
                    log.info("✅ [유저 목록 획득 성공] API: {}, 총 유저 수: {} 명. 필터링을 시작합니다.", api, users.size());
                    
                    int sampleLogCount = 0;
                    
                    for (Map<String, Object> user : users) {
                        String userName = (String) user.get("name");
                        
                        if (user.containsKey("group")) {
                            List<String> userGroups = (List<String>) user.get("group");
                            
                            // 💡 추가된 핵심 디버깅: 전체 유저 중 상위 5명이 도대체 어떤 그룹 데이터를 갖고 있는지 콘솔에 출력!
                            if (sampleLogCount < 5) {
                                log.info("🕵️ [NAS 응답 검증] 유저명: '{}', NAS가 전달한 그룹들: {}", userName, userGroups);
                                sampleLogCount++;
                            }
                            
                            for (String g : userGroups) {
                                if (g.equalsIgnoreCase(shortName) || g.equalsIgnoreCase(groupName)) {
                                    members.add(userName);
                                    break;
                                }
                            }
                        } else {
                            if (sampleLogCount < 5) {
                                log.info("🕵️ [NAS 응답 검증] 유저명: '{}', ❌ 소속 그룹 데이터 자체가 없음!", userName);
                                sampleLogCount++;
                            }
                        }
                    }
                    
                    if (!members.isEmpty()) {
                        return members; 
                    }
                }
            } else {
                if (res != null && res.getBody() != null) {
                    log.warn("⚠️ [API 실패/무시됨] API: {}, 사유: {}", api, res.getBody().get("error"));
                }
            }
        }

        if (members.isEmpty()) {
            members.add("NAS 응답 완료: 도메인 서버에 해당 그룹 소속 사용자가 없거나, NAS와 AD 동기화가 지연 중입니다.");
        }

        return members;
    }
}