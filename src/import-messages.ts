import {FolderSelectionError} from './folder-registration';
/** Public copy never includes a raw exception, private path or internal stack. */
export function publicImportError(error:unknown):string {
 if(error instanceof FolderSelectionError) return error.message;
 const text=String(error);
 if (/AbortError|취소/.test(text)) return '등록을 취소했습니다. 기존 게임과 저장은 유지됩니다.';
 if (/Quota|저장 공간|용량/.test(text)) return '기기의 저장 공간이 부족합니다. 여유 공간을 확보한 뒤 다시 선택하세요.';
 if (/크기|MiB|개수|제한/.test(text)) return '파일 크기나 개수가 등록 가능한 범위를 넘었습니다. 필요한 게임 폴더를 선택하세요.';
 if (/ASCII|8\.3|경로|중복|충돌|파일명/.test(text)) return '파일 이름이나 폴더 구성을 확인해 주세요. 사용할 수 없는 이름 또는 겹치는 경로가 있습니다.';
 if (/실행 파일|본체/.test(text)) return '게임 실행 파일이 있는 폴더 전체를 선택해 주세요.';
 if (/ZIP|CRC|압축|zip|deflate/.test(text)) return '압축파일을 읽을 수 없습니다. 압축을 푼 게임 폴더를 선택하거나 파일이 손상되지 않았는지 확인하세요.';
 if (/OPFS|권한|음악|SecurityError|NotAllowedError/.test(text)) return '음악 파일을 보관할 수 없습니다. 브라우저의 저장 권한과 여유 공간을 확인하세요.';
 if (/시간|timeout|응답/.test(text)) return '파일 처리가 중단되었습니다. 게임 폴더 방식으로 다시 선택해 주세요.';
 return '파일을 등록하지 못했습니다. 게임 폴더 전체를 다시 선택해 주세요. 기존 게임과 저장은 유지됩니다.';
}
