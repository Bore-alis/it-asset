'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ShieldCheck, Paperclip, AlertTriangle, Plus, Trash2, FileText } from 'lucide-react';
import {
  getWipeRecords, completeWipeRecord, createManualWipeRecord,
  addWipeFile, deleteWipeFile, wipeFileUrl,
  getEmployees, getAllAssets,
  type WipeRecord,
} from '../lib/api';

interface Employee {
  employeeId: string;
  name: string;
  status?: string;
  department1?: string;
  department2?: string;
  department3?: string;
}

interface Asset {
  assetId: string;
  category?: string;
  model?: string;
  serialNumber?: string;
}

const WIPE_METHODS = [
  '디스크 완전삭제 (Secure Erase)',
  '디스크 포맷 + OS 재설치',
  '공장 초기화',
  '저장장치 물리 폐기',
  '기타',
];

const RETENTION_YEARS = 3;

export default function WipePage() {
  const [records, setRecords] = useState<WipeRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'대기' | '완료' | '전체'>('대기');
  const [searchTerm, setSearchTerm] = useState('');

  // 페이지네이션 (건수가 많지 않아 서버 페이징 없이 화면에서 나눈다)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 완료 처리 모달
  const [completeTarget, setCompleteTarget] = useState<WipeRecord | null>(null);
  const [completeForm, setCompleteForm] = useState({
    wipeMethod: WIPE_METHODS[0],
    performedBy: '',
    wipedDate: '',
    note: '',
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 상세 모달
  const [detailTarget, setDetailTarget] = useState<WipeRecord | null>(null);

  // 수동 등록 모달
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ assetId: '', employeeId: '' });

  // 렌더 중 Date.now() 를 직접 부르면 렌더마다 값이 달라지므로 마운트 시점 기준으로 한 번만 고정한다
  const [nowTs] = useState(() => Date.now());

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [wipeData, empData, assetData] = await Promise.all([
        getWipeRecords(), getEmployees(), getAllAssets(),
      ]);
      setRecords(wipeData || []);
      setEmployees(empData || []);
      setAssets(assetData || []);
    } catch (error) {
      console.error('퇴직자 증적 로딩 실패', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  /* ==========================================
   * 보관기한 계산
   * ========================================== */
  const daysUntil = useCallback((dateStr?: string) => {
    if (!dateStr) return null;
    const target = new Date(dateStr).getTime();
    if (isNaN(target)) return null;
    return Math.ceil((target - nowTs) / (1000 * 60 * 60 * 24));
  }, [nowTs]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const stats = useMemo(() => {
    const pending = records.filter(r => r.status === '대기').length;
    const done = records.filter(r => r.status === '완료').length;
    const expiringSoon = records.filter(r => {
      const d = daysUntil(r.expiresAt);
      return d !== null && d >= 0 && d <= 30;
    }).length;
    return { pending, done, expiringSoon };
  }, [records, daysUntil]);

  const filteredRecords = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return records
      .filter(r => activeTab === '전체' || r.status === activeTab)
      .filter(r => {
        if (!keyword) return true;
        return [r.employeeName, r.employeeId, r.assetId, r.assetModel, r.serialNumber, r.department]
          .some(v => (v || '').toLowerCase().includes(keyword));
      });
  }, [records, activeTab, searchTerm]);

  // 삭제·완료 처리로 목록이 줄어 현재 페이지가 범위를 벗어날 수 있어, 렌더 시점에 보정한다
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedRecords = filteredRecords.slice(pageStart, pageStart + pageSize);

  // 탭·검색·페이지 크기가 바뀌면 첫 페이지부터 다시 본다
  const resetToFirstPage = () => setCurrentPage(1);

  // 현재 페이지 주변 번호만 노출 (페이지가 많아져도 버튼이 넘치지 않도록)
  const pageNumbers = useMemo(() => {
    const window = 5;
    let start = Math.max(1, safePage - Math.floor(window / 2));
    const end = Math.min(totalPages, start + window - 1);
    start = Math.max(1, end - window + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [safePage, totalPages]);

  /* ==========================================
   * 완료 처리
   * ========================================== */
  const openCompleteModal = (record: WipeRecord) => {
    const today = new Date();
    setCompleteTarget(record);
    setCompleteForm({
      wipeMethod: WIPE_METHODS[0],
      performedBy: (typeof window !== 'undefined' && localStorage.getItem('loginUser')) || '',
      wipedDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
      note: '',
    });
    setSelectedFiles([]);
  };

  const handleComplete = async () => {
    if (!completeTarget) return;
    if (!completeForm.performedBy.trim()) return alert('처리 담당자를 입력해주세요.');
    if (selectedFiles.length === 0 && !confirm('첨부된 증적 파일이 없습니다. 그래도 완료 처리하시겠습니까?')) return;

    setIsSubmitting(true);
    try {
      // 백엔드가 ISO date-time 을 기대하므로 시각을 붙여 보낸다
      const now = new Date();
      const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
      const success = await completeWipeRecord(
        completeTarget.wipeId,
        {
          wipeMethod: completeForm.wipeMethod,
          performedBy: completeForm.performedBy.trim(),
          note: completeForm.note,
          wipedAt: `${completeForm.wipedDate}T${timePart}`,
        },
        selectedFiles,
      );
      if (success) {
        alert('퇴직자 증적이 등록되었습니다.');
        setCompleteTarget(null);
        loadData();
      } else {
        alert('증적 등록에 실패했습니다. 파일 용량(1건당 20MB)을 확인해주세요.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ==========================================
   * 수동 등록 / 첨부 관리
   * ========================================== */
  const handleManualCreate = async () => {
    if (!manualForm.assetId) return alert('자산을 선택해주세요.');
    const asset = assets.find(a => a.assetId === manualForm.assetId);
    const emp = employees.find(e => e.employeeId === manualForm.employeeId);

    const success = await createManualWipeRecord({
      assetId: manualForm.assetId,
      assetCategory: asset?.category,
      assetModel: asset?.model,
      serialNumber: asset?.serialNumber,
      employeeId: emp?.employeeId,
      employeeName: emp?.name,
      department: emp?.department3 || emp?.department2 || emp?.department1,
    });

    if (success) {
      alert('초기화 대기 항목이 추가되었습니다.');
      setIsManualOpen(false);
      setManualForm({ assetId: '', employeeId: '' });
      loadData();
    } else {
      alert('추가에 실패했습니다.');
    }
  };

  const handleAddFile = async (wipeId: number, file: File) => {
    const success = await addWipeFile(wipeId, file);
    if (!success) return alert('첨부에 실패했습니다. (이미지/PDF, 20MB 이하만 가능)');
    const refreshed = await getWipeRecords();
    setRecords(refreshed || []);
    setDetailTarget((refreshed || []).find(r => r.wipeId === wipeId) || null);
  };

  const handleDeleteFile = async (fileId: number, wipeId: number) => {
    if (!confirm('이 증적 파일을 삭제하시겠습니까? 삭제하면 복구할 수 없습니다.')) return;
    const success = await deleteWipeFile(fileId);
    if (!success) return alert('삭제에 실패했습니다.');
    const refreshed = await getWipeRecords();
    setRecords(refreshed || []);
    setDetailTarget((refreshed || []).find(r => r.wipeId === wipeId) || null);
  };

  const retiredEmployees = employees.filter(e => e.status === '퇴사');

  /* ==========================================
   * 렌더링 헬퍼
   * ========================================== */
  const renderRetentionBadge = (record: WipeRecord) => {
    if (record.status !== '완료' || !record.expiresAt) return <span className="text-gray-400">-</span>;
    const days = daysUntil(record.expiresAt);
    if (days === null) return <span className="text-gray-400">-</span>;

    if (days < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">
          만료됨 (파기 대상)
        </span>
      );
    }
    if (days <= 30) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-700">
          D-{days} · {formatDate(record.expiresAt)}
        </span>
      );
    }
    return (
      <span className="text-xs text-gray-600">
        {formatDate(record.expiresAt)} <span className="text-gray-400">(D-{days})</span>
      </span>
    );
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* 헤더 */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <ShieldCheck size={26} className="text-blue-600" />
              퇴직자 증적
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              퇴사 처리 시 노트북 · 데스크탑/PC가 자동으로 초기화 대기 목록에 등록됩니다.
              증적은 초기화 완료일로부터 <b>{RETENTION_YEARS}년</b> 보관되며, 기한이 지나면 첨부파일까지 자동 파기됩니다.
            </p>
          </div>
          <button
            onClick={() => setIsManualOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition shrink-0"
          >
            <Plus size={16} /> 수동 등록
          </button>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm text-gray-500 font-medium">초기화 대기</div>
            <div className="text-3xl font-bold text-orange-600 mt-1">{stats.pending}<span className="text-base font-medium text-gray-400 ml-1">건</span></div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm text-gray-500 font-medium">증적 완료</div>
            <div className="text-3xl font-bold text-blue-600 mt-1">{stats.done}<span className="text-base font-medium text-gray-400 ml-1">건</span></div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm text-gray-500 font-medium">보관기한 30일 이내</div>
            <div className="text-3xl font-bold text-red-500 mt-1">{stats.expiringSoon}<span className="text-base font-medium text-gray-400 ml-1">건</span></div>
          </div>
        </div>

        {stats.pending > 0 && (
          <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-800 rounded-lg p-3 text-sm">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>증적이 등록되지 않은 퇴직자 장비가 <b>{stats.pending}건</b> 있습니다. 초기화 완료 후 증적을 등록해주세요.</span>
          </div>
        )}

        {/* 탭 + 검색 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 border-b border-gray-100">
            <div className="flex gap-1">
              {(['대기', '완료', '전체'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); resetToFirstPage(); }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
                    activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {tab === '대기' ? '초기화 대기' : tab === '완료' ? '증적 완료' : '전체'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); resetToFirstPage(); }}
                placeholder="퇴직자명 · 사번 · 관리번호 · 모델명 검색"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 w-full md:w-80"
              />
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); resetToFirstPage(); }}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-blue-400 bg-white shrink-0"
                title="페이지당 표시 건수"
              >
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}건</option>)}
              </select>
            </div>
          </div>

          {/* 목록 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">상태</th>
                  <th className="px-4 py-3 text-left font-bold">퇴직자</th>
                  <th className="px-4 py-3 text-left font-bold">자산</th>
                  <th className="px-4 py-3 text-left font-bold">S/N</th>
                  <th className="px-4 py-3 text-left font-bold">퇴사일</th>
                  <th className="px-4 py-3 text-left font-bold">초기화일 / 담당자</th>
                  <th className="px-4 py-3 text-left font-bold">보관기한</th>
                  <th className="px-4 py-3 text-center font-bold">증적</th>
                  <th className="px-4 py-3 text-center font-bold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={9} className="text-center py-16 text-gray-400">불러오는 중...</td></tr>
                ) : pagedRecords.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-16 text-gray-400">해당하는 항목이 없습니다.</td></tr>
                ) : pagedRecords.map(record => (
                  <tr key={record.wipeId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        record.status === '완료' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-800">{record.employeeName || '-'}</div>
                      <div className="text-xs text-gray-400">{record.employeeId} · {record.department || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-700">[{record.assetCategory}] {record.assetModel}</div>
                      <div className="text-xs text-gray-400 font-mono">{record.assetId}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{record.serialNumber || '-'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(record.retiredAt)}</td>
                    <td className="px-4 py-3">
                      {record.status === '완료' ? (
                        <>
                          <div className="text-gray-700">{formatDate(record.wipedAt)}</div>
                          <div className="text-xs text-gray-400">{record.performedBy} · {record.wipeMethod}</div>
                        </>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-3">{renderRetentionBadge(record)}</td>
                    <td className="px-4 py-3 text-center">
                      {record.files && record.files.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                          <Paperclip size={13} /> {record.files.length}
                        </span>
                      ) : <span className="text-gray-300 text-xs">없음</span>}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {record.status === '대기' ? (
                        <button
                          onClick={() => openCompleteModal(record)}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
                        >
                          완료 처리
                        </button>
                      ) : (
                        <button
                          onClick={() => setDetailTarget(record)}
                          className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition"
                        >
                          증적 보기
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지 이동 */}
          {!isLoading && filteredRecords.length > 0 && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                총 <b className="text-gray-700">{filteredRecords.length}</b>건 중{' '}
                {pageStart + 1}–{Math.min(pageStart + pageSize, filteredRecords.length)}건 표시
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
      </div>

      {/* 완료 처리 모달 */}
      {completeTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">퇴직자 증적 등록</h2>
              <p className="text-xs text-gray-500 mt-1">
                {completeTarget.employeeName}({completeTarget.employeeId}) · [{completeTarget.assetCategory}] {completeTarget.assetModel} · {completeTarget.assetId}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">초기화 방식</label>
                <select
                  value={completeForm.wipeMethod}
                  onChange={e => setCompleteForm({ ...completeForm, wipeMethod: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-400 bg-white"
                >
                  {WIPE_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">초기화 일자</label>
                  <input
                    type="date"
                    value={completeForm.wipedDate}
                    onChange={e => setCompleteForm({ ...completeForm, wipedDate: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">처리 담당자</label>
                  <input
                    value={completeForm.performedBy}
                    onChange={e => setCompleteForm({ ...completeForm, performedBy: e.target.value })}
                    placeholder="담당자 계정/이름"
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">비고</label>
                <textarea
                  value={completeForm.note}
                  onChange={e => setCompleteForm({ ...completeForm, note: e.target.value })}
                  rows={2}
                  placeholder="특이사항 (선택)"
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  증적 파일 <span className="font-normal text-gray-400">(초기화 완료 화면 스크린샷 / 확인서 · 이미지 또는 PDF, 1건당 20MB 이하)</span>
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                  onChange={e => setSelectedFiles(Array.from(e.target.files || []))}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
                {selectedFiles.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {selectedFiles.map((f, i) => (
                      <li key={i} className="text-xs text-gray-500 flex items-center gap-1.5">
                        <FileText size={12} /> {f.name} <span className="text-gray-400">({(f.size / 1024 / 1024).toFixed(1)}MB)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => setCompleteTarget(null)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleComplete}
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? '등록 중...' : '증적 등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 증적 상세 모달 */}
      {detailTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">퇴직자 증적</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {detailTarget.employeeName}({detailTarget.employeeId}) · [{detailTarget.assetCategory}] {detailTarget.assetModel}
                </p>
              </div>
              <button onClick={() => setDetailTarget(null)} className="text-gray-400 hover:text-gray-600 text-sm font-bold">닫기</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400 text-xs block">관리번호</span><span className="font-mono">{detailTarget.assetId}</span></div>
                <div><span className="text-gray-400 text-xs block">S/N</span><span className="font-mono">{detailTarget.serialNumber || '-'}</span></div>
                <div><span className="text-gray-400 text-xs block">초기화 일자</span>{formatDate(detailTarget.wipedAt)}</div>
                <div><span className="text-gray-400 text-xs block">처리 담당자</span>{detailTarget.performedBy || '-'}</div>
                <div><span className="text-gray-400 text-xs block">초기화 방식</span>{detailTarget.wipeMethod || '-'}</div>
                <div><span className="text-gray-400 text-xs block">보관기한</span>{renderRetentionBadge(detailTarget)}</div>
              </div>
              {detailTarget.note && (
                <div className="text-sm bg-gray-50 rounded-lg p-3">
                  <span className="text-gray-400 text-xs block mb-1">비고</span>
                  {detailTarget.note}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-gray-700">첨부 증적 ({detailTarget.files?.length || 0})</span>
                  <label className="text-xs text-blue-600 font-bold cursor-pointer hover:underline">
                    + 파일 추가
                    <input
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleAddFile(detailTarget.wipeId, file);
                      }}
                    />
                  </label>
                </div>
                {(!detailTarget.files || detailTarget.files.length === 0) ? (
                  <p className="text-sm text-gray-400 py-6 text-center bg-gray-50 rounded-lg">첨부된 증적 파일이 없습니다.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {detailTarget.files.map(file => (
                      <div key={file.fileId} className="border border-gray-200 rounded-lg overflow-hidden">
                        {file.contentType?.startsWith('image/') ? (
                          <a href={wipeFileUrl(file.fileId)} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={wipeFileUrl(file.fileId)} alt={file.originalName} className="w-full h-36 object-cover bg-gray-50" />
                          </a>
                        ) : (
                          <a href={wipeFileUrl(file.fileId)} target="_blank" rel="noreferrer"
                            className="flex items-center justify-center h-36 bg-gray-50 text-gray-500 gap-2 text-sm">
                            <FileText size={20} /> PDF 열기
                          </a>
                        )}
                        <div className="flex items-center justify-between px-2.5 py-2 gap-2">
                          <span className="text-[11px] text-gray-600 truncate" title={file.originalName}>{file.originalName}</span>
                          <button
                            onClick={() => handleDeleteFile(file.fileId, detailTarget.wipeId)}
                            className="text-gray-300 hover:text-red-500 shrink-0"
                            title="삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 수동 등록 모달 */}
      {isManualOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">초기화 대기 수동 등록</h2>
              <p className="text-xs text-gray-500 mt-1">기능 도입 이전에 퇴사한 인원의 장비를 증적 목록에 추가합니다.</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">자산 (관리번호)</label>
                <select
                  value={manualForm.assetId}
                  onChange={e => setManualForm({ ...manualForm, assetId: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-400 bg-white"
                >
                  <option value="">선택하세요</option>
                  {assets.map(a => (
                    <option key={a.assetId} value={a.assetId}>
                      {a.assetId} · [{a.category}] {a.model}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">퇴직자</label>
                <select
                  value={manualForm.employeeId}
                  onChange={e => setManualForm({ ...manualForm, employeeId: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm outline-none focus:border-blue-400 bg-white"
                >
                  <option value="">선택하세요 (퇴사 상태 인원)</option>
                  {retiredEmployees.map(e => (
                    <option key={e.employeeId} value={e.employeeId}>
                      {e.name} ({e.employeeId})
                    </option>
                  ))}
                </select>
                {retiredEmployees.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">퇴사 상태로 등록된 인원이 없습니다.</p>
                )}
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => setIsManualOpen(false)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleManualCreate}
                className="flex-1 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
