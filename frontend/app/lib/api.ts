// 백엔드 DTO(EmployeeDTO/AssetDTO/OrgChartDTO)에 대응하는 요청 바디 타입.
// 화면(form) 쪽에서 일부 필드만 채워 보내는 경우가 많아 선택 필드는 optional로 둠.
export interface EmployeeInput {
  employeeId: string;
  name: string;
  department1?: string;
  department2?: string;
  department3?: string;
  rank?: string;
  status?: string;
  email?: string;
  assetCount?: number;
}

export interface AssetInput {
  assetId: string;
  category?: string;
  model?: string;
  serialNumber?: string;
  status?: string;
  currentUserId?: string | null;
  reason?: string;
  purchaseDate?: string;
  accountingLedger?: string;
  accountingLedgerIndex?: string;
  residualValue?: number | string;
}

export interface OrgChartEntry {
  id?: number;
  department1: string;
  department2?: string;
  department3?: string;
  sortOrder?: number;
}

export interface AssetReplacePair {
  oldAssetId: string;
  newAssetId: string;
}

// 퇴직자 IT자산 초기화 증적
export interface WipeFile {
  fileId: number;
  wipeId: number;
  originalName: string;
  contentType?: string;
  fileSize?: number;
  uploadedAt?: string;
}

export interface WipeRecord {
  wipeId: number;
  assetId: string;
  employeeId?: string;
  employeeName?: string;
  department?: string;
  assetCategory?: string;
  assetModel?: string;
  serialNumber?: string;
  status: string;           // '대기' | '완료'
  wipeMethod?: string;
  performedBy?: string;
  note?: string;
  retiredAt?: string;
  wipedAt?: string;
  expiresAt?: string;       // 보관기한 (초기화일 + 3년)
  files?: WipeFile[];
}

// 1. 현재 실행 환경이 서버(SSR)인지 브라우저(CSR)인지 확인하여 동적으로 URL 설정
const isServer = typeof window === 'undefined';
const API_BASE_URL = isServer
  ? 'http://backend:8080/api/employees'
  : '/api/employees';

// 💡 NAS API 전용 동적 URL 설정 추가
const NAS_API_BASE_URL = isServer
  ? 'http://backend:8080/api/nas'
  : '/api/nas';

// 퇴직자 자산 초기화 증적 API
const WIPE_API_BASE_URL = isServer
  ? 'http://backend:8080/api/wipe'
  : '/api/wipe';

// GET 후 실패 시 fallback으로 대체하는 반복 패턴을 하나로 모음
async function getJson<T>(url: string, fallback: T): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  return response.ok ? await response.json() : fallback;
}

// POST/PUT/DELETE 후 성공 여부(boolean)만 반환하는 반복 패턴을 하나로 모음
async function sendRequest(url: string, method: string, body?: unknown): Promise<boolean> {
  const options: RequestInit = { method };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  return response.ok;
}

export async function getEmployees() {
  return getJson(API_BASE_URL, []);
}

export async function getDepartments() {
  return getJson(`${API_BASE_URL}/departments`, []);
}

export async function saveDepartments(data: OrgChartEntry[]) {
  return sendRequest(`${API_BASE_URL}/departments/save`, 'POST', data);
}

export async function registerEmployee(data: EmployeeInput) {
  return sendRequest(`${API_BASE_URL}/register`, 'POST', data);
}

export async function updateEmployee(employeeId: string, data: EmployeeInput) {
  return sendRequest(`${API_BASE_URL}/${employeeId}`, 'PUT', data);
}

export async function deleteEmployee(employeeId: string) {
  return sendRequest(`${API_BASE_URL}/${employeeId}`, 'DELETE');
}

export async function deleteAllEmployees() {
  return sendRequest(`${API_BASE_URL}/delete-all`, 'DELETE');
}

export async function retireEmployee(employeeId: string) {
  return sendRequest(`${API_BASE_URL}/${employeeId}/retire`, 'PUT');
}

export async function changeEmployeeStatus(employeeId: string, status: string) {
  return sendRequest(`${API_BASE_URL}/${employeeId}/status?status=${status}`, 'PUT');
}

export async function getEmployeeHistory(employeeId: string) {
  return getJson(`${API_BASE_URL}/${employeeId}/history`, []);
}

export async function getAllAssets() {
  return getJson(`${API_BASE_URL}/assets`, []);
}

export async function getAvailableAssets() {
  return getJson(`${API_BASE_URL}/assets/available`, []);
}

export async function getEmployeeAssets(employeeId: string) {
  return getJson(`${API_BASE_URL}/${employeeId}/assets`, []);
}

export async function registerAsset(data: AssetInput) {
  return sendRequest(`${API_BASE_URL}/assets/register`, 'POST', data);
}

export async function registerBulkAssets(dataList: AssetInput[]) {
  return sendRequest(`${API_BASE_URL}/assets/bulk-register`, 'POST', dataList);
}

export async function assignAsset(assetId: string, employeeId: string) {
  return sendRequest(`${API_BASE_URL}/assets/${assetId}/assign/${employeeId}`, 'PUT');
}

export async function returnAsset(assetId: string) {
  return sendRequest(`${API_BASE_URL}/assets/${assetId}/return`, 'PUT');
}

export async function updateAsset(assetId: string, data: AssetInput) {
  return sendRequest(`${API_BASE_URL}/assets/${assetId}`, 'PUT', data);
}

export async function deleteAsset(assetId: string) {
  return sendRequest(`${API_BASE_URL}/assets/${assetId}`, 'DELETE');
}

export async function getAssetHistory(assetId: string) {
  return getJson(`${API_BASE_URL}/assets/${assetId}/history`, []);
}

export async function getAllHistories() {
  return getJson(`${API_BASE_URL}/assets/history/all`, []);
}

export async function replaceAsset(employeeId: string, oldAssetId: string, newAssetId: string, reason: string) {
  return sendRequest(`${API_BASE_URL}/assets/replace`, 'POST', { employeeId, oldAssetId, newAssetId, reason });
}

export async function sendHistoryEmail(historyId: string) {
  return sendRequest(`${API_BASE_URL}/assets/history/${historyId}/send-email`, 'POST');
}

export async function changeAssetStatus(assetId: string, status: string) {
  return sendRequest(`${API_BASE_URL}/assets/${assetId}/status?status=${status}`, 'PUT');
}

export async function sendBulkHistoryEmail(historyIds: string[]) {
  return sendRequest(`${API_BASE_URL}/assets/history/bulk-send-email`, 'POST', historyIds);
}

export async function bulkAssignAsset(employeeId: string, assetIds: string[]) {
  return sendRequest(`${API_BASE_URL}/assets/bulk-assign`, 'POST', { employeeId, assetIds });
}

export async function bulkReplaceAsset(employeeId: string, replacePairs: AssetReplacePair[], reason: string) {
  return sendRequest(`${API_BASE_URL}/assets/bulk-replace`, 'POST', { employeeId, pairs: replacePairs, reason });
}

// 💡 [핵심 추가] AD 서버에 로그인을 요청하는 API 함수
export async function loginAD(username: string, password: string) {
  const response = await fetch(`${API_BASE_URL.replace('/employees', '/auth')}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }
  return await response.json();
}

/* ==========================================
 * 퇴직자 IT자산 초기화 증적
 * ========================================== */

export async function getWipeRecords(status?: string): Promise<WipeRecord[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return getJson(`${WIPE_API_BASE_URL}${query}`, []);
}

// 퇴사 처리 이전 건을 나중에 채워 넣을 때 사용하는 수동 등록
export async function createManualWipeRecord(data: Partial<WipeRecord>) {
  return sendRequest(`${WIPE_API_BASE_URL}/manual`, 'POST', data);
}

// 초기화 완료 처리 (첨부파일 포함) - FormData 이므로 Content-Type 을 직접 지정하지 않는다
export async function completeWipeRecord(
  wipeId: number,
  payload: { wipeMethod: string; performedBy: string; note?: string; wipedAt?: string },
  files: File[],
): Promise<boolean> {
  const formData = new FormData();
  formData.append('wipeMethod', payload.wipeMethod);
  formData.append('performedBy', payload.performedBy);
  if (payload.note) formData.append('note', payload.note);
  if (payload.wipedAt) formData.append('wipedAt', payload.wipedAt);
  files.forEach(file => formData.append('files', file));

  const response = await fetch(`${WIPE_API_BASE_URL}/${wipeId}/complete`, {
    method: 'POST',
    body: formData,
  });
  return response.ok;
}

export async function addWipeFile(wipeId: number, file: File): Promise<boolean> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${WIPE_API_BASE_URL}/${wipeId}/files`, {
    method: 'POST',
    body: formData,
  });
  return response.ok;
}

export async function deleteWipeFile(fileId: number) {
  return sendRequest(`${WIPE_API_BASE_URL}/files/${fileId}`, 'DELETE');
}

// 첨부파일 보기/다운로드 URL (브라우저에서 직접 접근)
export function wipeFileUrl(fileId: number) {
  return `/api/wipe/files/${fileId}`;
}

// 💡 [핵심 추가] NAS 권한 매핑 데이터를 가져오는 API 함수
export async function getNasMappings() {
  const response = await fetch(`${NAS_API_BASE_URL}/mappings`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('NAS 데이터를 불러오는데 실패했습니다.');
  }
  return await response.json();
}
