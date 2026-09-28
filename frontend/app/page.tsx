'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getEmployees, getAllAssets } from './lib/api';

export default function DashboardPage() {
  const router = useRouter(); 
  const [loginUser, setLoginUser] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    activeEmployees: 0,
    totalAssets: 0,
    inUseAssets: 0,
    availableAssets: 0,
    categoryDetails: [] as any[]
  });

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [employees, assets] = await Promise.all([getEmployees(), getAllAssets()]);
      
      // 1. 재직 중인 사원 수 계산
      const activeEmps = employees.filter((e: any) => e.status !== '퇴사').length;

      // 2. 관리할 카테고리 명시 (요청하신 세분화 항목)
      const targetCategories = ['노트북', '모니터', '데스크탑', '소프트웨어', '프린터', '기타'];

      // 3. 카테고리별 세부 통계 계산
      const details = targetCategories.map(cat => {
        // '기타'인 경우 명시된 카테고리가 아닌 모든 것을 포함
        const catAssets = assets.filter((a: any) => 
          a.category === cat || (cat === '기타' && !targetCategories.slice(0, 5).includes(a.category))
        );
        
        const total = catAssets.length;
        const inUse = catAssets.filter((a: any) => a.status === '사용중' || a.currentUserId).length;
        const available = catAssets.filter((a: any) => a.status === '재고' && !a.currentUserId).length;
        
        // 가용률 계산 (총량이 0이면 0%)
        const availableRate = total > 0 ? Math.round((available / total) * 100) : 0;

        return { category: cat, total, inUse, available, availableRate };
      });

      setStats({
        activeEmployees: activeEmps,
        totalAssets: assets.length,
        inUseAssets: assets.filter((a: any) => a.status === '사용중' || a.currentUserId).length,
        availableAssets: assets.filter((a: any) => a.status === '재고' && !a.currentUserId).length,
        categoryDetails: details
      });
    } catch (error) {
      console.error("데이터 연동 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { 
    // 💡 AuthGuard가 이미 검사했으므로, 여기서는 접속자 이름만 세팅하고 데이터를 불러옵니다.
    setLoginUser(localStorage.getItem('loginUser') || '');
    loadDashboardData(); 
  }, []); // 의존성 배열도 깔끔하게 비워줍니다.

  // 💡 로그아웃 처리 함수
  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('loginUser');
    router.push('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 font-bold text-lg">
        데이터를 분석 중입니다...
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* [1] 헤더 영역 (접속자 정보 및 로그아웃 버튼 추가) */}
        <div className="flex justify-between items-end">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-gray-800 mb-1">IT Asset Dashboard</h1>
            <p className="text-gray-500 font-medium">사내 IT 인프라 및 자산 통합 현황판</p>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-gray-600 bg-white px-3 py-1.5 rounded-full shadow-sm border">👤 {loginUser}님</span>
            <button onClick={handleLogout} className="text-sm font-bold text-gray-400 hover:text-red-500 transition underline">로그아웃</button>
          </div>
        </div>

        {/* [2] 핵심 요약 카드 (Summary Cards) - 사이드 라인 디자인 적용 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-800"></div>
            <p className="text-xs font-bold text-gray-500 mb-1">현재 재직 인원</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-gray-900">{stats.activeEmployees.toLocaleString()}</span>
              <span className="text-sm font-medium text-gray-500">명</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>
            <p className="text-xs font-bold text-gray-500 mb-1">총 등록 자산</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-blue-700">{stats.totalAssets.toLocaleString()}</span>
              <span className="text-sm font-medium text-gray-500">개</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
            <p className="text-xs font-bold text-gray-500 mb-1">사용 중 (지급 완료)</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-amber-600">{stats.inUseAssets.toLocaleString()}</span>
              <span className="text-sm font-medium text-gray-500">개</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>
            <p className="text-xs font-bold text-gray-500 mb-1">가용 재고 (창고 대기)</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-emerald-600">{stats.availableAssets.toLocaleString()}</span>
              <span className="text-sm font-medium text-gray-500">개</span>
            </div>
          </div>
        </div>

        {/* [3] 장비 분류별 퀵 요약 카드 */}
        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-3">항목별 전체 수량</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stats.categoryDetails.map((cat, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                <p className="text-[11px] font-bold text-gray-500 mb-1">{cat.category}</p>
                <p className="text-xl font-black text-gray-800">{cat.total.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        {/* [4] 세부 자산 현황 테이블 (Detailed Analytics) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-sm font-bold text-gray-800">세분화 현황 분석 <span className="text-gray-400 font-normal text-xs ml-1">(Category Breakdown)</span></h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse">
              <thead className="bg-white text-[11px] text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="p-4 font-bold text-left pl-8 w-1/5">카테고리</th>
                  <th className="p-4 font-bold w-1/5">총 보유 수량</th>
                  <th className="p-4 font-bold text-amber-600 w-1/5">사용 중</th>
                  <th className="p-4 font-bold text-emerald-600 w-1/5">가용 재고</th>
                  <th className="p-4 font-bold w-1/5">여유율</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {stats.categoryDetails.map((cat, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-bold text-gray-800 text-left pl-8">{cat.category}</td>
                    <td className="p-4 font-black text-gray-700">{cat.total.toLocaleString()}</td>
                    <td className="p-4 font-bold text-amber-600">{cat.inUse.toLocaleString()}</td>
                    <td className="p-4 font-bold text-emerald-600">{cat.available.toLocaleString()}</td>
                    <td className="p-4 pr-8">
                      <div className="flex items-center justify-center gap-3">
                        <span className="font-bold text-gray-700 w-10 text-right">{cat.availableRate}%</span>
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${cat.availableRate <= 20 ? 'bg-red-500' : cat.availableRate <= 50 ? 'bg-amber-400' : 'bg-emerald-500'}`} 
                            style={{ width: `${cat.availableRate}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}