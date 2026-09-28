'use client';

import { useState, useEffect } from 'react';
import { getAllHistories, getEmployees, getAllAssets, sendBulkHistoryEmail } from '../lib/api';

/* ==========================================
 * 💡 데이터 타입 명시
 * ========================================== */
interface Employee {
  employeeId: string;
  name: string;
  department1: string;
}

interface Asset {
  assetId: string;
  category: string;
  model: string;
}

interface HistoryItem {
  historyId: string;
  assetId: string;
  employeeId?: string;
  prevUserId?: string;
  actionType: string;
  changeDate: string;
  reason: string;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function HistoryPage() {
  const [histories, setHistories] = useState<HistoryItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sendingMailId, setSendingMailId] = useState<string | null>(null);

  // 필터
  const [actionFilter, setActionFilter] = useState('전체');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [histData, empData, assetData] = await Promise.all([
        getAllHistories(), getEmployees(), getAllAssets()
      ]);
      setHistories(histData || []);
      setEmployees(empData || []);
      setAssets(assetData || []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const getGroupedHistories = () => {
    const groupMap = new Map();
    const result: any[] = [];

    histories.forEach((h) => {
      const empId = h.employeeId || h.prevUserId || 'UNKNOWN';
      
      let minuteKey = h.changeDate;
      const dateObj = new Date(h.changeDate);
      if (!isNaN(dateObj.getTime())) {
        minuteKey = Math.floor(dateObj.getTime() / 60000).toString();
      }

      const normalizedAction = (h.actionType || '').startsWith('교체') ? '교체' : h.actionType;
      
      const key = `${empId}_${normalizedAction}_${minuteKey}`;

      if (!groupMap.has(key)) {
        const newGroup = { 
          ...h, 
          actionType: normalizedAction, 
          groupedIds: [h.historyId], 
          groupedAssetIds: [h.assetId],
          count: 1 
        };
        groupMap.set(key, newGroup);
        result.push(newGroup);
      } else {
        const group = groupMap.get(key);
        group.groupedIds.push(h.historyId);
        group.groupedAssetIds.push(h.assetId);
        group.count += 1;
      }
    });

    return result.sort((a, b) => new Date(b.changeDate).getTime() - new Date(a.changeDate).getTime());
  };

  const handleSendMail = async (group: any) => {
    setSendingMailId(group.historyId);
    try {
      const success = await sendBulkHistoryEmail(group.groupedIds);
      if (success) alert('해당 그룹에 대한 상세 안내 메일이 성공적으로 발송되었습니다.');
      else alert('메일 발송에 실패했습니다.');
    } catch (e) {
      alert('메일 서버 연동 중 오류가 발생했습니다.');
    } finally {
      setSendingMailId(null);
    }
  };

  const getEmpName = (id: string) => {
    if (id === 'UNKNOWN') return '창고 (재고 보관)';
    const emp = employees.find(e => e.employeeId === id);
    return emp ? `${emp.name} (${emp.department1})` : id;
  };

  const getAssetDisplayName = (group: any) => {
    const firstAssetId = group.groupedAssetIds[0];
    const asset = assets.find(a => a.assetId === firstAssetId);
    const firstName = asset ? `[${asset.category}] ${asset.model}` : firstAssetId;

    if (group.count > 1) {
      return `${firstName} 외 ${group.count - 1}건`;
    }
    return firstName;
  };

  const groupedHistories = getGroupedHistories();

  // 작업 유형 선택지는 실제 데이터에서 뽑아 쓴다 (새로운 유형이 생겨도 자동 반영)
  const actionTypes = Array.from(new Set(groupedHistories.map((g: any) => g.actionType).filter(Boolean))).sort();

  const matchesSearch = (group: any, keyword: string) => {
    const empId = group.employeeId || group.prevUserId || '';
    const emp = employees.find(e => e.employeeId === empId);
    const assetTexts = (group.groupedAssetIds || []).flatMap((id: string) => {
      const asset = assets.find(a => a.assetId === id);
      return [id, asset?.model, asset?.category];
    });
    return [emp?.name, empId, group.reason, ...assetTexts]
      .some((v: string | undefined) => (v || '').toLowerCase().includes(keyword));
  };

  const filteredGroups = groupedHistories.filter((group: any) => {
    if (actionFilter !== '전체' && group.actionType !== actionFilter) return false;

    if (startDate || endDate) {
      const changed = new Date(group.changeDate).getTime();
      if (isNaN(changed)) return false;
      // 종료일은 그날 23:59:59 까지 포함되도록 하루를 더한다
      if (startDate && changed < new Date(`${startDate}T00:00:00`).getTime()) return false;
      if (endDate && changed >= new Date(`${endDate}T00:00:00`).getTime() + 86400000) return false;
    }

    const keyword = searchTerm.trim().toLowerCase();
    if (keyword && !matchesSearch(group, keyword)) return false;

    return true;
  });

  // 필터 결과가 줄어 현재 페이지가 범위를 벗어날 수 있어 렌더 시점에 보정한다
  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const displayedGroups = filteredGroups.slice(pageStart, pageStart + pageSize);

  // 현재 페이지 주변 번호만 노출 (페이지가 많아져도 버튼이 넘치지 않도록)
  const pageNumbers = (() => {
    const size = 5;
    let start = Math.max(1, safePage - Math.floor(size / 2));
    const end = Math.min(totalPages, start + size - 1);
    start = Math.max(1, end - size + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  })();

  const isFilterActive = actionFilter !== '전체' || searchTerm.trim() !== '' || startDate !== '' || endDate !== '';

  // 필터가 바뀌면 첫 페이지부터 다시 본다
  const resetToFirstPage = () => setCurrentPage(1);

  const resetFilters = () => {
    setActionFilter('전체');
    setSearchTerm('');
    setStartDate('');
    setEndDate('');
    resetToFirstPage();
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col gap-2 mb-2">
          <h1 className="text-3xl font-bold text-gray-800 mb-1">자산 처리 이력</h1>
          <p className="text-gray-500 font-medium">동시 지급/교체된 내역은 하나의 그룹으로 묶여 표시되며, 메일도 한 번에 발송됩니다.</p>
        </div>

        {/* 필터 */}
        <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">작업 유형</label>
              <select
                value={actionFilter}
                onChange={e => { setActionFilter(e.target.value); resetToFirstPage(); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="전체">전체</option>
                {actionTypes.map((type: string) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">기간</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); resetToFirstPage(); }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400 text-sm">~</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); resetToFirstPage(); }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-bold text-gray-500 mb-1">검색</label>
              <input
                type="text"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); resetToFirstPage(); }}
                placeholder="사원명 · 사번 · 관리번호 · 모델명 · 사유"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">표시 건수</label>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); resetToFirstPage(); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}건씩</option>)}
              </select>
            </div>

            {isFilterActive && (
              <button
                onClick={resetFilters}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition"
              >
                필터 초기화
              </button>
            )}
          </div>

          <p className="mt-3 text-xs text-gray-500">
            전체 <b className="text-gray-700">{groupedHistories.length.toLocaleString()}</b>건
            {isFilterActive && <> 중 조건에 맞는 <b className="text-blue-600">{filteredGroups.length.toLocaleString()}</b>건</>}
          </p>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-gray-500 font-bold">이력 데이터를 불러오는 중입니다...</div>
        ) : (
          <div className="bg-white shadow-md rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-center border-collapse">
              <thead className="bg-gray-50 text-gray-600 text-sm border-b-2 border-gray-200">
                <tr>
                  <th className="p-4 w-40 font-bold text-gray-700">처리 일시</th>
                  <th className="p-4 w-48 font-bold text-gray-700">사용자 (대상)</th>
                  <th className="p-4 w-28 font-bold text-gray-700">작업 유형</th>
                  <th className="p-4 w-64 font-bold text-gray-700 text-left pl-6">대상 자산</th>
                  <th className="p-4 w-48 font-bold text-gray-700">상세 사유</th>
                  <th className="p-4 w-32 font-bold text-gray-700">알림 작업</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {displayedGroups.length === 0 ? (
                  <tr><td colSpan={6} className="p-12 text-center text-gray-400 font-medium">
                    {isFilterActive ? '조건에 맞는 이력이 없습니다.' : '조회된 이력이 없습니다.'}
                  </td></tr>
                ) : (
                  displayedGroups.map((group: any) => (
                    <tr key={group.historyId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-mono text-gray-500 text-xs">
                        {group.changeDate ? new Date(group.changeDate).toLocaleString('ko-KR') : '-'}
                      </td>
                      <td className="p-4 font-bold text-gray-800">
                        {getEmpName(group.employeeId || group.prevUserId)}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold text-white shadow-sm inline-block ${
                          group.actionType === '입고' ? 'bg-emerald-500' : 
                          group.actionType === '지급' || group.actionType === '교체' ? 'bg-blue-500' : 'bg-amber-500'
                        }`}>
                          {group.actionType}
                        </span>
                      </td>
                      <td className="p-4 text-left pl-6 font-bold text-gray-700">
                        {getAssetDisplayName(group)}
                      </td>
                      <td className="p-4 text-gray-600 break-words whitespace-normal text-xs">
                        {group.reason || '-'}
                      </td>
                      <td className="p-4">
                        {/* 💡 [수정] 반납/회수의 경우 메일 발송 버튼이 나타나지 않도록 수정 */}
                        {(group.actionType === '지급' || group.actionType === '교체') ? (
                          <button 
                            onClick={() => handleSendMail(group)}
                            disabled={sendingMailId === group.historyId}
                            className="bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-gray-100 transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5 mx-auto w-24"
                          >
                            {sendingMailId === group.historyId ? '발송 중...' : '✉️ 메일 발송'}
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* 페이지 이동 */}
            {filteredGroups.length > 0 && (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  총 <b className="text-gray-700">{filteredGroups.length.toLocaleString()}</b>건 중{' '}
                  {(pageStart + 1).toLocaleString()}–{Math.min(pageStart + pageSize, filteredGroups.length).toLocaleString()}건 표시
                  {totalPages > 1 && <> · {safePage} / {totalPages} 페이지</>}
                </span>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={safePage === 1}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      처음
                    </button>
                    <button
                      onClick={() => setCurrentPage(safePage - 1)}
                      disabled={safePage === 1}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      이전
                    </button>

                    {pageNumbers.map(page => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`min-w-[32px] px-2 py-1.5 rounded-lg text-xs font-bold transition ${
                          page === safePage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {page}
                      </button>
                    ))}

                    <button
                      onClick={() => setCurrentPage(safePage + 1)}
                      disabled={safePage === totalPages}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      다음
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={safePage === totalPages}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      마지막
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}