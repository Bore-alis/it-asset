'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState(false);
  
  // 💡 [개선] Next.js SSR 환경에서 localStorage 접근 시 발생하는 에러를 막기 위한 마운트 상태
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // 클라이언트에서 렌더링이 시작되었음을 표시
    setIsMounted(true);

    // 💡 로그인 페이지(/login)는 검사에서 예외 처리 (무한 루프 방지)
    if (pathname === '/login') {
      setIsAuthorized(true);
      return;
    }

    // 💡 로컬 스토리지에서 인증 여부 확인
    const isAuth = localStorage.getItem('isAuthenticated');
    
    if (!isAuth) {
      // 로그인 안 했으면 로그인 페이지로 즉시 쫓아냄
      router.push('/login');
    } else {
      // 로그인했으면 통과!
      setIsAuthorized(true);
    }
  }, [pathname, router]);

  // 💡 완전히 마운트되기 전이거나, 권한 확인 중일 때 깜빡임(FOUC) 방지
  if (!isMounted || !isAuthorized) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 flex-col gap-3">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <div className="text-gray-500 font-bold text-sm">보안 모듈 확인 중...</div>
      </div>
    );
  }

  // 통과된 사람에게만 진짜 페이지(children)를 보여줌
  return <>{children}</>;
}