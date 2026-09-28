'use client';

import { useState, useEffect } from 'react';
import * as xlsx from 'xlsx';
import { 
  getAllAssets, getEmployees, registerAsset, registerBulkAssets, 
  updateAsset, deleteAsset, getAssetHistory, returnAsset, changeAssetStatus
} from '../lib/api';

/* ==========================================
 * 💡 데이터 타입 명시
 * ========================================== */
interface Asset {
  assetId: string;
  category: string;
  model: string;
  serialNumber?: string;
  accountingLedger?: string;
  accountingLedgerIndex?: string;
  status?: string;
  currentUserId?: string | null;
  reason?: string;
  purchaseDate?: string;
  residualValue?: number;
}

interface Employee {
  employeeId: string;
  name: string;
  department1: string;
}

export default function AssetsPage() {
  
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [historyList, setHistoryList] = useState([]);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [addForm, setAddForm] = useState({ assetId: '', category: '', model: '', serialNumber: '', accountingLedger: '', accountingLedgerIndex: '', reason: '', purchaseDate: '' });
  const [editForm, setEditForm] = useState<Asset>({ assetId: '', category: '', model: '', serialNumber: '', status: '', currentUserId: '', accountingLedger: '', accountingLedgerIndex: '', reason: '', purchaseDate: '', residualValue: 0 });
  const [selectedAssetId, setSelectedAssetId] = useState('');

  const categories = ['전체', '노트북', '모니터', '데스크탑', '소프트웨어', '프린터', '기타'];
  const [activeTab, setActiveTab] = useState('전체');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [assetStatusFilter, setAssetStatusFilter] = useState('전체');
  const [sortConfig, setSortConfig] = useState({ key: 'accountingLedger', direction: 'asc' });
  const [statusFilter, setStatusFilter] = useState('전체'); 

  const loadData = async () => {
    try {
      const [assetData, empData] = await Promise.all([
        getAllAssets(), getEmployees()
      ]);
      setAssets(assetData || []);
      setEmployees(empData || []);
    } catch (e) {
      console.error("데이터 로딩 실패", e);
    }
  };

  useEffect(() => { loadData(); }, []);

  const convertDateString = (val: any) => {
    if (!val) return '';
    const str = String(val).trim();
    if (['비대상', '-', '없음'].includes(str)) return str;

    const num = Number(str);
    if (!isNaN(num) && num > 20000 && num < 90000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      return date.toISOString().split('T')[0];
    }
    return str;
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await registerAsset(addForm)) {
      setIsAddModalOpen(false);
      setAddForm({ assetId: '', category: '', model: '', serialNumber: '', accountingLedger: '', accountingLedgerIndex: '', reason: '', purchaseDate: '' });
      loadData();
    }
  };

  const getDepreciationStatus = (dateString: string, idxString: string, ledgerString: string) => {
    const safeIdx = idxString ? String(idxString).trim() : '-';
    const safeLedger = ledgerString ? String(ledgerString).trim() : '-';
    const safeDate = dateString ? String(dateString).trim() : '-';
    
    if (['비대상', '-', '없음'].includes(safeIdx) || ['비대상', '-', '없음'].includes(safeLedger)) {
      return { color: '#3b82f6', text: '정상 (비대상)', filterType: '비대상', tooltip: '가액 확인 비대상 자산' };
    }

    if (!safeDate || safeDate === '-') {
      return { color: '#9ca3af', text: '미상 (구입일 누락)', filterType: '미상', tooltip: '구입일자 정보가 없어 가액 계산이 불가능합니다.' };
    }
    
    const purchase = new Date(convertDateString(safeDate));
    if (isNaN(purchase.getTime())) {
      return { color: '#9ca3af', text: '미상 (형식 오류)', filterType: '미상', tooltip: '구입일자의 날짜 형식이 올바르지 않습니다.' };
    }

    const today = new Date();
    const diffMonths = (today.getFullYear() - purchase.getFullYear()) * 12 + (today.getMonth() - purchase.getMonth());

    if (diffMonths >= 48) {
      return { color: '#ef4444', text: '초과', filterType: '초과', tooltip: `구입일: ${purchase.toISOString().split('T')[0]} (${diffMonths}개월 경과) - 4년 초과` };
    } else {
      return { color: '#3b82f6', text: '정상', filterType: '정상', tooltip: `구입일: ${purchase.toISOString().split('T')[0]} (${diffMonths}개월 경과) - 정상 가액` };
    }
  };

  const stats = { normal: 0, exceeded: 0, na: 0, unknown: 0 };
  assets.forEach((asset: any) => {
    const s = getDepreciationStatus(asset.purchaseDate, asset.accountingLedgerIndex, asset.accountingLedger);
    if (s.filterType === '정상') stats.normal++;
    else if (s.filterType === '초과') stats.exceeded++;
    else if (s.filterType === '비대상') stats.na++;
    else if (s.filterType === '미상') stats.unknown++;
  });

  const getExportTargetAssets = (exportAll: boolean) => {
    if (exportAll) {
      return [...assets].sort((a: any, b: any) => {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return assets
      .filter((asset: any) => {
        const matchCategory = activeTab === '전체' || asset.category === activeTab;
        const statusInfo = getDepreciationStatus(asset.purchaseDate, asset.accountingLedgerIndex, asset.accountingLedger);
        const matchDepreciationStatus = statusFilter === '전체' || statusInfo.filterType === statusFilter;
        
        const actualStatus = asset.status || '재고';
        const matchAssetStatus = assetStatusFilter === '전체' || 
          (assetStatusFilter === '고장/수리' ? (actualStatus === '고장' || actualStatus === '수리중') : actualStatus === assetStatusFilter);

        const searchLower = searchTerm.toLowerCase();
        const matchSearch = 
          (asset.assetId || '').toLowerCase().includes(searchLower) || 
          (asset.model || '').toLowerCase().includes(searchLower) || 
          (asset.serialNumber || '').toLowerCase().includes(searchLower) ||
          (asset.currentUserId || '').toLowerCase().includes(searchLower) ||
          (asset.accountingLedger || '').toLowerCase().includes(searchLower) ||
          (asset.reason || '').toLowerCase().includes(searchLower);
          
        return matchCategory && matchDepreciationStatus && matchSearch && matchAssetStatus;
      })
      .sort((a: any, b: any) => {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
  };

  const exportToExcel = (exportAll: boolean) => {
    const targets = getExportTargetAssets(exportAll);
    if (targets.length === 0) return alert('내보낼 자산 데이터가 존재하지 않습니다.');

    const exportData = targets.map((a: any) => {
      const safeDate = convertDateString(a.purchaseDate);
      const statusInfo = getDepreciationStatus(a.purchaseDate, a.accountingLedgerIndex, a.accountingLedger);
      const owner = employees.find(e => e.employeeId === a.currentUserId);

      return {
        '회계장부': a.accountingLedger || '',
        '회계장부(index)': a.accountingLedgerIndex || '',
        '관리 번호': a.assetId || '',
        '분류': a.category || '',
        '모델명': a.model || '',
        '시리얼넘버': a.serialNumber || '',
        '구입일자': safeDate === '-' ? '' : safeDate, 
        '가액 상태': statusInfo.text,
        '잔존가액': a.residualValue || 0,
        '특이사항': a.reason || '',
        '상태': a.status || '재고',
        '사용자 사번': a.currentUserId || '',
        '사용자 이름': owner ? owner.name : '',
        '소속 본부': owner ? owner.department1 : '',
      };
    });

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "자산관리대장");
    
    const fileName = exportAll ? "전체자산대장" : "필터항목자산대장";
    xlsx.writeFile(workbook, `${fileName}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const downloadTemplate = () => {
    const templateData = [
      ['회계장부', '회계장부(index)', '관리 번호', '분류', '모델명', '시리얼넘버', '구입일자', '특이사항'], 
      ['2026년 상반기 비품', '1', 'NT-2026-001', '노트북', 'LG 그램 16', 'ABC12345', '2021-01-15', '임원 전용 지급품'],
      ['2026년 상반기 비품', '-', 'MT-2026-001', '모니터', 'LG 울트라파인 27', '', '2025-05-10', '우측 하단 스크래치'],
      ['비대상', '-', 'MS-2026-001', '기타', '마우스', '', '-', '소모품 처리']
    ];

    const worksheet = xlsx.utils.aoa_to_sheet(templateData);
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 30 }
    ];

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "자산일괄등록양식");
    xlsx.writeFile(workbook, "IT자산_일괄등록_양식.xlsx");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setExcelFile(file);
  };

  const submitBulkRegister = async () => {
    if (!excelFile) return alert('엑셀 파일을 첨부해주세요.');
    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        const workbook = xlsx.read(data, { type: 'binary' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false });
        
        const normalizedData = rawData.map(row => {
          const cleanRow: any = {};
          Object.keys(row).forEach(key => cleanRow[key.replace(/\s+/g, '').toLowerCase()] = row[key]);
          return cleanRow;
        });
        
        const formattedData = normalizedData.map(row => ({
          assetId: String(row['관리번호'] || ''),
          category: String(row['분류'] || '기타'),
          model: String(row['모델명'] || ''),
          serialNumber: String(row['시리얼넘버'] || ''),
          accountingLedger: String(row['회계장부'] || ''),
          accountingLedgerIndex: String(row['회계장부(index)'] || row['회계장부index'] || ''),
          purchaseDate: convertDateString(row['구입일자'] || row['취득일자'] || ''),
          reason: String(row['특이사항'] || row['비고'] || '')
        })).filter(item => item.assetId && item.model);

        if (formattedData.length === 0) {
          alert('유효한 데이터가 없습니다. 필수 항목(관리 번호, 모델명)을 확인해주세요.');
          setIsUploading(false); return;
        }

        if (confirm(`총 ${formattedData.length}개의 자산을 일괄 등록 및 덮어쓰기 하시겠습니까?`)) {
          if (await registerBulkAssets(formattedData)) {
            alert('성공적으로 처리되었습니다.');
            setIsExcelModalOpen(false); setExcelFile(null); loadData();
          } else {
            alert('등록 중 오류가 발생했습니다.');
          }
        }
      } catch (error) {
        alert('엑셀 파일을 읽는 중 오류가 발생했습니다.');
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsBinaryString(excelFile);
  };

  const openEditModal = (asset: any) => {
    setEditForm({ ...asset, purchaseDate: convertDateString(asset.purchaseDate) });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await updateAsset(editForm.assetId, editForm)) {
      setIsEditModalOpen(false); loadData();
    }
  };

  const handleDelete = async (assetId: string) => {
    if (confirm('DB에서 완전히 삭제 처리하시겠습니까?')) if (await deleteAsset(assetId)) loadData();
  };

  const handleReturn = async (assetId: string) => {
    if (confirm('사용 중인 자산을 창고로 회수하시겠습니까?')) if (await returnAsset(assetId)) loadData();
  };

  const openHistoryModal = async (assetId: string) => {
    setSelectedAssetId(assetId);
    setHistoryList(await getAssetHistory(assetId));
    setIsHistoryModalOpen(true);
  };

  // 💡 [핵심 버그 수정] 화면에서 클릭 즉시 상태가 바뀌는 'Optimistic Update(낙관적 업데이트)' 기법 적용!
  const handleStatusChange = async (assetId: string, newStatus: string) => {
    if(confirm(`해당 자산을 '${newStatus}' 상태로 처리하시겠습니까?`)) {
      
      // 1. 서버 응답을 기다리지 않고 화면(UI)의 배열을 즉시 업데이트 (페이지 문제 해결)
      setAssets(prevAssets => 
        prevAssets.map(asset => 
          asset.assetId === assetId ? { ...asset, status: newStatus } : asset
        )
      );

      // 2. 백그라운드에서 실제 DB 상태 변경 요청
      const success = await changeAssetStatus(assetId, newStatus);
      
      if(!success) {
        // 실패 시 경고를 띄우고, DB의 원래 데이터로 다시 덮어씌워서 롤백시킵니다.
        alert('서버 통신 실패: 상태가 변경되지 않았습니다.');
      }
      
      // 3. 확실한 동기화를 위해 서버의 최신 데이터를 한 번 더 불러옵니다.
      loadData();
    }
  };

  const requestSort = (key: string) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  // 화면에는 성능상 앞 100건만 그리되, 몇 건이 가려졌는지 사용자에게 알려준다
  // (엑셀 내보내기는 getExportTargetAssets 로 필터 전체를 대상으로 하므로 이 제한과 무관)
  const DISPLAY_LIMIT = 100;

  const matchedAssets = assets
    .filter((asset: any) => {
      const matchCategory = activeTab === '전체' || asset.category === activeTab;
      
      const statusInfo = getDepreciationStatus(asset.purchaseDate, asset.accountingLedgerIndex, asset.accountingLedger);
      const matchDepreciationStatus = statusFilter === '전체' || statusInfo.filterType === statusFilter;

      const actualStatus = asset.status || '재고';
      const matchAssetStatus = assetStatusFilter === '전체' || 
        (assetStatusFilter === '고장/수리' ? (actualStatus === '고장' || actualStatus === '수리중') : actualStatus === assetStatusFilter);

      const searchLower = searchTerm.toLowerCase();
      const matchSearch = 
        (asset.assetId || '').toLowerCase().includes(searchLower) || 
        (asset.model || '').toLowerCase().includes(searchLower) || 
        (asset.serialNumber || '').toLowerCase().includes(searchLower) ||
        (asset.currentUserId || '').toLowerCase().includes(searchLower) ||
        (asset.accountingLedger || '').toLowerCase().includes(searchLower) ||
        (asset.reason || '').toLowerCase().includes(searchLower);
        
      return matchCategory && matchDepreciationStatus && matchSearch && matchAssetStatus;
    })
    .sort((a: any, b: any) => {
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const filteredAndSortedAssets = matchedAssets.slice(0, DISPLAY_LIMIT);
  const hiddenAssetCount = matchedAssets.length - filteredAndSortedAssets.length;

  const getOwnerName = (userId: string | null | undefined) => {
    if (!userId) return '-';
    const emp = employees.find(e => e.employeeId === userId);
    return emp ? `${emp.name} (${emp.department1})` : userId;
  };

  return (
    <div className="p-3 bg-gray-50 min-h-screen">
      <div className="w-full max-w-[100%] mx-auto">
        
        <div className="flex flex-col gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-1">IT 자산 관리 대장</h1>
            <p className="text-gray-500 font-medium">
              총 <span className="text-emerald-600 font-bold">{assets.length}</span>건 등록됨
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 items-center justify-end">
            <button onClick={downloadTemplate} className="bg-white text-gray-700 border border-gray-300 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-1.5">
              📄 양식 다운로드
            </button>
            <button onClick={() => exportToExcel(true)} className="bg-white text-gray-700 border border-gray-300 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-1.5">
              📥 전체 Export
            </button>
            <button onClick={() => exportToExcel(false)} className="bg-white text-gray-700 border border-gray-300 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-1.5">
              📥 필터 항목 Export
            </button>

            <div className="w-px h-5 bg-gray-300 mx-1 hidden sm:block"></div>

            <button onClick={() => setIsExcelModalOpen(true)} className="bg-white text-emerald-600 border border-emerald-600 px-3 py-2 rounded-md text-sm font-bold hover:bg-emerald-50 transition shadow-sm flex items-center gap-1.5">
              📤 엑셀 일괄 등록
            </button>
            <button onClick={() => setIsAddModalOpen(true)} className="bg-emerald-600 text-white border border-emerald-600 px-4 py-2 rounded-md text-sm font-bold hover:bg-emerald-700 transition shadow-sm flex items-center gap-1.5">
              + 단건 수동 입고
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div onClick={() => setStatusFilter('전체')} className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-center ${statusFilter==='전체' ? 'border-gray-800 shadow-md bg-gray-50' : 'bg-white hover:bg-gray-50'}`}>
            <p className="text-xs font-bold text-gray-500 mb-1">전체 자산</p>
            <p className="text-2xl font-black text-gray-800">{assets.length}<span className="text-sm font-medium text-gray-400 ml-1">건</span></p>
          </div>
          <div onClick={() => setStatusFilter('정상')} className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-center ${statusFilter==='정상' ? 'border-blue-500 shadow-md bg-blue-50' : 'bg-white hover:bg-blue-50'}`}>
            <p className="text-xs font-bold text-blue-600 mb-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> 정상 가액</p>
            <p className="text-2xl font-black text-gray-800">{stats.normal}<span className="text-sm font-medium text-gray-400 ml-1">건</span></p>
          </div>
          <div onClick={() => setStatusFilter('초과')} className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-center ${statusFilter==='초과' ? 'border-red-500 shadow-md bg-red-50' : 'bg-white hover:bg-red-50'}`}>
            <p className="text-xs font-bold text-red-600 mb-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> 내용연수 초과</p>
            <p className="text-2xl font-black text-gray-800">{stats.exceeded}<span className="text-sm font-medium text-gray-400 ml-1">건</span></p>
          </div>
          <div onClick={() => setStatusFilter('비대상')} className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-center ${statusFilter==='비대상' ? 'border-indigo-500 shadow-md bg-indigo-50' : 'bg-white hover:bg-indigo-50'}`}>
            <p className="text-xs font-bold text-indigo-600 mb-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> 비대상 (소모품)</p>
            <p className="text-2xl font-black text-gray-800">{stats.na}<span className="text-sm font-medium text-gray-400 ml-1">건</span></p>
          </div>
          <div onClick={() => setStatusFilter('미상')} className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-center ${statusFilter==='미상' ? 'border-gray-400 shadow-md bg-gray-100' : 'bg-white hover:bg-gray-100'}`}>
            <p className="text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400"></span> 정보 누락 (오류)</p>
            <p className="text-2xl font-black text-gray-800">{stats.unknown}<span className="text-sm font-medium text-gray-400 ml-1">건</span></p>
          </div>
        </div>

        <div className="bg-white rounded-t-lg border-b shadow-sm p-4 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat} onClick={() => { setActiveTab(cat); setSearchTerm(''); }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === cat ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700 bg-gray-100'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            
            <div className="flex w-full md:w-auto gap-2">
              <select
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                value={assetStatusFilter}
                onChange={(e) => setAssetStatusFilter(e.target.value)}
              >
                <option value="전체">상태: 전체</option>
                <option value="재고">📦 재고 (창고)</option>
                <option value="사용중">💻 사용중</option>
                <option value="고장/수리">🔧 고장/수리</option>
                <option value="폐기">🗑️ 폐기</option>
              </select>
              <div className="relative flex-1 md:w-64">
                <input type="text" placeholder={`${activeTab} 항목에서 통합 검색...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full border border-gray-300 rounded-lg pl-4 pr-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-gray-50"/>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-b-lg border border-t-0 overflow-hidden">
          <table className="w-full text-center border-collapse text-[11px] table-fixed">
            <thead className="bg-gray-50 text-gray-600 text-[11px] border-b-2 border-gray-200">
              <tr>
                <th className="w-[7%] px-1.5 py-4 font-bold cursor-pointer hover:bg-gray-200 text-purple-700 bg-purple-50/50 border-r border-gray-100 text-center" onClick={() => requestSort('accountingLedger')} title="회계장부">장부명 ↕</th>
                <th className="w-[8%] px-1.5 py-4 font-bold cursor-pointer hover:bg-gray-200 text-purple-700 bg-purple-50/50 border-r border-gray-100 text-center" onClick={() => requestSort('accountingLedgerIndex')} title="회계장부(idx)">idx ↕</th>
                <th className="w-[10%] px-1.5 py-4 font-bold cursor-pointer hover:bg-gray-200 border-r border-gray-100 text-center" onClick={() => requestSort('assetId')}>관리번호 ↕</th>
                <th className="w-[5%] px-1.5 py-4 font-bold cursor-pointer hover:bg-gray-200 border-r border-gray-100 text-center" onClick={() => requestSort('category')}>분류 ↕</th>
                <th className="w-[12%] px-1.5 py-4 font-bold cursor-pointer hover:bg-gray-200 border-r border-gray-100 text-center" onClick={() => requestSort('model')}>모델명 ↕</th>
                <th className="w-[9%] px-1.5 py-4 font-bold cursor-pointer hover:bg-gray-200 border-r border-gray-100 text-center" onClick={() => requestSort('serialNumber')}>S/N ↕</th>
                <th className="w-[8%] px-1.5 py-4 font-bold cursor-pointer hover:bg-gray-200 border-r border-gray-100 text-center" onClick={() => requestSort('purchaseDate')}>구입일 ↕</th>
                <th className="w-[5%] px-1.5 py-4 font-bold border-r border-gray-100 text-center" title="가액상태">가액</th>
                <th className="w-[10%] px-1.5 py-4 font-bold cursor-pointer hover:bg-gray-200 border-r border-gray-100 text-center" onClick={() => requestSort('reason')}>특이사항 ↕</th>
                <th className="w-[5%] px-1.5 py-4 font-bold cursor-pointer hover:bg-gray-200 border-r border-gray-100 text-center" onClick={() => requestSort('status')}>상태 ↕</th>
                <th className="w-[7%] px-1.5 py-4 font-bold cursor-pointer hover:bg-gray-200 border-r border-gray-100 text-center" onClick={() => requestSort('currentUserId')}>사용처 ↕</th>
                <th className="w-[14%] px-1.5 py-4 font-bold text-center">관리 작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedAssets.length === 0 ? (
                <tr><td colSpan={12} className="p-8 text-center text-gray-500 font-medium text-[12px]">검색어(또는 필터)에 해당하는 자산이 없습니다.</td></tr>
              ) : (
                filteredAndSortedAssets.map((asset: any) => {
                  const statusInfo = getDepreciationStatus(asset.purchaseDate, asset.accountingLedgerIndex, asset.accountingLedger);
                  const actualStatus = asset.status || '재고';
                  
                  return (
                    <tr key={asset.assetId} className="border-b hover:bg-emerald-50/50 transition-colors">
                      <td className="px-1.5 py-3 font-medium text-gray-800 bg-gray-50/30 border-r border-gray-100 text-center break-all whitespace-normal">{asset.accountingLedger || '-'}</td>
                      <td className="px-1.5 py-3 font-mono text-purple-600 bg-gray-50/30 border-r border-gray-100 text-center break-all whitespace-normal">{asset.accountingLedgerIndex || '-'}</td>
                      <td className="px-1.5 py-3 font-mono font-bold text-gray-800 border-r border-gray-100 text-center break-all whitespace-normal">{asset.assetId}</td>
                      <td className="px-1.5 py-3 border-r border-gray-100 text-center"><span className="bg-gray-100 text-gray-600 px-1 py-0.5 rounded text-[10px] font-bold inline-block">{asset.category}</span></td>
                      <td className="px-1.5 py-3 font-bold text-gray-900 border-r border-gray-100 text-center break-words whitespace-normal">{asset.model}</td>
                      <td className="px-1.5 py-3 text-gray-500 font-mono border-r border-gray-100 text-center break-all whitespace-normal">{asset.serialNumber || '-'}</td>
                      <td className="px-1.5 py-3 text-gray-700 font-mono border-r border-gray-100 text-center break-keep whitespace-normal">{convertDateString(asset.purchaseDate) || '-'}</td>
                      
                      <td className="px-1.5 py-3 border-r border-gray-100 text-center">
                        <div className="flex items-center justify-center gap-1 cursor-help" title={statusInfo.tooltip}>
                          <div style={{ backgroundColor: statusInfo.color, width: '9px', height: '9px', borderRadius: '50%', boxShadow: `0 0 4px ${statusInfo.color}`, flexShrink: 0 }}></div>
                          <span className="font-bold text-gray-600 text-[10px] whitespace-nowrap">{statusInfo.text}</span>
                        </div>
                      </td>

                      <td className="px-1.5 py-3 text-gray-600 border-r border-gray-100 text-center break-words whitespace-normal">{asset.reason || '-'}</td>
                      
                      <td className="px-1.5 py-3 border-r border-gray-100 text-center">
                        <span className={`px-1.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap inline-block 
                          ${actualStatus === '재고' ? 'bg-emerald-100 text-emerald-700' : 
                            actualStatus === '사용중' ? 'bg-blue-100 text-blue-700' : 
                            (actualStatus === '고장' || actualStatus === '수리중') ? 'bg-red-100 text-red-700 border border-red-200' : 
                            'bg-gray-200 text-gray-700'}`}>
                          {actualStatus}
                        </span>
                      </td>

                      <td className="px-1.5 py-3 text-blue-600 font-bold border-r border-gray-100 text-center break-all whitespace-normal">{getOwnerName(asset.currentUserId)}</td>
                      <td className="px-1.5 py-3 border-r border-gray-100 text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          <button onClick={() => openHistoryModal(asset.assetId)} className="bg-purple-100 text-purple-700 px-1.5 py-1 rounded shadow-sm font-bold hover:bg-purple-200 transition text-[10px] whitespace-nowrap">이력</button>
                          
                          {actualStatus === '사용중' && <button onClick={() => handleReturn(asset.assetId)} className="bg-amber-500 text-white px-1.5 py-1 rounded shadow-sm font-bold hover:bg-amber-600 transition text-[10px] whitespace-nowrap">회수</button>}
                          
                          {(actualStatus === '재고' || actualStatus === '사용중') && (
                            <button onClick={() => handleStatusChange(asset.assetId, '고장')} className="bg-red-50 text-red-600 border border-red-200 px-1.5 py-1 rounded shadow-sm font-bold hover:bg-red-100 transition text-[10px] whitespace-nowrap">고장</button>
                          )}
                          
                          {actualStatus === '고장' && (
                            <button onClick={() => handleStatusChange(asset.assetId, '수리중')} className="bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-1 rounded shadow-sm font-bold hover:bg-orange-100 transition text-[10px] whitespace-nowrap">수리</button>
                          )}
                          
                          {actualStatus === '수리중' && (
                            <button onClick={() => handleStatusChange(asset.assetId, '재고')} className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-1 rounded shadow-sm font-bold hover:bg-emerald-100 transition text-[10px] whitespace-nowrap">복구</button>
                          )}

                          <button onClick={() => openEditModal(asset)} className="bg-gray-100 text-gray-700 px-1.5 py-1 rounded shadow-sm font-bold hover:bg-gray-200 transition text-[10px] whitespace-nowrap">수정</button>
                          <button onClick={() => handleDelete(asset.assetId)} className="bg-white text-red-400 border border-red-200 px-1.5 py-1 rounded shadow-sm font-bold hover:bg-red-50 transition text-[10px] whitespace-nowrap">삭제</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {hiddenAssetCount > 0 ? (
          <p className="text-[11px] text-gray-400 mt-3 text-right">
            ※ 화면 성능을 위해 조건에 맞는 <b className="text-gray-600">{matchedAssets.length.toLocaleString()}건</b> 중{' '}
            <b className="text-gray-600">{DISPLAY_LIMIT}건</b>만 표시하고 있습니다 (나머지 {hiddenAssetCount.toLocaleString()}건 숨김).
            분류 · 상태 필터나 검색으로 범위를 좁히시거나, 전체 확인은 상단의 <b>[Export]</b> 기능을 이용해주세요.
          </p>
        ) : (
          <p className="text-[11px] text-gray-400 mt-3 text-right">
            조건에 맞는 <b className="text-gray-600">{matchedAssets.length.toLocaleString()}건</b>을 모두 표시하고 있습니다.
          </p>
        )}
      </div>

      {/* 엑셀 일괄 등록 모달 */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl border-t-4 border-emerald-500">
            <h2 className="text-xl font-bold mb-4 text-emerald-700">엑셀 일괄 등록 및 덮어쓰기</h2>
            <div className="flex justify-between items-center mb-4">
               <p className="text-xs text-gray-500 bg-emerald-50 p-3 rounded border border-emerald-100">
                 기존 관리번호 존재 시 <span className="font-bold text-red-500">최신 정보로 덮어쓰기</span> 됩니다.
               </p>
               <button onClick={downloadTemplate} className="text-xs font-bold text-blue-600 underline ml-2 whitespace-nowrap">양식 다운로드</button>
            </div>
            <input type="file" accept=".xlsx, .xls" className="w-full border p-2 rounded text-sm mb-6 bg-gray-50 cursor-pointer" onChange={handleFileSelect} />
            <div className="flex gap-2">
              <button onClick={() => { setIsExcelModalOpen(false); setExcelFile(null); }} className="flex-1 bg-gray-200 py-2.5 rounded font-bold text-gray-700 hover:bg-gray-300">취소</button>
              <button onClick={submitBulkRegister} className={`flex-1 text-white py-2.5 rounded font-bold ${isUploading ? 'bg-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700'}`} disabled={isUploading || !excelFile}>
                {isUploading ? '처리 중...' : '등록 실행'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 단건 자산 입고 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl border-t-4 border-emerald-500">
            <h2 className="text-xl font-bold mb-4 text-emerald-700">신규 자산 입고</h2>
            <form onSubmit={handleAddSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input className="border p-2.5 rounded focus:ring-emerald-500 text-sm text-center" placeholder="회계장부" onChange={e => setAddForm({...addForm, accountingLedger: e.target.value})} />
                <input className="border p-2.5 rounded focus:ring-emerald-500 text-sm font-mono text-center" placeholder="Index" onChange={e => setAddForm({...addForm, accountingLedgerIndex: e.target.value})} />
              </div>
              <input className="w-full border p-2.5 rounded focus:ring-emerald-500 text-sm text-center" placeholder="관리 번호 (필수)" required onChange={e => setAddForm({...addForm, assetId: e.target.value})} />
              <select className="w-full border p-2.5 rounded focus:ring-emerald-500 text-sm text-center" required onChange={e => setAddForm({...addForm, category: e.target.value})}>
                <option value="">분류 선택</option>
                {categories.filter(c=>c!=='전체').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className="w-full border p-2.5 rounded focus:ring-emerald-500 text-sm text-center" placeholder="모델명 (필수)" required onChange={e => setAddForm({...addForm, model: e.target.value})} />
              <input className="w-full border p-2.5 rounded focus:ring-emerald-500 text-sm font-mono text-center" placeholder="S/N" onChange={e => setAddForm({...addForm, serialNumber: e.target.value})} />
              
              <div className="bg-gray-50 p-2 rounded border">
                 <label className="text-xs font-bold text-gray-500 block mb-1 text-center">구입일자 (초과 여부 자동계산용)</label>
                 <input type="text" className="w-full border p-2 rounded text-sm text-center" placeholder="YYYY-MM-DD 또는 '비대상'" onChange={e => setAddForm({...addForm, purchaseDate: e.target.value})} />
              </div>

              <input className="w-full border p-2.5 rounded text-sm bg-emerald-50 text-center" placeholder="제품 특이사항 (예: 임원 전용, 스크래치 등)" onChange={e => setAddForm({...addForm, reason: e.target.value})} />
              
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 bg-gray-200 py-2.5 rounded font-bold hover:bg-gray-300">취소</button>
                <button type="submit" className="flex-1 bg-emerald-600 text-white py-2.5 rounded font-bold hover:bg-emerald-700">입고</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 자산 정보 수정 모달 */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl border-t-4 border-gray-800">
            <h2 className="text-xl font-bold mb-4">자산 정보 상세/수정</h2>
            <form onSubmit={handleEditSubmit} className="space-y-3">
              <input className="w-full border p-2.5 bg-gray-100 rounded text-gray-500 font-mono text-sm text-center" value={editForm.assetId} readOnly />
              <div className="grid grid-cols-2 gap-2">
                <input className="border p-2.5 rounded text-sm text-center" placeholder="회계장부" value={editForm.accountingLedger || ''} onChange={e => setEditForm({...editForm, accountingLedger: e.target.value})} />
                <input className="border p-2.5 rounded text-sm font-mono text-center" placeholder="Index" value={editForm.accountingLedgerIndex || ''} onChange={e => setEditForm({...editForm, accountingLedgerIndex: e.target.value})} />
              </div>
              <select className="w-full border p-2.5 rounded text-sm text-center" required value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})}>
                <option value="노트북">노트북</option><option value="모니터">모니터</option><option value="데스크탑">데스크탑</option><option value="소프트웨어">소프트웨어</option><option value="프린터">프린터</option><option value="소모품">소모품</option><option value="기타">기타</option>
              </select>
              <input className="w-full border p-2.5 rounded text-sm text-center" required value={editForm.model} onChange={e => setEditForm({...editForm, model: e.target.value})} />
              <input className="w-full border p-2.5 rounded text-sm font-mono text-center" placeholder="S/N" value={editForm.serialNumber || ''} onChange={e => setEditForm({...editForm, serialNumber: e.target.value})} />

              <div className="bg-gray-50 p-2 rounded border">
                 <label className="text-xs font-bold text-gray-500 block mb-1 text-center">구입일자 (초과 여부 자동계산용)</label>
                 <input type="text" className="w-full border p-2 rounded text-sm text-center" placeholder="YYYY-MM-DD 또는 '비대상'" value={editForm.purchaseDate || ''} onChange={e => setEditForm({...editForm, purchaseDate: e.target.value})} />
              </div>

              <select className="w-full border p-2.5 rounded text-sm text-center font-bold focus:ring-2 focus:ring-emerald-500 outline-none" value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})}>
                <option value="재고">📦 재고 (창고 대기)</option>
                <option value="사용중">💻 사용중</option>
                <option value="고장">⚠️ 고장</option>
                <option value="수리중">🔧 수리중</option>
                <option value="폐기">🗑️ 폐기</option>
              </select>

              <input className="w-full border p-2.5 rounded text-sm bg-blue-50 text-center" placeholder="제품 특이사항" value={editForm.reason || ''} onChange={e => setEditForm({...editForm, reason: e.target.value})} />

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 bg-gray-200 py-2.5 rounded font-bold text-gray-700 hover:bg-gray-300">취소</button>
                <button type="submit" className="flex-1 bg-gray-800 text-white py-2.5 rounded font-bold hover:bg-black">수정 저장</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 자산 이력 모달 */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl border-t-4 border-purple-500">
            <h2 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">
              자산 라이프사이클 - <span className="text-purple-600 font-mono">{selectedAssetId}</span>
            </h2>
            <div className="h-80 overflow-y-auto pr-2 relative">
              {historyList.length === 0 ? (
                <div className="p-8 text-center text-gray-400">기록된 이력이 없습니다.</div>
              ) : (
                <div className="border-l-2 border-gray-200 ml-3 pl-4 space-y-4 py-2">
                  {historyList.map((hist: any) => (
                    <div key={hist.historyId} className="relative">
                      <div className={`absolute -left-[23px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${
                        hist.actionType === '입고' ? 'bg-emerald-500' : hist.actionType === '지급' ? 'bg-blue-500' : 'bg-amber-500'
                      }`}></div>
                      <div className="bg-gray-50 p-3 rounded-lg border shadow-sm hover:bg-white transition-colors">
                        <div className="flex justify-between items-center mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${
                            hist.actionType === '입고' ? 'bg-emerald-500' : hist.actionType === '지급' ? 'bg-blue-500' : 'bg-amber-500'
                          }`}>{hist.actionType}</span>
                          <span className="text-xs text-gray-500 font-mono">{new Date(hist.changeDate).toLocaleString()}</span>
                        </div>
                        <p className="text-sm font-bold text-gray-800 mt-2">{hist.employeeId ? `사용처: ${getOwnerName(hist.employeeId)}` : '창고 (재고 보관)'}</p>
                        <p className="text-xs text-gray-500 mt-1">사유: {hist.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setIsHistoryModalOpen(false)} className="w-full mt-4 bg-gray-200 py-2.5 rounded font-bold text-gray-700 hover:bg-gray-300 transition">닫기</button>
          </div>
        </div>
      )}

    </div>
  );
}