import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// 💡 [수정] NAS 아이콘으로 사용할 HardDrive 를 추가로 불러옵니다.
import { LayoutDashboard, Monitor, Users, History, HardDrive, ShieldCheck } from "lucide-react";
// 💡 방금 만든 AuthGuard 컴포넌트 불러오기 (경로는 실제 위치에 맞게 수정해 주세요!)
import AuthGuard from "./components/AuthGuard"; 

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IT 자산 관리 시스템",
  description: "사내 IT 자산 및 임직원 현황 관리",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-gray-50 flex h-screen overflow-hidden`}>
        
        {/* 💡 앱 전체(사이드바 + 메인 화면)를 AuthGuard로 감싸서 완벽하게 보호합니다 */}
        <AuthGuard>
          
          {/* 왼쪽 사이드바 (Sidebar) */}
          <aside className="w-64 bg-slate-900 text-white flex flex-col hidden md:flex shrink-0">
            <div className="p-6 text-xl font-bold border-b border-slate-700">
              IT 자산 관리
            </div>
            <nav className="flex-1 p-4 space-y-2">
              <a href="/" className="flex items-center space-x-3 p-3 rounded-lg bg-slate-800 text-white">
                <LayoutDashboard size={20} />
                <span>대시보드</span>
              </a>
              <a href="/assets" className="flex items-center space-x-3 p-3 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                <Monitor size={20} />
                <span>자산 관리 대장</span>
              </a>
              <a href="/users" className="flex items-center space-x-3 p-3 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                <Users size={20} />
                <span>임직원 현황</span>
              </a>
              
              {/* 💡 [NEW] NAS 권한 관리 메뉴가 추가되었습니다. */}
              <a href="/nas" className="flex items-center space-x-3 p-3 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                <HardDrive size={20} />
                <span>NAS 권한 관리</span>
              </a>

              <a href="/history" className="flex items-center space-x-3 p-3 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                <History size={20} />
                <span>처리 이력</span>
              </a>

              {/* 퇴직자 장비 초기화 증적 (보관 3년) */}
              <a href="/wipe" className="flex items-center space-x-3 p-3 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                <ShieldCheck size={20} />
                <span>퇴직자 증적</span>
              </a>
            </nav>
          </aside>

          {/* 상단 헤더 및 래퍼 제거됨 - 페이지 컨텐츠만 렌더링 */}
          <main className="flex-1 overflow-x-hidden overflow-y-auto">
            {children}
          </main>

        </AuthGuard>
        
      </body>
    </html>
  );
}