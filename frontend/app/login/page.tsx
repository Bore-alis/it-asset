'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginAD } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await loginAD(username, password);
      if (result.success) {
        // 인증 성공 시 브라우저 스토리지에 로그인 상태 저장
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('loginUser', result.username);
        
        // 메인 자산 관리 페이지로 이동
        router.push('/');
      }
    } catch (err: any) {
      setError(err.message || '로그인에 실패했습니다. 사내 계정을 확인해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border-t-4 border-blue-600">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">IT 자산 관리 시스템</h1>
          <p className="text-sm text-gray-500 mt-2">사내 그룹웨어(AD) 계정으로 로그인하세요.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">아이디 (AD 계정)</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition"
              placeholder="그룹웨어 아이디 입력"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">비밀번호</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition"
              placeholder="비밀번호 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-red-500 font-bold bg-red-50 p-2 rounded border border-red-200">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition shadow-md disabled:bg-gray-400"
          >
            {isLoading ? '인증 확인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}