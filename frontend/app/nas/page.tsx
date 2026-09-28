'use client';

import { useState, useEffect } from 'react';
import { getNasMappings } from '../lib/api'; 

interface NasMapping {
  nasName: string;
  folderName: string;
  authName: string;
  type: string;
  permission: string;
}

export default function NasPage() {
  const [mappings, setMappings] = useState<NasMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNas, setSelectedNas] = useState('');

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fetchNasMappings = async () => {
    setIsLoading(true);
    try {
      const data = await getNasMappings();
      if (Array.isArray(data)) {
        setMappings(data);
      } else {
        setMappings([]);
      }
    } catch (error) {
      console.error('NAS 연동 에러:', error);
      alert('NAS 통신 중 네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNasMappings();
  }, []);

  const handleCopyGroup = (fullName: string) => {
    if (fullName === '-' || fullName === '미할당') return;
    
    const pureGroupName = fullName.includes('\\') 
      ? fullName.substring(fullName.indexOf('\\') + 1) 
      : fullName;

    const fallbackCopy = (text: string) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setToastMsg(`'${text}' 복사 완료! (호환 모드)`);
        setTimeout(() => setToastMsg(null), 2000);
      } catch (err) {
        console.error('Fallback 복사 실패:', err);
      }
      document.body.removeChild(textArea);
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pureGroupName).then(() => {
        setToastMsg(`'${pureGroupName}' 복사 완료!`);
        setTimeout(() => setToastMsg(null), 2000);
      }).catch(err => {
        console.error('HTTPS 복사 실패, 호환 모드로 재시도:', err);
        fallbackCopy(pureGroupName);
      });
    } else {
      fallbackCopy(pureGroupName);
    }
  };

  const uniqueNasNames = Array.from(new Set(mappings.map(m => m.nasName).filter(Boolean)));

  const filteredMappings = mappings.filter((m) => {
    if (m.authName === '미할당' || m.authName === '-') return false;
    const matchNas = selectedNas === '' || m.nasName === selectedNas;
    const term = searchTerm.toLowerCase();
    const matchSearch = 
      (m.folderName || '').toLowerCase().includes(term) ||
      (m.authName || '').toLowerCase().includes(term);
    return matchNas && matchSearch;
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen relative">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex flex-col gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-1">통합 NAS-AD 권한 관리</h1>
            <p className="text-gray-500 font-medium">
              사내 등록된 모든 Synology NAS의 공유 폴더와 할당된 <span className="font-bold text-blue-600">대상(AD 그룹/사용자)</span> 매핑 현황입니다.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex flex-1 gap-2 min-w-[300px]">
              <select 
                value={selectedNas} 
                onChange={(e) => setSelectedNas(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 max-w-[200px]"
              >
                <option value="">전체 NAS 보기</option>
                {uniqueNasNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              
              <input 
                type="text" 
                placeholder="폴더명 또는 대상 이름 검색..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" 
              />
            </div>
            
            <button 
              onClick={fetchNasMappings} 
              disabled={isLoading}
              className="bg-blue-600 border border-blue-600 text-white px-5 py-2.5 rounded-md text-sm font-bold hover:bg-blue-700 transition shadow-sm flex items-center gap-2 disabled:bg-gray-400 disabled:border-gray-400"
            >
              {isLoading ? '⏳ 전체 NAS 데이터 수집 중...' : '🔄 전체 NAS 데이터 최신화'}
            </button>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden border">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-800 text-white text-sm border-b-2 border-gray-200">
              <tr>
                {/* 💡 헤더 너비 및 정렬 최적화 */}
                <th className="p-4 w-16 text-center">No</th>
                <th className="p-4 w-40 text-center">대상</th>
                <th className="p-4 w-32 text-center">NAS공유</th>
                <th className="p-4 w-[35%] text-left">폴더명</th>
                <th className="p-4 w-auto text-left">도메인그룹 (클릭 시 복사)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && mappings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-gray-500 font-bold text-lg animate-pulse">
                    전체 NAS에서 권한 데이터를 수집하고 있습니다...
                  </td>
                </tr>
              ) : filteredMappings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-gray-500 font-medium">
                    매핑된 권한 데이터가 없거나 검색 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredMappings.map((item, index) => (
                  <tr key={index} className="border-b transition-colors hover:bg-blue-50/50">
                    
                    {/* 💡 td 정렬 및 align-middle 속성 추가하여 세로 중앙 정렬 */}
                    <td className="p-4 text-center align-middle text-gray-400 font-mono text-sm">
                      {index + 1}
                    </td>
                    
                    <td className="p-4 text-center align-middle">
                      <span className="bg-gray-100 text-gray-800 border border-gray-300 px-2.5 py-1 rounded text-xs font-bold shadow-sm inline-block">
                        🖧 {item.nasName}
                      </span>
                    </td>

                    <td className="p-4 text-center align-middle text-gray-600 text-sm font-medium">
                      공유 폴더
                    </td>
                    
                    {/* 💡 flex 속성을 td 자체에서 분리하고 내부 div에 적용 */}
                    <td className="p-4 align-middle">
                      <div className="flex items-center gap-2 font-bold text-gray-900">
                        📁 {item.folderName}
                      </div>
                    </td>
                    
                    <td className="p-4 align-middle">
                      <div className="flex flex-col gap-1 items-start">
                        <span 
                          onClick={() => handleCopyGroup(item.authName)}
                          title="클릭하여 순수 그룹명 복사"
                          className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-md text-xs font-bold shadow-sm cursor-pointer hover:bg-indigo-100 transition-colors"
                        >
                          {item.authName !== '-' ? item.authName : '미할당/시스템'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm border ${
                          item.permission.includes('쓰기') 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          권한: {item.permission}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          <div className="bg-gray-50 p-4 border-t text-xs text-gray-500 flex justify-between items-center">
            <span>
              총 <strong className="text-gray-800">{uniqueNasNames.length}</strong>대의 장비에서 유효한 <strong className="text-blue-600">{filteredMappings.length}</strong>개의 권한 매핑이 검색되었습니다.
            </span>
            <span>💡 전체 NAS 데이터는 '최신화' 버튼 클릭 시 실시간으로 DSM API를 통해 수집됩니다.</span>
          </div>
        </div>
      </div>

      {toastMsg && (
        <div className="fixed bottom-10 right-10 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-bounce z-[9999]">
          <span className="text-green-400 font-bold">✓</span>
          <span className="text-sm font-medium">{toastMsg}</span>
        </div>
      )}
    </div>
  );
}