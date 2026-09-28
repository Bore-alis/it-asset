'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerEmployee } from '../../lib/api';

export default function RegisterUserPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    employeeId: '',
    name: '',
    department1: '',
    department2: '',
    department3: '',
    rank: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await registerEmployee(form);
    
    if (success) {
      alert('신규 사원이 등록되었습니다.');
      router.push('/users'); // 목록으로 이동
      router.refresh();      // 데이터 새로고침
    } else {
      alert('등록 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-8 bg-white shadow-md rounded-lg border border-gray-100">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">신규 사원 등록</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사번</label>
            <input 
              className="w-full border p-2 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="예: 2026001"
              onChange={e => setForm({...form, employeeId: e.target.value})} 
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input 
              className="w-full border p-2 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="홍길동"
              onChange={e => setForm({...form, name: e.target.value})} 
              required 
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">본부</label>
            <input className="w-full border p-2 rounded-md" placeholder="IT본부" onChange={e => setForm({...form, department1: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">팀</label>
            <input className="w-full border p-2 rounded-md" placeholder="인프라팀" onChange={e => setForm({...form, department2: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">파트</label>
            <input className="w-full border p-2 rounded-md" placeholder="운영파트" onChange={e => setForm({...form, department3: e.target.value})} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">직급</label>
          <input className="w-full border p-2 rounded-md" placeholder="과장" onChange={e => setForm({...form, rank: e.target.value})} />
        </div>

        <div className="pt-4">
          <button 
            type="submit" 
            className="w-full bg-blue-600 text-white p-3 rounded-md font-bold hover:bg-blue-700 transition-colors shadow-lg"
          > 
            사원 등록 완료
          </button>
        </div>
      </form>
    </div>
  );
}