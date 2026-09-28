package com.example.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.naming.Context;
import javax.naming.NamingEnumeration;
import javax.naming.directory.DirContext;
import javax.naming.directory.InitialDirContext;
import javax.naming.directory.SearchControls;
import javax.naming.directory.SearchResult;
import java.util.HashMap;
import java.util.Hashtable;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
// CORS 설정은 CorsConfig(전역)에서 일괄 관리 (CORS_ALLOWED_ORIGINS 환경변수)
public class AuthController {

    // 💡 1. AD 서버 기본 정보 (환경변수 APP_LDAP_URL / APP_LDAP_DOMAIN)
    @Value("${app.ldap.url}")
    private String LDAP_URL;
    @Value("${app.ldap.domain}")
    private String AD_DOMAIN; // 아이디 뒤에 붙을 도메인 (예: @example.local)

    // 💡 2. 접근을 허용할 특정 OU 경로 (환경변수 APP_LDAP_ALLOWED_OU_BASE)
    @Value("${app.ldap.allowed-ou-base}")
    private String ALLOWED_OU_BASE;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> credentials) {
        String username = credentials.get("username");
        String password = credentials.get("password");

        if (username == null || password == null || username.trim().isEmpty() || password.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("아이디와 비밀번호를 입력해주세요.");
        }

        // 1단계: 입력받은 '사용자 본인'의 아이디와 비밀번호로 AD에 다이렉트 접속 시도
        Hashtable<String, String> env = new Hashtable<>();
        env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory");
        env.put(Context.PROVIDER_URL, LDAP_URL);
        env.put(Context.SECURITY_AUTHENTICATION, "simple");

        // 아이디 뒤에 도메인을 붙여서 로그인
        env.put(Context.SECURITY_PRINCIPAL, username + AD_DOMAIN);
        env.put(Context.SECURITY_CREDENTIALS, password);

        DirContext ctx = null;
        try {
            // 접속 성공 시 (아이디/비밀번호 맞음)
            ctx = new InitialDirContext(env);

            // 2단계: 본인이 허락된 부서(OU)에 있는지 스스로 검색
            SearchControls controls = new SearchControls();
            controls.setSearchScope(SearchControls.SUBTREE_SCOPE);
            controls.setReturningAttributes(new String[] { "distinguishedName" });

            String searchFilter = "(sAMAccountName=" + escapeLdapFilter(username) + ")";

            NamingEnumeration<SearchResult> results = ctx.search(ALLOWED_OU_BASE, searchFilter, controls);

            if (!results.hasMore()) {
                // 부서가 다름 -> 차단
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body("해당 시스템에 접근 권한이 없는 부서입니다.");
            }

            // 부서 확인 통과 (최종 성공)
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("username", username);
            return ResponseEntity.ok(response);

        } catch (javax.naming.AuthenticationException e) {
            // 1단계 실패: 아이디 또는 비밀번호 틀림
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("아이디 또는 비밀번호가 일치하지 않습니다.");
        } catch (Exception e) {
            // 기타 서버 에러
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("인증 서버 통신 오류가 발생했습니다.");
        } finally {
            if (ctx != null) {
                try {
                    ctx.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    // LDAP 검색 필터에 삽입되는 값은 RFC 4515에 따라 특수문자를 이스케이프해야 필터 조작(LDAP Injection)을 막을 수 있음
    private String escapeLdapFilter(String input) {
        StringBuilder sb = new StringBuilder();
        for (char c : input.toCharArray()) {
            switch (c) {
                case '\\': sb.append("\\5c"); break;
                case '*': sb.append("\\2a"); break;
                case '(': sb.append("\\28"); break;
                case ')': sb.append("\\29"); break;
                case '\u0000': sb.append("\\00"); break;
                default: sb.append(c);
            }
        }
        return sb.toString();
    }
}