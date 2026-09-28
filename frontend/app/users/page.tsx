'use client';

import { useState, useEffect } from 'react';
import * as xlsx from 'xlsx';
import { 
  getEmployees, registerEmployee, getAvailableAssets, 
  assignAsset, bulkAssignAsset, retireEmployee, deleteEmployee, changeEmployeeStatus,
  updateEmployee, getEmployeeAssets, bulkReplaceAsset,
  getAllAssets, getDepartments, saveDepartments, deleteAllEmployees, getEmployeeHistory
} from '../lib/api';

/* ==========================================
 * 💡 데이터 타입 명시
 * ========================================== */
interface Employee {
  employeeId: string;
  name: string;
  email: string;
  department1: string;
  department2: string;
  department3: string;
  rank: string;
  status?: string;
}

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
}

const RANK_WEIGHT: { [key: string]: number } = {
  "공용": 0, "CEO": 1, "상무": 2, "감사": 3, "이사": 4, "센터장": 5,
  "실장": 6, "팀장": 7, "파트장": 8, "PM": 9, "매니저": 10, "인턴": 11
};

const uid = () => Math.random().toString(36).substring(2, 11);

export default function UsersPage() {
  // 💡 [NEW] 임직원 모드 vs 공용 계정 모드 전환 상태
  const [viewMode, setViewMode] = useState<'EMPLOYEE' | 'SHARED'>('EMPLOYEE');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const [orgChartData, setOrgChartData] = useState<any[]>([]);

  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [isEditEmpModalOpen, setIsEditEmpModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false); 
  const [isViewAssetsModalOpen, setIsViewAssetsModalOpen] = useState(false);
  const [viewAssetsEmployee, setViewAssetsEmployee] = useState<Employee | null>(null);

  const [isOrgChangeModalOpen, setIsOrgChangeModalOpen] = useState(false);
  const [orgChangeForm, setOrgChangeForm] = useState({
    oldDept1: '', oldDept2: '', oldDept3: '',
    newDept1: '', newDept2: '', newDept3: ''
  });
  const [isReplacingOrg, setIsReplacingOrg] = useState(false);

  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [isOrgViewModalOpen, setIsOrgViewModalOpen] = useState(false);

  const [isOrgSettingsModalOpen, setIsOrgSettingsModalOpen] = useState(false);
  const [editingTree, setEditingTree] = useState<any[]>([]);
  const [dragMeta, setDragMeta] = useState<{level: number, d1: number, d2: number, d3: number} | null>(null);

  const [empForm, setEmpForm] = useState<Employee>({ employeeId: '', name: '', department1: '', department2: '', department3: '', rank: '', email: '' });
  const [editEmpForm, setEditEmpForm] = useState<Employee>({ employeeId: '', name: '', department1: '', department2: '', department3: '', rank: '', email: '' });
  
  const [employeeAssets, setEmployeeAssets] = useState<Asset[]>([]);
  const [isReplacing, setIsReplacing] = useState(false); 

  const [replacePairs, setReplacePairs] = useState([{ oldAssetId: '', newAssetId: '' }]);
  const [replaceReason, setReplaceReason] = useState('노후 장비 교체');
  const [replaceSearch, setReplaceSearch] = useState('');

  const [assignSearch, setAssignSearch] = useState('');
  const [assignCategory, setAssignCategory] = useState('');
  const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);
  
  const [isEmpHistoryModalOpen, setIsEmpHistoryModalOpen] = useState(false);
  const [empHistoryList, setEmpHistoryList] = useState<any[]>([]);
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);

  const [activeEmpTab, setActiveEmpTab] = useState('재직');
  const [empSearch, setEmpSearch] = useState('');
  
  const [selDept1, setSelDept1] = useState('');
  const [selDept2, setSelDept2] = useState('');
  const [selDept3, setSelDept3] = useState('');

  const loadData = async () => {
    try {
      const [empData, availData, allData, orgData] = await Promise.all([
        getEmployees(), getAvailableAssets(), getAllAssets(), getDepartments()
      ]);
      setEmployees(empData || []); 
      setAvailableAssets(availData || []); 
      setAllAssets(allData || []);
      setOrgChartData(Array.isArray(orgData) ? orgData : []); 
    } catch (e) {
      console.error("데이터 로딩 실패", e);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openOrgSettings = () => {
    const baseOrg = orgChartData.map(o => ({ 
      department1: o.department1 || '', 
      department2: o.department2 || '', 
      department3: o.department3 || '' 
    }));

    const empOrgs: any[] = [];
    employees.forEach(emp => {
      if (emp.department1) {
        const d1 = emp.department1; const d2 = emp.department2 || ''; const d3 = emp.department3 || '';
        if (!empOrgs.some(o => o.department1 === d1 && o.department2 === d2 && o.department3 === d3)) {
          empOrgs.push({ department1: d1, department2: d2, department3: d3 });
        }
      }
    });

    empOrgs.forEach(eo => {
      const existsInBase = baseOrg.some(bo => bo.department1 === eo.department1 && bo.department2 === eo.department2 && bo.department3 === eo.department3);
      if (!existsInBase) {
        baseOrg.push(eo);
      }
    });

    const tree: any[] = [];
    baseOrg.forEach(row => {
      if (!row.department1) return;
      let d1Node = tree.find(n => n.originalD1 === row.department1);
      if (!d1Node) {
        d1Node = { id: uid(), name: row.department1, originalD1: row.department1, children: [] };
        tree.push(d1Node);
      }
      if (row.department2) {
        let d2Node = d1Node.children.find((n: any) => n.originalD2 === row.department2);
        if (!d2Node) {
          d2Node = { id: uid(), name: row.department2, originalD1: row.department1, originalD2: row.department2, children: [] };
          d1Node.children.push(d2Node);
        }
        if (row.department3) {
          let d3Node = d2Node.children.find((n: any) => n.originalD3 === row.department3);
          if (!d3Node) {
            d3Node = { id: uid(), name: row.department3, originalD1: row.department1, originalD2: row.department2, originalD3: row.department3 };
            d2Node.children.push(d3Node);
          }
        }
      }
    });

    setEditingTree(tree);
    setIsOrgSettingsModalOpen(true);
  };

  const updateTreeName = (val: string, d1Idx: number, d2Idx = -1, d3Idx = -1) => {
    const newTree = [...editingTree];
    if (d2Idx === -1) newTree[d1Idx].name = val;
    else if (d3Idx === -1) newTree[d1Idx].children[d2Idx].name = val;
    else newTree[d1Idx].children[d2Idx].children[d3Idx].name = val;
    setEditingTree(newTree);
  };

  const addD1 = () => setEditingTree([...editingTree, { id: uid(), name: '', originalD1: '', children: [] }]);
  const addD2 = (d1Idx: number) => {
    const newTree = [...editingTree];
    newTree[d1Idx].children.push({ id: uid(), name: '', originalD1: '', originalD2: '', children: [] });
    setEditingTree(newTree);
  };
  const addD3 = (d1Idx: number, d2Idx: number) => {
    const newTree = [...editingTree];
    newTree[d1Idx].children[d2Idx].children.push({ id: uid(), name: '', originalD1: '', originalD2: '', originalD3: '' });
    setEditingTree(newTree);
  };

  const deleteNode = (d1Idx: number, d2Idx = -1, d3Idx = -1) => {
    const newTree = [...editingTree];
    if (d2Idx === -1) newTree.splice(d1Idx, 1);
    else if (d3Idx === -1) newTree[d1Idx].children.splice(d2Idx, 1);
    else newTree[d1Idx].children[d2Idx].children.splice(d3Idx, 1);
    setEditingTree(newTree);
  };

  const handleDragStart = (e: React.DragEvent, level: number, d1: number, d2 = -1, d3 = -1) => {
    e.stopPropagation(); setDragMeta({ level, d1, d2, d3 }); e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, level: number, d1: number, d2 = -1, d3 = -1) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragMeta || dragMeta.level !== level) return;
    if (level === 2 && dragMeta.d1 !== d1) return;
    if (level === 3 && (dragMeta.d1 !== d1 || dragMeta.d2 !== d2)) return;
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, level: number, d1: number, d2 = -1, d3 = -1) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragMeta || dragMeta.level !== level) return;
    const newTree = JSON.parse(JSON.stringify(editingTree));
    if (level === 1) {
      const item = newTree.splice(dragMeta.d1, 1)[0];
      newTree.splice(d1, 0, item);
    } else if (level === 2) {
      if (dragMeta.d1 !== d1) return;
      const arr = newTree[d1].children;
      const item = arr.splice(dragMeta.d2, 1)[0];
      arr.splice(d2, 0, item);
    } else if (level === 3) {
      if (dragMeta.d1 !== d1 || dragMeta.d2 !== d2) return;
      const arr = newTree[d1].children[d2].children;
      const item = arr.splice(dragMeta.d3, 1)[0];
      arr.splice(d3, 0, item);
    }
    setEditingTree(newTree); setDragMeta(null);
  };

  const handleSaveOrgSettings = async () => {
    if (confirm('현재 설정된 계층과 순서대로 조직도를 저장하시겠습니까?\n(💡 부서명을 수정하거나 위치를 변경한 경우, 해당 부서에 속한 사원들의 정보도 자동으로 업데이트됩니다.)')) {
      const flatList: any[] = [];
      const pathMap: any[] = [];
      
      const traverse = (node: any, currentD1: string, currentD2: string, level: number) => {
        const myName = (node.name || '').trim();
        if (!myName) return; 
        
        if (level === 1) {
            if (node.originalD1 && (node.originalD1 !== myName)) {
                pathMap.push({ level: 1, oldD1: node.originalD1, newD1: myName });
            }
            if (node.children) node.children.forEach((c: any) => traverse(c, myName, '', 2));
        } else if (level === 2) {
            if (node.originalD2 && (node.originalD1 !== currentD1 || node.originalD2 !== myName)) {
                pathMap.push({ level: 2, oldD1: node.originalD1, oldD2: node.originalD2, newD1: currentD1, newD2: myName });
            }
            if (node.children) node.children.forEach((c: any) => traverse(c, currentD1, myName, 3));
        } else if (level === 3) {
            if (node.originalD3 && (node.originalD1 !== currentD1 || node.originalD2 !== currentD2 || node.originalD3 !== myName)) {
                pathMap.push({ level: 3, oldD1: node.originalD1, oldD2: node.originalD2, oldD3: node.originalD3, newD1: currentD1, newD2: currentD2, newD3: myName });
            }
        }
      };
      
      editingTree.forEach(root => traverse(root, '', '', 1));

      editingTree.forEach(d1 => {
        const d1Name = (d1.name || '').trim();
        if (!d1Name) return; 
        if (d1.children.length === 0) {
          flatList.push({ department1: d1Name, department2: '', department3: '' });
        } else {
          d1.children.forEach((d2: any) => {
            const d2Name = (d2.name || '').trim();
            if (d2.children.length === 0) {
              flatList.push({ department1: d1Name, department2: d2Name, department3: '' });
            } else {
              d2.children.forEach((d3: any) => {
                flatList.push({ department1: d1Name, department2: d2Name, department3: (d3.name || '').trim() });
              });
            }
          });
        }
      });
      
      const promises: Promise<any>[] = [];
      let empChangedCount = 0;
      const safeStrMatch = (s1: string, s2: string) => (s1 || '').trim() === (s2 || '').trim();

      employees.forEach(emp => {
          let changed = false;
          let d1 = (emp.department1 || '').trim();
          let d2 = (emp.department2 || '').trim();
          let d3 = (emp.department3 || '').trim();
          
          const l3Change = pathMap.find(m => m.level === 3 && safeStrMatch(m.oldD1, d1) && safeStrMatch(m.oldD2, d2) && safeStrMatch(m.oldD3, d3));
          const l2Change = pathMap.find(m => m.level === 2 && safeStrMatch(m.oldD1, d1) && safeStrMatch(m.oldD2, d2));
          const l1Change = pathMap.find(m => m.level === 1 && safeStrMatch(m.oldD1, d1));
          
          if (l3Change) {
              d3 = l3Change.newD3; d2 = l3Change.newD2; d1 = l3Change.newD1; changed = true;
          } else if (l2Change) {
              d2 = l2Change.newD2; d1 = l2Change.newD1; changed = true;
          } else if (l1Change) {
              d1 = l1Change.newD1; changed = true;
          }
          
          if (changed && (d1 !== (emp.department1 || '').trim() || d2 !== (emp.department2 || '').trim() || d3 !== (emp.department3 || '').trim())) {
              const updatedEmp = { ...emp, department1: d1, department2: d2, department3: d3 };
              promises.push(updateEmployee(emp.employeeId, updatedEmp));
              empChangedCount++;
          }
      });

      const success = await saveDepartments(flatList);
      if (promises.length > 0) {
          await Promise.all(promises);
      }

      if (success) {
        alert(`조직도 설정이 저장되었습니다.${empChangedCount > 0 ? `\n\n(✔️ 조직 변경이 감지되어 연관된 소속 사원 ${empChangedCount}명의 데이터도 일괄 업데이트 되었습니다.)` : ''}`);
        setIsOrgSettingsModalOpen(false); 
        loadData();
      } else { 
        alert('저장 중 오류가 발생했습니다. DB 통신 상태를 확인해주세요.'); 
      }
    }
  };

  const getDept1Options = () => {
    if (!Array.isArray(orgChartData)) return [];
    const orgDepts = Array.from(new Set(orgChartData.map(d => d.department1).filter(Boolean)));
    const extra = Array.from(new Set(employees.map(e => e.department1).filter(Boolean))).filter(d => !orgDepts.includes(d)).sort();
    return [...orgDepts, ...extra];
  };

  const getDept2Options = (d1: string) => {
    if (!Array.isArray(orgChartData)) return [];
    const orgDepts = Array.from(new Set(orgChartData.filter(d => d.department1 === d1).map(d => d.department2).filter(Boolean)));
    const extra = Array.from(new Set(employees.filter(e => e.department1 === d1).map(e => e.department2).filter(Boolean))).filter(d => !orgDepts.includes(d)).sort();
    return [...orgDepts, ...extra];
  };

  const getDept3Options = (d1: string, d2: string) => {
    if (!Array.isArray(orgChartData)) return [];
    const orgDepts = Array.from(new Set(orgChartData.filter(d => d.department1 === d1 && d.department2 === d2).map(d => d.department3).filter(Boolean)));
    const extra = Array.from(new Set(employees.filter(e => e.department1 === d1 && e.department2 === d2).map(e => e.department3).filter(Boolean))).filter(d => !orgDepts.includes(d)).sort();
    return [...orgDepts, ...extra];
  };

  const filterDept1Options = getDept1Options();
  const filterDept2Options = getDept2Options(selDept1);
  const filterDept3Options = getDept3Options(selDept1, selDept2);
  const formDept1Options = getDept1Options();

  // 💡 [NEW] 등록 모달 열기 (모드에 따라 직급 초기화)
  const openAddModal = () => {
    setEmpForm({ 
      employeeId: '', name: '', department1: '', department2: '', department3: '', 
      rank: viewMode === 'SHARED' ? '공용' : '', 
      email: '' 
    });
    setIsEmpModalOpen(true);
  };

  const handleEmpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await registerEmployee(empForm)) {
      setIsEmpModalOpen(false); 
      setEmpForm({ employeeId: '', name: '', department1: '', department2: '', department3: '', rank: '', email: '' }); 
      loadData();
    }
  };

  const exportToExcel = () => {
    if (filteredEmployees.length === 0) return alert('내보낼 데이터가 없습니다.');
    const exportData = filteredEmployees.map((emp) => {
      const myAssets = allAssets.filter((a) => a.currentUserId === emp.employeeId);
      const assetString = myAssets.map((a) => `[${a.category}] ${a.model}(${a.assetId})`).join(', ') || '없음';
      return {
        '사번/계정ID': emp.employeeId || '', '이름/계정명': emp.name || '', '이메일': emp.email || '',
        '본부': emp.department1 || '', '실/센터': emp.department2 || '-', '팀': emp.department3 || '-',
        '직급': emp.rank || '', '상태': emp.status || '재직', '보유중인 IT 자산': assetString
      };
    });
    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, viewMode === 'SHARED' ? "공용계정명부" : "사원명부");
    xlsx.writeFile(workbook, `인사관리_${viewMode === 'SHARED' ? '공용계정' : '사원'}_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const downloadTemplate = () => {
    const templateData = [
      ['사번', '이름', '이메일', '본부', '실/센터', '팀', '직급'],
      ['EMP202601', '홍길동', 'gildong@company.com', '사업본부', '개발센터', '개발1팀', '매니저'],
      ['SHARE-MKT', '마케팅팀 공용', 'mkt@company.com', '경영지원본부', '마케팅실', '마케팅팀', '공용']
    ];
    const worksheet = xlsx.utils.aoa_to_sheet(templateData);
    worksheet['!cols'] = [ { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 12 } ];
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "일괄등록양식");
    xlsx.writeFile(workbook, "IT자산관리_일괄등록_양식.xlsx");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) setExcelFile(file); };

  const submitBulkRegister = async () => {
    if (!excelFile) return alert('엑셀 파일을 첨부해주세요.');
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result; const workbook = xlsx.read(data, { type: 'binary' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]; const rawData: any[] = xlsx.utils.sheet_to_json(worksheet, { raw: false });
        const formattedData: Employee[] = rawData.map(row => ({
          employeeId: String(row['사번'] || '').trim(), name: String(row['이름'] || '').trim(), email: String(row['이메일'] || '').trim(),
          department1: String(row['본부'] || '').trim(), department2: String(row['실/센터'] || row['실'] || '').trim(),
          department3: String(row['팀'] || '').trim(), rank: String(row['직급'] || '').trim()
        })).filter(item => item.employeeId && item.name);

        if (formattedData.length === 0) { setIsUploading(false); return alert('유효한 데이터가 없습니다.'); }
        if (confirm(`총 ${formattedData.length}건을 일괄 등록하시겠습니까?`)) {
          const registerPromises = formattedData.map(emp => registerEmployee(emp));
          await Promise.all(registerPromises);
          alert(`완료되었습니다.`);
          setIsExcelModalOpen(false); setExcelFile(null); loadData();
        }
      } catch (error) { alert('오류가 발생했습니다.'); } finally { setIsUploading(false); }
    };
    reader.readAsBinaryString(excelFile);
  };

  const openEditModal = (emp: Employee) => { setEditEmpForm(emp); setIsEditEmpModalOpen(true); };
  const handleEditEmpSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (await updateEmployee(editEmpForm.employeeId, editEmpForm)) { setIsEditEmpModalOpen(false); loadData(); } };
  
  const handleDeleteEmployee = async (employeeId: string) => { 
    const myAssets = allAssets.filter((a) => a.currentUserId === employeeId);
    let confirmMsg = viewMode === 'SHARED' ? '공용 계정을 완전히 삭제하시겠습니까?' : '사원 데이터를 완전히 삭제하시겠습니까?';
    if (myAssets.length > 0) {
      confirmMsg = `⚠️ 주의: 해당 대상은 현재 ${myAssets.length}개의 자산을 보유하고 있습니다.\n\n삭제 시 보유 중인 자산은 자동으로 [재고] 창고로 반납 처리됩니다.\n정말 삭제하시겠습니까?`;
    }
    if (confirm(confirmMsg)) {
      if (await deleteEmployee(employeeId)) loadData(); 
    }
  };

  const handleDeleteAllEmployees = async () => {
    if (employees.length === 0) return alert('삭제할 데이터가 없습니다.');
    const firstConfirm = confirm('⚠️ 경고: 모든 데이터와 이력이 완전히 삭제됩니다.\n보유하고 있던 자산은 모두 [재고]로 일괄 강제 반납됩니다.\n\n정말로 전체 삭제하시겠습니까?');
    if (!firstConfirm) return;
    
    const doubleCheck = prompt('실수 방지를 위해 아래 입력창에 "전체삭제" 라고 정확히 입력해주세요.');
    if (doubleCheck !== '전체삭제') {
      return alert('입력어가 일치하지 않아 전체 삭제가 취소되었습니다.');
    }
    
    if (await deleteAllEmployees()) {
      alert('모든 데이터가 성공적으로 삭제되었습니다.');
      loadData();
    } else {
      alert('전체 삭제 처리 중 오류가 발생했습니다.');
    }
  };

  const handleRetire = async (employeeId: string) => { if (confirm(viewMode === 'SHARED' ? '계정을 폐기 처리하시겠습니까?' : '퇴사 처리하시겠습니까?')) if (await retireEmployee(employeeId)) loadData(); };
  
  const handleSuspend = async (employeeId: string) => { 
    if (confirm('휴직 처리하시겠습니까?\n진행 시 노트북과 PC를 제외한 모든 장비(모니터 등)가 자동으로 창고 재고로 반납 처리됩니다.')) {
      try {
        const response = await fetch(`/api/employees/${employeeId}/leave`, {
          method: 'PUT',
        });
        if (response.ok) {
          alert('성공적으로 휴직 처리 및 장비 분리 회수가 완료되었습니다.');
          loadData();
        } else {
          alert('휴직 처리 중 서버 오류가 발생했습니다.');
        }
      } catch (error) {
        console.error('Leave process error:', error);
        alert('네트워크 오류가 발생했습니다.');
      }
    } 
  };
  
  const handleRestore = async (employeeId: string) => { if (confirm(viewMode === 'SHARED' ? '계정을 다시 활성화하시겠습니까?' : '복직 처리하시겠습니까?')) if (await changeEmployeeStatus(employeeId, '재직')) loadData(); };

  const handleReturnAsset = async (assetId: string) => {
    if (confirm('해당 자산을 정말 회수하시겠습니까?\n회수된 자산은 [재고] 상태로 변경됩니다.')) {
      try {
        const response = await fetch(`/api/employees/assets/${assetId}/return`, {
          method: 'PUT',
        });
        if (response.ok) {
          alert('자산 회수가 완료되었습니다.');
          loadData();
        } else {
          alert('자산 회수 중 서버 오류가 발생했습니다.');
        }
      } catch (error) {
        console.error('Return asset error:', error);
        alert('네트워크 오류가 발생했습니다.');
      }
    }
  };

  const openEmpHistoryModal = async (emp: Employee) => {
    setHistoryEmployee(emp);
    const history = await getEmployeeHistory(emp.employeeId);
    setEmpHistoryList(history || []);
    setIsEmpHistoryModalOpen(true);
  };

  const openAssignModal = (emp: Employee) => {
    setSelectedEmployee(emp);
    setAssignSelectedIds([]);
    setAssignSearch('');
    setAssignCategory('');
    setIsAssignModalOpen(true);
  };

  const toggleAssignSelect = (assetId: string) => {
    setAssignSelectedIds(prev => 
      prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId]
    );
  };

  const handleBulkAssign = async () => {
    if (assignSelectedIds.length === 0 || !selectedEmployee) return;
    if (confirm(`선택한 ${assignSelectedIds.length}개의 자산을 ${selectedEmployee.name}님에게 일괄 지급하시겠습니까?`)) {
      setIsReplacing(true);
      try {
        await bulkAssignAsset(selectedEmployee.employeeId, assignSelectedIds);
        alert('일괄 지급이 완료되었습니다.');
        setIsAssignModalOpen(false);
        loadData();
      } catch (e) {
        alert('지급 처리 중 오류가 발생했습니다.');
      } finally {
        setIsReplacing(false);
      }
    }
  };

  const openReplaceModal = async (emp: Employee) => {
    setSelectedEmployee(emp); 
    const assets = await getEmployeeAssets(emp.employeeId); 
    setEmployeeAssets(assets || []);
    setReplacePairs([{ oldAssetId: '', newAssetId: '' }]);
    setReplaceReason('노후 장비 교체'); 
    setReplaceSearch(''); 
    setIsReplaceModalOpen(true);
  };

  const updateReplacePair = (index: number, field: string, value: string) => {
    const newList = [...replacePairs];
    newList[index] = { ...newList[index], [field]: value };
    setReplacePairs(newList);
  };

  const handleBulkReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    for (const pair of replacePairs) {
      if (!pair.oldAssetId || !pair.newAssetId) return alert('모든 교체 항목에 반납 및 지급 자산을 선택해주세요.');
    }

    if (confirm(`선택한 ${replacePairs.length}쌍의 자산을 일괄 교체하시겠습니까?`)) {
      setIsReplacing(true);
      try {
        const success = await bulkReplaceAsset(selectedEmployee.employeeId, replacePairs, replaceReason);
        if (success) { 
          alert('일괄 교체가 완료되었습니다.'); 
          setIsReplaceModalOpen(false); 
          loadData(); 
        } else {
          alert('오류가 발생했습니다.');
        }
      } finally { 
        setIsReplacing(false); 
      }
    }
  };

  const safeStr = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
  
  const getD1Idx = (d1: string) => {
    if (!Array.isArray(orgChartData)) return 9999;
    const idx = orgChartData.findIndex(o => safeStr(o.department1) === safeStr(d1));
    return idx !== -1 ? idx : 9999;
  };
  const getD2Idx = (d1: string, d2: string) => {
    if (!Array.isArray(orgChartData)) return 9999;
    const idx = orgChartData.findIndex(o => safeStr(o.department1) === safeStr(d1) && safeStr(o.department2) === safeStr(d2));
    return idx !== -1 ? idx : 9999;
  };
  const getD3Idx = (d1: string, d2: string, d3: string) => {
    if (!Array.isArray(orgChartData)) return 9999;
    const idx = orgChartData.findIndex(o => safeStr(o.department1) === safeStr(d1) && safeStr(o.department2) === safeStr(d2) && safeStr(o.department3) === safeStr(d3));
    return idx !== -1 ? idx : 9999;
  };

  // 💡 [NEW] 현재 선택된 탭(임직원 vs 공용)에 따라 데이터 완벽 분리 필터링
  const filteredEmployees = employees.filter((emp) => {
    const isSharedAccount = emp.rank === '공용';
    
    // 모드 필터링
    if (viewMode === 'EMPLOYEE' && isSharedAccount) return false;
    if (viewMode === 'SHARED' && !isSharedAccount) return false;

    const isRetired = emp.status === '퇴사'; const isSuspended = emp.status === '휴직'; const isActive = !isRetired && !isSuspended;
    const matchTab = activeEmpTab === '전체' || (activeEmpTab === '재직' && isActive) || (activeEmpTab === '휴직' && isSuspended) || (activeEmpTab === '퇴사' && isRetired);
    const searchLower = empSearch.toLowerCase();
    const matchSearch = emp.name?.toLowerCase().includes(searchLower) || emp.employeeId?.toLowerCase().includes(searchLower);
    const matchDept1 = selDept1 === '' || emp.department1 === selDept1;
    const matchDept2 = selDept2 === '' || (emp.department2 || '') === selDept2;
    const matchDept3 = selDept3 === '' || (emp.department3 || '') === selDept3;
    return matchTab && matchSearch && matchDept1 && matchDept2 && matchDept3;
  }).sort((a, b) => {
    const d1A = a.department1 || ''; const d2A = a.department2 || ''; const d3A = a.department3 || '';
    const d1B = b.department1 || ''; const d2B = b.department2 || ''; const d3B = b.department3 || '';

    if (safeStr(d1A) !== safeStr(d1B)) {
      const idx1A = getD1Idx(d1A); const idx1B = getD1Idx(d1B);
      if (idx1A !== idx1B) return idx1A - idx1B;
      return d1A.localeCompare(d1B);
    }
    if (safeStr(d2A) !== safeStr(d2B)) {
      if (!d2A) return -1; 
      if (!d2B) return 1;  
      const idx2A = getD2Idx(d1A, d2A); const idx2B = getD2Idx(d1B, d2B);
      if (idx2A !== idx2B) return idx2A - idx2B;
      return d2A.localeCompare(d2B);
    }
    if (safeStr(d3A) !== safeStr(d3B)) {
      if (!d3A) return -1; 
      if (!d3B) return 1;  
      const idx3A = getD3Idx(d1A, d2A, d3A); const idx3B = getD3Idx(d1B, d2B, d3B);
      if (idx3A !== idx3B) return idx3A - idx3B;
      return d3A.localeCompare(d3B);
    }

    const weightA = RANK_WEIGHT[a.rank] ?? 99; const weightB = RANK_WEIGHT[b.rank] ?? 99;
    if (weightA !== weightB) return weightA - weightB;
    return (a.name || '').localeCompare(b.name || '');
  });

  // 지급 모달의 가용 자산 목록: 화면에는 앞 50건만 그리고, 가려진 건수는 아래에서 안내한다
  const ASSIGN_DISPLAY_LIMIT = 50;

  const matchedAssignAssets = availableAssets.filter((asset) => {
    const matchCategory = assignCategory === '' || asset.category === assignCategory;
    const searchLower = assignSearch.toLowerCase();
    return matchCategory && (asset.assetId?.toLowerCase().includes(searchLower) || asset.model?.toLowerCase().includes(searchLower));
  });

  const filteredAssets = matchedAssignAssets.slice(0, ASSIGN_DISPLAY_LIMIT);
  const hiddenAssignAssetCount = matchedAssignAssets.length - filteredAssets.length;

  const filteredReplaceAssets = availableAssets.filter((a) => {
    if (!replaceSearch) return true;
    const s = replaceSearch.toLowerCase();
    return (a.assetId?.toLowerCase().includes(s) || a.model?.toLowerCase().includes(s));
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        
        {/* 💡 [NEW] 화면 상단 대분류 탭 (임직원 vs 공용 계정) */}
        <div className="flex gap-6 mb-6 border-b-2 border-gray-200">
          <button 
            onClick={() => { setViewMode('EMPLOYEE'); setActiveEmpTab('재직'); setEmpSearch(''); }}
            className={`pb-3 text-lg transition-colors relative ${viewMode === 'EMPLOYEE' ? 'font-bold text-blue-700' : 'font-medium text-gray-500 hover:text-gray-800'}`}
          >
            👨‍💼 임직원 관리
            {viewMode === 'EMPLOYEE' && <div className="absolute bottom-[-2px] left-0 w-full h-1 bg-blue-600 rounded-t-md"></div>}
          </button>
          <button 
            onClick={() => { setViewMode('SHARED'); setActiveEmpTab('재직'); setEmpSearch(''); }}
            className={`pb-3 text-lg transition-colors relative ${viewMode === 'SHARED' ? 'font-bold text-blue-700' : 'font-medium text-gray-500 hover:text-gray-800'}`}
          >
            🏢 부서 공용 계정 관리
            {viewMode === 'SHARED' && <div className="absolute bottom-[-2px] left-0 w-full h-1 bg-blue-600 rounded-t-md"></div>}
          </button>
        </div>

        <div className="flex flex-col gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-1">{viewMode === 'SHARED' ? '부서 공용 계정 관리' : '인사 관리'}</h1>
            <p className="text-gray-500 font-medium">총 <span className="text-blue-600 font-bold">{filteredEmployees.length}</span>{viewMode === 'SHARED' ? '개' : '명'}</p>
          </div>
          
          <div className="flex flex-wrap gap-2 items-center justify-end">
            <button onClick={() => setIsOrgViewModalOpen(true)} className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-1.5">
              🏢 사내 조직도
            </button>
            <button onClick={openOrgSettings} className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-1.5">
              ⚙️ 조직 설정
            </button>

            <div className="w-px h-5 bg-gray-300 mx-1 hidden sm:block"></div> 

            <button onClick={downloadTemplate} className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-1.5">
              📄 양식 다운로드
            </button>
            <button onClick={() => setIsExcelModalOpen(true)} className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-1.5">
              📤 엑셀 등록
            </button>
            <button onClick={exportToExcel} className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition shadow-sm flex items-center gap-1.5">
              📥 명부 다운로드
            </button>

            <div className="w-px h-5 bg-gray-300 mx-1 hidden sm:block"></div> 

            <button onClick={handleDeleteAllEmployees} className="bg-white border border-red-200 text-red-500 px-3 py-2 rounded-md text-sm font-medium hover:bg-red-50 transition shadow-sm flex items-center gap-1.5">
              🗑️ 전체 삭제
            </button>
            <button onClick={openAddModal} className="bg-blue-600 border border-blue-600 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-blue-700 transition shadow-sm flex items-center gap-1.5">
              + {viewMode === 'SHARED' ? '공용 계정 등록' : '사원 등록'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-t-lg border-b shadow-sm p-4 space-y-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex gap-1.5 bg-gray-100 p-1 rounded-lg">
              {['재직', '휴직', '퇴사', '전체'].map((tab) => {
                // 공용 계정 모드에서는 휴직 탭을 숨김 처리
                if (viewMode === 'SHARED' && tab === '휴직') return null;
                const tabLabel = viewMode === 'SHARED' && tab === '재직' ? '사용중' : viewMode === 'SHARED' && tab === '퇴사' ? '폐기됨' : tab;
                
                return (
                  <button key={tab} onClick={() => setActiveEmpTab(tab)} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeEmpTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {tabLabel}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 items-center flex-1">
              <select className="border border-gray-300 rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 min-w-[140px]" value={selDept1} onChange={(e) => { setSelDept1(e.target.value); setSelDept2(''); setSelDept3(''); }}>
                <option value="">전체 본부</option>
                {filterDept1Options.map((d1: any) => <option key={d1} value={d1}>{d1}</option>)}
              </select>
              <select className="border border-gray-300 rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 min-w-[140px] disabled:opacity-50" value={selDept2} onChange={(e) => { setSelDept2(e.target.value); setSelDept3(''); }} disabled={!selDept1}>
                <option value="">전체 실</option>
                {filterDept2Options.map((d2: any) => <option key={d2} value={d2}>{d2}</option>)}
              </select>
              <select className="border border-gray-300 rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 min-w-[140px] disabled:opacity-50" value={selDept3} onChange={(e) => setSelDept3(e.target.value)} disabled={!selDept2}>
                <option value="">전체 팀</option>
                {filterDept3Options.map((d3: any) => <option key={d3} value={d3}>{d3}</option>)}
              </select>
              <button onClick={() => { setSelDept1(''); setSelDept2(''); setSelDept3(''); }} className="text-[10px] text-gray-400 hover:text-red-500 font-bold underline ml-1">초기화</button>
            </div>

            <input type="text" placeholder={viewMode === 'SHARED' ? "계정명/ID 검색" : "이름/사번 검색"} value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} className="w-full md:w-64 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" />
          </div>
        </div>

        <div className="bg-white shadow-md rounded-b-lg overflow-hidden border border-t-0">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-600 text-sm border-b-2 border-gray-200">
              <tr>
                <th className="p-4 w-28">{viewMode === 'SHARED' ? '계정 ID' : '사번'}</th>
                <th className="p-4 w-36">{viewMode === 'SHARED' ? '계정명' : '이름/직급'}</th>
                <th className="p-4 w-40">소속</th>
                <th className="p-4 text-center w-32">할당 자산</th>
                <th className="p-4 w-20">상태</th>
                <th className="p-4 text-center w-64">관리 작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr><td colSpan={6} className="p-12 text-center text-gray-500 font-medium">데이터가 없습니다.</td></tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const myAssets = allAssets.filter((a) => a.currentUserId === emp.employeeId);
                  return (
                    <tr key={emp.employeeId} className={`border-b transition-colors ${emp.status === '퇴사' ? 'bg-gray-50 opacity-75' : 'hover:bg-blue-50/50'}`}>
                      <td className="p-4 font-mono text-gray-600 font-medium">{emp.employeeId}</td>
                      <td className="p-4 font-bold text-gray-900">{emp.name} {viewMode !== 'SHARED' && <span className="text-xs font-normal text-gray-500 ml-1">{emp.rank}</span>}</td>
                      <td className="p-4 text-xs text-gray-700 font-medium">
                        <div className="text-gray-400 text-[10px]">{emp.department1} {emp.department2 && `> ${emp.department2}`}</div>
                        <div>{emp.department3 || '-'}</div>
                      </td>
                      <td className="p-4 text-center">
                        {myAssets.length === 0 ? ( <span className="text-gray-300 text-xs">-</span> ) : (
                          <button onClick={() => { setViewAssetsEmployee(emp); setIsViewAssetsModalOpen(true); }} className="bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-blue-100 transition">
                            자산 {myAssets.length}개
                          </button>
                        )}
                      </td>
                      <td className="p-4"><span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${emp.status === '퇴사' ? 'bg-gray-200 text-gray-600' : emp.status === '휴직' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{emp.status === '퇴사' && viewMode === 'SHARED' ? '폐기됨' : emp.status === '재직' && viewMode === 'SHARED' ? '사용중' : emp.status || '재직'}</span></td>
                      <td className="p-4 flex justify-center gap-1">
                        
                        <button onClick={() => openEmpHistoryModal(emp)} className="bg-indigo-50 text-indigo-600 px-2.5 py-1.5 rounded text-xs font-bold border border-indigo-200 hover:bg-indigo-100 transition shadow-sm">이력</button>
                        
                        <button onClick={() => openEditModal(emp)} className="bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded text-xs font-bold hover:bg-gray-200 transition">수정</button>
                        {emp.status !== '퇴사' && (
                          <>
                            <button onClick={() => openAssignModal(emp)} className="bg-emerald-50 text-emerald-600 px-2.5 py-1.5 rounded text-xs font-bold border border-emerald-200 hover:bg-emerald-100 transition">지급</button>
                            <button onClick={() => openReplaceModal(emp)} className="bg-purple-50 text-purple-600 border border-purple-200 px-2.5 py-1.5 rounded text-xs font-bold hover:bg-purple-100 transition">교체</button>
                          </>
                        )}
                        {emp.status === '휴직' ? <button onClick={() => handleRestore(emp.employeeId)} className="bg-blue-500 text-white px-2.5 py-1.5 rounded text-xs font-bold hover:bg-blue-600 shadow-sm">복직</button> : emp.status !== '퇴사' && viewMode === 'EMPLOYEE' ? <button onClick={() => handleSuspend(emp.employeeId)} className="bg-amber-500 text-white px-2.5 py-1.5 rounded text-xs font-bold hover:bg-amber-600 shadow-sm">휴직</button> : null}
                        {emp.status !== '퇴사' && <button onClick={() => handleRetire(emp.employeeId)} className="bg-red-50 text-red-600 border border-red-100 px-2.5 py-1.5 rounded text-xs font-bold hover:bg-red-100 shadow-sm">{viewMode === 'SHARED' ? '폐기' : '퇴사'}</button>}
                        <button onClick={() => handleDeleteEmployee(emp.employeeId)} className="bg-white text-red-400 border border-red-100 px-2.5 py-1.5 rounded text-xs font-bold hover:bg-red-50">삭제</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isEmpHistoryModalOpen && historyEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl border-t-4 border-indigo-500">
            <h2 className="text-xl font-bold mb-4">{viewMode === 'SHARED' ? '계정 이력' : '인사 이동 이력'} - <span className="text-indigo-600">{historyEmployee.name}</span></h2>
            <div className="h-80 overflow-y-auto pr-2 relative">
              {empHistoryList.length === 0 ? (
                <div className="p-8 text-center text-gray-400">기록된 이력이 없습니다.</div>
              ) : (
                <div className="border-l-2 border-gray-200 ml-3 pl-4 space-y-4 py-2">
                  {empHistoryList.map((hist: any) => (
                    <div key={hist.historyId || uid()} className="relative">
                      <div className="absolute -left-[23px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-sm bg-indigo-500"></div>
                      <div className="bg-gray-50 p-3 rounded-lg border shadow-sm hover:bg-white transition-colors">
                        <div className="flex justify-between items-center mb-1">
                          <span className="px-2 py-0.5 rounded text-xs font-bold text-white bg-indigo-500">
                            {hist.actionType?.includes('소속변경') ? '소속변경' : hist.actionType}
                          </span>
                          <span className="text-xs text-gray-500 font-mono">{new Date(hist.changeDate).toLocaleString()}</span>
                        </div>
                        <p className="text-sm font-bold text-gray-800 mt-2 leading-relaxed">
                          {hist.actionType}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setIsEmpHistoryModalOpen(false)} className="w-full mt-4 bg-gray-200 py-3 rounded-lg font-bold text-gray-700 hover:bg-gray-300 transition">닫기</button>
          </div>
        </div>
      )}

      {isViewAssetsModalOpen && viewAssetsEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl border-t-4 border-blue-500">
            <h2 className="text-xl font-bold mb-4">할당 자산 <span className="text-gray-400 font-normal text-sm ml-2">({viewAssetsEmployee.name})</span></h2>
            <div className="max-h-80 overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              {allAssets.filter((a) => a.currentUserId === viewAssetsEmployee.employeeId).length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-4 font-bold">현재 할당된 자산이 없습니다.</div>
              ) : (
                allAssets.filter((a) => a.currentUserId === viewAssetsEmployee.employeeId).map((asset) => (
                  <div key={asset.assetId} className="bg-white p-3 border border-gray-200 rounded-lg shadow-sm flex flex-col gap-1.5">
                    <div className="flex justify-between items-start">
                      <div className="font-bold text-sm text-gray-800"><span className="text-blue-600 mr-1.5">[{asset.category}]</span>{asset.model}</div>
                      
                      <div className="flex gap-2 items-center">
                        <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs font-bold border border-blue-100">사용중</span>
                        <button 
                          onClick={() => handleReturnAsset(asset.assetId)} 
                          className="bg-red-50 text-red-500 px-2 py-0.5 rounded text-xs font-bold border border-red-200 hover:bg-red-100 transition shadow-sm"
                        >
                          회수
                        </button>
                      </div>

                    </div>
                    <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                      <div className="font-mono">관리번호: {asset.assetId}</div>
                      {asset.serialNumber && <div className="font-mono">S/N: {asset.serialNumber}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => setIsViewAssetsModalOpen(false)} className="w-full mt-4 bg-gray-200 py-3 rounded-lg font-bold text-gray-700 hover:bg-gray-300 transition">닫기</button>
          </div>
        </div>
      )}

      {isOrgViewModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-2xl border-t-4 border-blue-500 flex flex-col max-h-[90vh]">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">🏢 사내 조직도</h2>
            <div className="overflow-y-auto flex-1 border border-gray-200 p-4 rounded-lg bg-gray-50 space-y-4">
              {orgChartData.length === 0 ? (
                <div className="text-center p-8 text-gray-400 font-bold">등록된 조직도가 없습니다.</div>
              ) : (
                Array.from(new Set(orgChartData.map(o => o.department1).filter(Boolean))).map(d1 => (
                  <div key={d1} className="bg-white border rounded-lg p-4 shadow-sm">
                    <div className="font-bold text-lg text-blue-800 border-b-2 border-blue-100 pb-2 mb-3">🏢 {d1}</div>
                    <div className="pl-2 space-y-3">
                      {Array.from(new Set(orgChartData.filter(o => o.department1 === d1).map(o => o.department2))).map((d2, d2Idx) => (
                        <div key={d2 || `none-${d2Idx}`}>
                          {d2 && <div className="font-bold text-gray-700 text-sm mb-1.5 flex items-center">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2"></span>{d2}
                          </div>}
                          <div className={`flex flex-wrap gap-2 ${d2 ? 'pl-4' : ''}`}>
                            {orgChartData.filter(o => o.department1 === d1 && o.department2 === d2 && o.department3).map(o => (
                              <span key={o.department3} className="bg-gray-100 border border-gray-200 px-2.5 py-1 rounded text-xs font-bold text-gray-600 shadow-sm">
                                {o.department3}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => setIsOrgViewModalOpen(false)} className="w-full mt-4 bg-gray-200 py-3 rounded-lg font-bold text-gray-700 hover:bg-gray-300 transition">닫기</button>
          </div>
        </div>
      )}

      {isOrgSettingsModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl shadow-2xl border-t-4 border-gray-800 flex flex-col max-h-[90vh]">
            <h2 className="text-xl font-bold mb-2">⚙️ 계층형 조직도 및 정렬 설정</h2>
            <p className="text-xs text-gray-500 mb-4 bg-gray-50 p-3 rounded border">
              왼쪽의 <span className="font-bold">☰ 아이콘</span>을 마우스로 잡아 같은 계층 내에서 위아래로 이동할 수 있습니다.<br/>
              (🚨 <span className="font-bold text-blue-600">이름을 수정하거나 위치를 드래그로 변경</span>하시면, <b>해당 조직의 모든 데이터도 자동으로 일괄 업데이트</b>됩니다.)
            </p>
            
            <div className="overflow-y-auto flex-1 pr-2 space-y-4">
              {editingTree.length === 0 ? (
                <div className="text-center p-8 text-gray-400 font-bold border rounded-lg bg-gray-50">조직도가 비어있습니다. 본부를 추가하세요.</div>
              ) : (
                editingTree.map((d1Node, d1Idx) => (
                  <div 
                    key={d1Node.id} 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, 1, d1Idx)} 
                    onDragOver={(e) => handleDragOver(e, 1, d1Idx)} 
                    onDrop={(e) => handleDrop(e, 1, d1Idx)} 
                    onDragEnd={() => setDragMeta(null)}
                    className={`bg-white border-2 rounded-xl p-4 shadow-sm transition-all
                      ${dragMeta?.level === 1 && dragMeta.d1 === d1Idx ? 'opacity-40 border-blue-400 scale-[0.98]' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-2 border-b-2 border-gray-100 pb-3 mb-3">
                      <span className="cursor-move text-gray-300 hover:text-blue-600 text-xl px-1" title="드래그해서 본부 순서 변경">☰</span>
                      <span className="text-2xl">🏢</span>
                      <input 
                        value={d1Node.name} 
                        onChange={e => updateTreeName(e.target.value, d1Idx)} 
                        className="font-bold text-lg text-blue-900 outline-none border-b border-transparent focus:border-blue-500 bg-transparent flex-1" 
                        placeholder="본부명 입력" 
                      />
                      <button onClick={() => addD2(d1Idx)} className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1.5 rounded font-bold hover:bg-blue-100 transition shadow-sm">+ 실/센터 추가</button>
                      <button onClick={() => deleteNode(d1Idx)} className="text-gray-300 hover:text-red-500 text-xl px-2 transition" title="본부 삭제">❌</button>
                    </div>

                    <div className="pl-6 space-y-3">
                      {d1Node.children.map((d2Node: any, d2Idx: number) => (
                        <div 
                          key={d2Node.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, 2, d1Idx, d2Idx)} 
                          onDragOver={(e) => handleDragOver(e, 2, d1Idx, d2Idx)} 
                          onDrop={(e) => handleDrop(e, 2, d1Idx, d2Idx)} 
                          onDragEnd={() => setDragMeta(null)}
                          className={`border rounded-lg p-3 bg-gray-50 transition-all shadow-sm
                            ${dragMeta?.level === 2 && dragMeta.d1 === d1Idx && dragMeta.d2 === d2Idx ? 'opacity-40 border-blue-400' : 'border-gray-200 hover:border-blue-300'}`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="cursor-move text-gray-300 hover:text-blue-600" title="드래그해서 실/센터 순서 변경">☰</span>
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                            <input 
                              value={d2Node.name} 
                              onChange={e => updateTreeName(e.target.value, d1Idx, d2Idx)} 
                              className="font-bold text-gray-800 outline-none border-b border-transparent focus:border-blue-500 bg-transparent w-48" 
                              placeholder="실/센터명 입력" 
                            />
                            <button onClick={() => addD3(d1Idx, d2Idx)} className="text-[11px] bg-white border border-gray-300 text-gray-600 px-2 py-1.5 rounded font-bold hover:bg-gray-100 ml-auto shadow-sm">+ 팀 추가</button>
                            <button onClick={() => deleteNode(d1Idx, d2Idx)} className="text-gray-400 hover:text-red-500 px-2 transition">❌</button>
                          </div>

                          <div className="flex flex-wrap gap-2 pl-6">
                            {d2Node.children.map((d3Node: any, d3Idx: number) => (
                              <div 
                                key={d3Node.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, 3, d1Idx, d2Idx, d3Idx)} 
                                onDragOver={(e) => handleDragOver(e, 3, d1Idx, d2Idx, d3Idx)} 
                                onDrop={(e) => handleDrop(e, 3, d1Idx, d2Idx, d3Idx)} 
                                onDragEnd={() => setDragMeta(null)}
                                className={`flex items-center bg-white border px-2 py-1.5 rounded-md shadow-sm transition-all
                                  ${dragMeta?.level === 3 && dragMeta.d1 === d1Idx && dragMeta.d2 === d2Idx && dragMeta.d3 === d3Idx ? 'opacity-40 border-blue-400' : 'border-gray-200 hover:border-blue-400'}`}
                              >
                                <span className="cursor-move text-gray-300 hover:text-blue-600 mr-1 text-xs" title="드래그해서 팀 순서 변경">☰</span>
                                <input 
                                  value={d3Node.name} 
                                  onChange={e => updateTreeName(e.target.value, d1Idx, d2Idx, d3Idx)} 
                                  className="w-28 text-xs font-bold text-gray-600 outline-none bg-transparent" 
                                  placeholder="팀명 입력" 
                                />
                                <button onClick={() => deleteNode(d1Idx, d2Idx, d3Idx)} className="text-gray-300 hover:text-red-500 ml-1 font-bold">x</button>
                              </div>
                            ))}
                            {d2Node.children.length === 0 && <span className="text-xs text-gray-400 italic py-1">등록된 팀이 없습니다.</span>}
                          </div>
                        </div>
                      ))}
                      {d1Node.children.length === 0 && <span className="text-xs text-gray-400 italic block pl-2">등록된 실/센터가 없습니다.</span>}
                    </div>
                  </div>
                ))
              )}
              <button onClick={addD1} className="w-full border-2 border-dashed border-gray-300 text-gray-500 py-3 rounded-xl font-bold hover:bg-gray-50 hover:border-gray-400 transition">
                ➕ 새로운 본부 추가
              </button>
            </div>

            <div className="flex gap-2 pt-4 mt-4 border-t border-gray-200">
              <button onClick={() => setIsOrgSettingsModalOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-lg font-bold text-gray-700 hover:bg-gray-200 transition">취소</button>
              <button onClick={handleSaveOrgSettings} className="flex-1 bg-gray-800 text-white py-3 rounded-lg font-bold hover:bg-black transition shadow-md">✅ 서버 저장 (조직도 일괄 업데이트)</button>
            </div>
          </div>
        </div>
      )}

      {isExcelModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl border-t-4 border-emerald-500">
            <h2 className="text-xl font-bold mb-4 text-emerald-700">엑셀 일괄 등록</h2>
            <div className="flex justify-between items-center mb-4"><p className="text-xs text-gray-500 bg-emerald-50 p-3 rounded border">필수 항목(사번, 이름) 확인 요망</p><button onClick={downloadTemplate} className="text-xs font-bold text-blue-600 underline ml-2 whitespace-nowrap">양식 다운로드</button></div>
            <input type="file" accept=".xlsx, .xls" className="w-full border p-2 rounded text-sm mb-6 bg-gray-50 cursor-pointer" onChange={handleFileSelect} />
            <div className="flex gap-2">
              <button onClick={() => { setIsExcelModalOpen(false); setExcelFile(null); }} className="flex-1 bg-gray-200 py-2.5 rounded font-bold text-gray-700">취소</button>
              <button onClick={submitBulkRegister} className={`flex-1 text-white py-2.5 rounded font-bold ${isUploading ? 'bg-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700'}`} disabled={isUploading || !excelFile}>{isUploading ? '등록 중...' : '등록 실행'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 💡 [수정 완료] 공용 계정일 때는 직급을 무조건 '공용'으로 고정하도록 분기 처리 */}
      {isEmpModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl border-t-4 border-blue-500">
            <h2 className="text-xl font-bold mb-4">{viewMode === 'SHARED' ? '신규 공용 계정 등록' : '신규 사원 등록'}</h2>
            <form onSubmit={handleEmpSubmit} className="space-y-4">
              <input className="w-full border p-2.5 rounded outline-none" placeholder={viewMode === 'SHARED' ? "계정 ID (예: SHARE-MKT)" : "사번"} required value={empForm.employeeId} onChange={e => setEmpForm({...empForm, employeeId: e.target.value})} />
              <input className="w-full border p-2.5 rounded outline-none" placeholder={viewMode === 'SHARED' ? "계정명 (예: 마케팅팀 공용)" : "이름"} required value={empForm.name} onChange={e => setEmpForm({...empForm, name: e.target.value})} />
              <input className="w-full border p-2.5 rounded outline-none" type="email" placeholder={viewMode === 'SHARED' ? "이메일 (선택)" : "이메일"} required={viewMode !== 'SHARED'} value={empForm.email} onChange={e => setEmpForm({...empForm, email: e.target.value})} />
              <div className="grid grid-cols-1 gap-2 border p-3 rounded-lg bg-gray-50">
                <input list="emp-dept1" type="text" className="border p-2 rounded text-sm bg-white" placeholder="본부 명 (필수)" required value={empForm.department1} onChange={e => setEmpForm({...empForm, department1: e.target.value, department2: '', department3: ''})} />
                <datalist id="emp-dept1">{formDept1Options.map((d: any) => <option key={d} value={d} />)}</datalist>
                <input list="emp-dept2" type="text" className="border p-2 rounded text-sm bg-white disabled:opacity-50" placeholder="실/센터 명 (선택)" value={empForm.department2} disabled={!empForm.department1} onChange={e => setEmpForm({...empForm, department2: e.target.value, department3: ''})} />
                <datalist id="emp-dept2">{getDept2Options(empForm.department1).map((d: any) => <option key={d} value={d} />)}</datalist>
                <input list="emp-dept3" type="text" className="border p-2 rounded text-sm bg-white disabled:opacity-50" placeholder="팀 명 (선택)" value={empForm.department3} disabled={!empForm.department2 && !empForm.department1} onChange={e => setEmpForm({...empForm, department3: e.target.value})} />
                <datalist id="emp-dept3">{getDept3Options(empForm.department1, empForm.department2).map((d: any) => <option key={d} value={d} />)}</datalist>
              </div>
              
              {viewMode === 'SHARED' ? (
                <div className="bg-gray-100 p-2.5 rounded border text-sm text-gray-500 font-bold">직급: 공용 (고정)</div>
              ) : (
                <input className="w-full border p-2.5 rounded outline-none" placeholder="직급" value={empForm.rank} onChange={e => setEmpForm({...empForm, rank: e.target.value})} />
              )}
              
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsEmpModalOpen(false)} className="flex-1 bg-gray-200 py-2.5 rounded font-bold text-gray-700">취소</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded font-bold">등록하기</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditEmpModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl border-t-4 border-gray-800">
            <h2 className="text-xl font-bold mb-4">{viewMode === 'SHARED' ? '공용 계정 정보 수정' : '사원 정보 수정'}</h2>
            <form onSubmit={handleEditEmpSubmit} className="space-y-4">
              <div className="bg-gray-50 p-2 rounded text-sm font-mono text-gray-500 border mb-2">{viewMode === 'SHARED' ? '계정 ID' : '사번'}: {editEmpForm.employeeId}</div>
              <input className="w-full border p-2.5 rounded outline-none" placeholder={viewMode === 'SHARED' ? '계정명' : '이름'} required value={editEmpForm.name} onChange={e => setEditEmpForm({...editEmpForm, name: e.target.value})} />
              <input className="w-full border p-2.5 rounded outline-none" type="email" placeholder="이메일" required={viewMode !== 'SHARED'} value={editEmpForm.email} onChange={e => setEditEmpForm({...editEmpForm, email: e.target.value})} />
              <div className="grid grid-cols-1 gap-2 border p-3 rounded-lg bg-gray-50">
                <input list="edit-dept1" type="text" className="border p-2 rounded text-sm bg-white" placeholder="본부 명 (필수)" required value={editEmpForm.department1} onChange={e => setEditEmpForm({...editEmpForm, department1: e.target.value, department2: '', department3: ''})} />
                <datalist id="edit-dept1">{formDept1Options.map((d: any) => <option key={d} value={d} />)}</datalist>
                <input list="edit-dept2" type="text" className="border p-2 rounded text-sm bg-white disabled:opacity-50" placeholder="실/센터 명 (선택)" value={editEmpForm.department2} disabled={!editEmpForm.department1} onChange={e => setEditEmpForm({...editEmpForm, department2: e.target.value, department3: ''})} />
                <datalist id="edit-dept2">{getDept2Options(editEmpForm.department1).map((d: any) => <option key={d} value={d} />)}</datalist>
                <input list="edit-dept3" type="text" className="border p-2 rounded text-sm bg-white disabled:opacity-50" placeholder="팀 명 (선택)" value={editEmpForm.department3} disabled={!editEmpForm.department2 && !editEmpForm.department1} onChange={e => setEditEmpForm({...editEmpForm, department3: e.target.value})} />
                <datalist id="edit-dept3">{getDept3Options(editEmpForm.department1, editEmpForm.department2).map((d: any) => <option key={d} value={d} />)}</datalist>
              </div>
              
              {viewMode === 'SHARED' ? (
                <div className="bg-gray-100 p-2.5 rounded border text-sm text-gray-500 font-bold">직급: 공용 (고정)</div>
              ) : (
                <input className="w-full border p-2.5 rounded outline-none" placeholder="직급" value={editEmpForm.rank} onChange={e => setEditEmpForm({...editEmpForm, rank: e.target.value})} />
              )}
              
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsEditEmpModalOpen(false)} className="flex-1 bg-gray-200 py-2.5 rounded font-bold text-gray-700">취소</button>
                <button type="submit" className="flex-1 bg-gray-800 text-white py-2.5 rounded font-bold">수정 완료</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-2xl border-t-4 border-emerald-500">
            <h2 className="text-xl font-bold mb-1">자산 일괄 지급 - <span className="text-blue-600">{selectedEmployee?.name}</span></h2>
            <p className="text-xs text-gray-500 mb-4">지급할 자산을 여러 개 선택한 후 하단의 [일괄 지급] 버튼을 눌러주세요.</p>
            
            <div className="flex gap-2 mb-4 bg-gray-50 p-3 rounded-lg border">
              <select className="border p-2 rounded text-sm outline-none bg-white focus:ring-1 focus:ring-emerald-500" value={assignCategory} onChange={(e) => setAssignCategory(e.target.value)}>
                <option value="">전체 분류</option><option value="노트북">노트북</option><option value="모니터">모니터</option><option value="데스크탑">데스크탑</option><option value="소프트웨어">소프트웨어</option><option value="기타">기타</option>
              </select>
              <input className="flex-1 border p-2 rounded text-sm outline-none focus:ring-1 focus:ring-emerald-500" placeholder="모델명, 관리번호 검색..." value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} />
            </div>
            
            <div className="h-72 overflow-y-auto border rounded-lg bg-white">
                {filteredAssets.length === 0 ? ( 
                  <div className="p-10 text-center text-gray-400 font-medium">검색 결과가 없거나 지급 가능한 자산이 없습니다.</div> 
                ) : (
                  filteredAssets.map((asset: any) => (
                    <div 
                      key={asset.assetId} 
                      onClick={() => toggleAssignSelect(asset.assetId)}
                      className={`p-3 flex justify-between items-center border-b cursor-pointer transition-colors ${assignSelectedIds.includes(asset.assetId) ? 'bg-emerald-50 border-emerald-200' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          checked={assignSelectedIds.includes(asset.assetId)} 
                          readOnly 
                          className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer" 
                        />
                        <div>
                          <div className="font-bold text-gray-800">{asset.model}</div>
                          <div className="text-xs text-gray-500 mt-1 font-mono">
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded mr-2 text-gray-700 font-bold border border-gray-200">{asset.category}</span>
                            관리번호: {asset.assetId}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
            </div>

            {hiddenAssignAssetCount > 0 && (
              <p className="mt-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                지급 가능한 <b>{matchedAssignAssets.length.toLocaleString()}건</b> 중 {ASSIGN_DISPLAY_LIMIT}건만 표시 중입니다.
                찾는 자산이 없으면 위의 분류 선택이나 검색으로 좁혀주세요.
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setIsAssignModalOpen(false)} className="flex-1 bg-gray-100 py-3 rounded-lg font-bold text-gray-700 hover:bg-gray-200 transition">취소</button>
              <button 
                onClick={handleBulkAssign} 
                disabled={assignSelectedIds.length === 0 || isReplacing} 
                className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 disabled:bg-gray-400 transition shadow-sm"
              >
                {isReplacing ? '지급 처리 중...' : `선택 자산 (${assignSelectedIds.length}개) 일괄 지급`}
              </button>
            </div>
          </div>
        </div>
      )}

      {isReplaceModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl border-t-4 border-purple-500 flex flex-col max-h-[90vh]">
            <h2 className="text-xl font-bold mb-1">자산 일괄 교체 - <span className="text-blue-600">{selectedEmployee?.name}</span></h2>
            <p className="text-xs text-gray-500 mb-3">교체할 장비 쌍(기존 반납 ➡️ 신규 지급)을 여러 개 추가하여 한 번에 처리할 수 있습니다.</p>
            
            <div className="mb-4 bg-gray-50 p-2 rounded-lg border border-gray-200">
              <input 
                type="text" 
                className="w-full border border-gray-300 rounded p-2 text-xs outline-none focus:ring-1 focus:ring-purple-500" 
                placeholder="🔍 신규 지급할 자산 검색 (모델명, 관리번호 등)..." 
                value={replaceSearch} 
                onChange={e => setReplaceSearch(e.target.value)} 
              />
            </div>
            
            <div className="overflow-y-auto flex-1 pr-2 space-y-4">
              {replacePairs.map((pair, idx) => (
                <div key={idx} className="p-4 bg-gray-50 border border-gray-200 rounded-xl relative shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-bold text-xs text-gray-500 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-200">교체 세트 #{idx + 1}</span>
                    {replacePairs.length > 1 && (
                      <button type="button" onClick={() => setReplacePairs(replacePairs.filter((_, i) => i !== idx))} className="text-[11px] text-red-500 font-bold hover:underline bg-white px-2 py-0.5 rounded border border-red-100">삭제</button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <select className="w-full border border-red-200 rounded p-2 text-xs bg-red-50 outline-none focus:ring-1 focus:ring-red-400" value={pair.oldAssetId} onChange={e => updateReplacePair(idx, 'oldAssetId', e.target.value)}>
                        <option value="">[반납] 기존 보유 자산 선택</option>
                        {employeeAssets.map((a: any) => <option key={a.assetId} value={a.assetId}>[{a.category}] {a.model} ({a.assetId})</option>)}
                      </select>
                    </div>
                    <div className="text-center text-gray-400 font-bold text-xs">⬇️</div>
                    <div>
                      <select className="w-full border border-blue-300 rounded p-2 text-xs bg-white outline-none focus:ring-1 focus:ring-blue-500" value={pair.newAssetId} onChange={e => updateReplacePair(idx, 'newAssetId', e.target.value)}>
                        <option value="">[지급] 신규 지급 자산 선택</option>
                        {filteredReplaceAssets.map((a: any) => <option key={a.assetId} value={a.assetId}>[{a.category}] {a.model} ({a.assetId})</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setReplacePairs([...replacePairs, { oldAssetId: '', newAssetId: '' }])} className="w-full py-2.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl font-bold text-sm hover:bg-gray-50 transition">
                + 교체할 장비 쌍 추가
              </button>
            </div>

            <div className="pt-4 border-t border-gray-100 mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">일괄 교체 사유 (통합)</label>
                <input type="text" className="w-full border border-gray-300 rounded p-2.5 text-sm bg-white outline-none focus:ring-1 focus:ring-purple-500" value={replaceReason} onChange={e => setReplaceReason(e.target.value)} placeholder="예: 노후 장비 일괄 교체" required />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsReplaceModalOpen(false)} className="flex-1 bg-gray-200 py-3 rounded-lg font-bold text-gray-700 hover:bg-gray-300 transition" disabled={isReplacing}>취소</button>
                <button onClick={handleBulkReplaceSubmit} disabled={isReplacing || employeeAssets.length === 0} className="flex-1 bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 disabled:bg-gray-400 transition shadow-sm">
                  {isReplacing ? '처리 중...' : `총 ${replacePairs.length}세트 일괄 교체 실행`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}