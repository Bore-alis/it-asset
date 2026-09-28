package com.example.backend.service;

import com.example.backend.dto.AssetDTO;
import com.example.backend.dto.AssetHistoryDTO;
import com.example.backend.dto.EmployeeDTO;
import com.example.backend.mapper.EmployeeMapper;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

// 자산 지급/반납/교체 이력에 대한 안내 메일 작성 및 발송.
// AssetController에 이 HTML 조립 로직이 그대로 있었던 걸 분리해온 것.
@Service
@RequiredArgsConstructor
public class AssetHistoryMailService {

    private final EmployeeMapper employeeMapper;
    private final JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String systemEmail;

    // 모든 안내 메일에 고정 참조로 들어가는 헬프데스크 그룹 주소 (환경변수 APP_MAIL_CC, 비우면 참조 없음)
    @Value("${app.mail.cc:}")
    private String defaultCcEmail;

    private static String getFormattedSn(String sn) {
        return (sn == null || sn.trim().isEmpty()) ? "-" : sn;
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    public String sendBulkHistoryEmail(List<String> historyIds) throws Exception {
        if (historyIds == null || historyIds.isEmpty()) {
            throw new IllegalArgumentException("이력이 없습니다.");
        }

        String firstId = historyIds.get(0);
        AssetHistoryDTO targetHistory = employeeMapper.selectHistoryById(firstId);
        if (targetHistory == null) {
            throw new IllegalArgumentException("이력을 찾을 수 없습니다.");
        }

        String targetEmail = employeeMapper.selectEmailByHistoryId(firstId);
        if (targetEmail == null || targetEmail.isEmpty()) {
            throw new IllegalStateException("사원 이메일 없음");
        }

        String empId = targetHistory.getEmployeeId() != null ? targetHistory.getEmployeeId()
                : targetHistory.getPrevUserId();
        EmployeeDTO employee = employeeMapper.selectEmployeeById(empId);

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

        helper.setFrom(systemEmail);
        helper.setTo(targetEmail);
        if (defaultCcEmail != null && !defaultCcEmail.isBlank()) {
            helper.setCc(InternetAddress.parse(defaultCcEmail));
        }

        LocalDate today = LocalDate.now();
        String dateStr = today.getMonthValue() + "월 " + today.getDayOfMonth() + "일";

        String tableStyle = "border-collapse: collapse; width: 100%; max-width: 900px; font-size: 9pt; table-layout: fixed; word-break: break-all;";
        String thBase = "background-color: #1f497d; color: white; border: 1px solid #ccc; padding: 6px 5px; font-weight: bold; text-align: center;";
        String tdStyle = "border: 1px solid #ccc; padding: 6px 5px; text-align: center;";

        String dept = "-";
        if (employee.getDepartment3() != null && !employee.getDepartment3().trim().isEmpty()) {
            dept = employee.getDepartment3();
        } else if (employee.getDepartment2() != null && !employee.getDepartment2().trim().isEmpty()) {
            dept = employee.getDepartment2();
        } else if (employee.getDepartment1() != null && !employee.getDepartment1().trim().isEmpty()) {
            dept = employee.getDepartment1();
        }

        String tableHeader = "<thead><tr>"
                + "<th style=\"" + thBase + " width: 15%;\">관리번호</th><th style=\"" + thBase
                + " width: 12%;\">분류</th><th style=\"" + thBase + " width: 15%;\">소속</th>"
                + "<th style=\"" + thBase + " width: 12%;\">사용자</th><th style=\"" + thBase
                + " width: 20%;\">모델명</th>"
                + "<th style=\"" + thBase + " width: 16%;\">S/N</th><th style=\"" + thBase
                + " width: 10%;\">유형</th></tr></thead>";

        String footerHtml = "<div style=\"margin-top: 40px; padding: 20px; border: 1px solid #e5e7eb; background-color: #f9fafb; border-radius: 8px; font-size: 9pt; text-align: left;\">"
                + "<p style=\"font-weight: bold; margin: 0;\">■ 사용자 확인사항</p><br><br>"
                + "<p style=\"margin: 0;\">업무자산에 이상이 있을 시 <b>IT 헬프데스크</b>로 문의 부탁드립니다.</p><br><br>"
                // 실제 운영 시에는 조직의 자산 관리 정책 안내 문구가 들어가는 자리 (예시 문구)
                + "<ol style=\"padding-left: 20px; margin: 0;\">"
                + "<li>지급된 자산의 사용 및 관리는 사내 자산 관리 정책을 따릅니다.</li><br>"
                + "<li>자산의 교체, 수리, 반납이 필요하면 IT 담당자에게 요청해 주세요.</li>"
                + "</ol></div>";

        List<String> returnRows = new ArrayList<>();
        List<String> assignRows = new ArrayList<>();
        boolean isReplace = false;

        for (String hId : historyIds) {
            AssetHistoryDTO hist = employeeMapper.selectHistoryById(hId);
            AssetDTO asset = employeeMapper.selectAssetById(hist.getAssetId());
            String actionType = hist.getActionType() != null ? hist.getActionType() : "";

            String rowHtml = "<tr><td style=\"" + tdStyle + "\">" + escapeHtml(asset.getAssetId()) + "</td>"
                    + "<td style=\"" + tdStyle + "\">" + escapeHtml(asset.getCategory()) + "</td>"
                    + "<td style=\"" + tdStyle + "\">" + escapeHtml(dept) + "</td>"
                    + "<td style=\"" + tdStyle + "\">" + escapeHtml(employee.getName()) + "</td>"
                    + "<td style=\"" + tdStyle + "\">" + escapeHtml(asset.getModel()) + "</td>"
                    + "<td style=\"" + tdStyle + "\">" + escapeHtml(getFormattedSn(asset.getSerialNumber())) + "</td>"
                    + "<td style=\"" + tdStyle + "\">개인</td></tr>";

            if (actionType.contains("반납") || actionType.contains("회수")) {
                returnRows.add(rowHtml);
            } else {
                assignRows.add(rowHtml);
            }
            if (actionType.contains("교체")) {
                isReplace = true;
            }
        }

        StringBuilder htmlContent = new StringBuilder();

        if (isReplace) {
            helper.setSubject("[IT운영] 업무자산 교체 안내");

            htmlContent.append(
                    "<div style=\"font-family: 'Malgun Gothic', sans-serif; font-size: 10pt; color: #000; line-height: 1.6;\">");
            htmlContent.append("<p style=\"margin:0;\">안녕하세요 IT운영팀 입니다.</p><br><br>");
            htmlContent.append("<p style=\"margin:0;\">").append(dateStr)
                    .append(" 자로 귀하의 업무자산이 성공적으로 교체 처리되었습니다.</p><br><br>");

            if (!returnRows.isEmpty()) {
                htmlContent.append(
                        "<p style=\"font-weight:bold; color: #ef4444; margin-bottom:10px;\">1. 반납 자산 내역 (기존)</p>");
                htmlContent.append("<table style=\"").append(tableStyle).append(" margin-bottom: 30px;\">")
                        .append(tableHeader).append("<tbody>");
                for (String r : returnRows)
                    htmlContent.append(r);
                htmlContent.append("</tbody></table>");
            }
            if (!assignRows.isEmpty()) {
                htmlContent.append(
                        "<p style=\"font-weight:bold; color: #3b82f6; margin-bottom:10px;\">2. 신규 지급 자산 내역</p>");
                htmlContent.append("<table style=\"").append(tableStyle).append(" margin-bottom: 40px;\">")
                        .append(tableHeader).append("<tbody>");
                for (String r : assignRows)
                    htmlContent.append(r);
                htmlContent.append("</tbody></table>");
            }
            htmlContent.append(footerHtml).append("</div>");
        } else if (targetHistory.getActionType().contains("지급")) {
            helper.setSubject("[IT운영] 업무자산 지급 안내");

            htmlContent.append(
                    "<div style=\"font-family: 'Malgun Gothic', sans-serif; font-size: 10pt; color: #000; line-height: 1.6;\">")
                    .append("<p style=\"margin:0;\">안녕하세요 IT운영팀 입니다.</p><br><br>")
                    .append("<p style=\"margin:0;\">").append(dateStr)
                    .append(" 자로 아래 업무자산이 지급 처리되었습니다.</p><br><br>")
                    .append("<p style=\"font-weight:bold; margin-bottom:10px;\">1. 지급 내역</p><table style=\"")
                    .append(tableStyle).append(" margin-bottom: 40px;\">")
                    .append(tableHeader).append("<tbody>");
            for (String r : assignRows)
                htmlContent.append(r);
            htmlContent.append("</tbody></table>").append(footerHtml).append("</div>");
        } else {
            return "반납 메일 발송 생략됨";
        }

        helper.setText(htmlContent.toString(), true);
        mailSender.send(message);
        return "Success";
    }
}
