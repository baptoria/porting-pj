// Generated from the reviewed common Worker. GPL-2.0-only.
self.ed4DiagnosticEngine='phase9-4';
const bootstrapSend=self.postMessage.bind(self);
let bootstrapStage='import-common-worker';
try {
  importScripts('./dos-worker-common-phase9-4-c870f43a6903b857.js');
  bootstrapStage='check-common-worker';
  if(self.ed4CommonWorkerRevision!=='phase9-4-common-1')throw Error('Common Worker compatibility marker mismatch');
  bootstrapSend({name:'ed4-worker-bootstrap',props:{revision:'phase9-4-common-1',common:'dos-worker-common-phase9-4-c870f43a6903b857.js',sha256:'c870f43a6903b8571754de5fb7749aa5c36db18573628d2e6caa3246f16e23a8'}});
} catch (error) {
  const cause=typeof error?.message==='string'?error.message.slice(0,640):'Unknown importScripts failure';
  bootstrapSend({name:'ed4-runtime-error',props:{source:'worker-bootstrap',name:'Error',stage:bootstrapStage,filename:'dos-worker-common-phase9-4-c870f43a6903b857.js',message:'Phase 9-4 Worker 로딩/호환성 오류 (dos-worker-common-phase9-4-c870f43a6903b857.js): '+cause+'. 온라인에서 모든 실행기 탭/PWA를 닫고 업데이트 후 다시 여세요. 사이트 데이터는 삭제하지 마세요. 안정 엔진으로 자동 대체하지 않았습니다.'}});
  self.close();
}
