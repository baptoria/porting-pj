/** Compile-time capability. Query strings, DOM and saved preferences cannot enable it. */
export const DEVELOPER_TOOLS = import.meta.env.VITE_DEVELOPER_TOOLS === 'true';
export const DEVELOPER_ACTIONS = new Set([
  '#boot-open', '#boot-start', '#inspect-profile', '#export-diagnostics',
  '#demo', '#open-import', '#raw-preview', '#raw-stop',
]);
export function requireDeveloperTools() {
  if (!DEVELOPER_TOOLS) throw Error('이 기능은 별도 개발 빌드에서만 사용할 수 있습니다. 게임과 저장 자료는 그대로 유지됩니다.');
}
