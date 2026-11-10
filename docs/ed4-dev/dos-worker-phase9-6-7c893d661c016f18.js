// Generated from the reviewed common Worker. GPL-2.0-only.
self.ed4DiagnosticEngine='phase9-6';
const bootstrapSend=self.postMessage.bind(self);
let bootstrapStage='import-common-worker';
try {
  importScripts('./dos-worker-common-phase9-6-eb1d69c995e7b4e1.js');
  bootstrapStage='check-common-worker';
  if(self.ed4CommonWorkerRevision!=='phase9-6-common-1')throw Error('Common Worker compatibility marker mismatch');
  bootstrapSend({name:'ed4-worker-bootstrap',props:{revision:'phase9-6-common-1',common:'dos-worker-common-phase9-6-eb1d69c995e7b4e1.js',sha256:'eb1d69c995e7b4e157d424a4b84d67ae24fd8de9661bebf8ac0d6511ec1ff259'}});
} catch (error) {
  const cause=typeof error?.message==='string'?error.message.slice(0,640):'Unknown importScripts failure';
  bootstrapSend({name:'ed4-runtime-error',props:{source:'worker-bootstrap',name:'Error',stage:bootstrapStage,filename:'dos-worker-common-phase9-6-eb1d69c995e7b4e1.js',message:'Phase 9-6 Worker 로딩/호환성 오류 (dos-worker-common-phase9-6-eb1d69c995e7b4e1.js): '+cause+'. 온라인에서 모든 실행기 탭/PWA를 닫고 업데이트 후 다시 여세요. 사이트 데이터는 삭제하지 마세요. 안정 엔진으로 자동 대체하지 않았습니다.'}});
  self.close();
}
