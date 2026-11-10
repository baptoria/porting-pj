// Generated from the reviewed common Worker. GPL-2.0-only.
self.ed4DiagnosticEngine='phase9-5b';
const bootstrapSend=self.postMessage.bind(self);
let bootstrapStage='import-common-worker';
try {
  importScripts('./dos-worker-common-phase9-5b-b5e75cd7e56ff2bd.js');
  bootstrapStage='check-common-worker';
  if(self.ed4CommonWorkerRevision!=='phase9-5b-common-1')throw Error('Common Worker compatibility marker mismatch');
  bootstrapSend({name:'ed4-worker-bootstrap',props:{revision:'phase9-5b-common-1',common:'dos-worker-common-phase9-5b-b5e75cd7e56ff2bd.js',sha256:'b5e75cd7e56ff2bd86b10e56bca8109943f314152f8c1d8d64e2e9a72e805d89'}});
} catch (error) {
  const cause=typeof error?.message==='string'?error.message.slice(0,640):'Unknown importScripts failure';
  bootstrapSend({name:'ed4-runtime-error',props:{source:'worker-bootstrap',name:'Error',stage:bootstrapStage,filename:'dos-worker-common-phase9-5b-b5e75cd7e56ff2bd.js',message:'Phase 9-5B Worker 로딩/호환성 오류 (dos-worker-common-phase9-5b-b5e75cd7e56ff2bd.js): '+cause+'. 온라인에서 모든 실행기 탭/PWA를 닫고 업데이트 후 다시 여세요. 사이트 데이터는 삭제하지 마세요. 안정 엔진으로 자동 대체하지 않았습니다.'}});
  self.close();
}
