import {describe,it,expect,vi} from 'vitest';
import {scanGameFolder,selectGameFolder,folderPickerAvailable,folderUnavailable} from '../src/folder-registration';
import {publicImportError} from '../src/import-messages';
import {canonicalPath} from '../src/archive';
const file=(path:string)=>Object.assign(new File(['unchanged'],path.split('/').at(-1)!),{webkitRelativePath:path});
describe('folder-only game registration',()=>{
 it('discovers a nested game behind Unicode packaging folders without reading or copying bytes',()=>{
  const files=['Doogi/영웅전설4/ED4/Game.bat','Doogi/영웅전설4/ED4/ED4.EXE','Doogi/영웅전설4/ED4/EFFECT/Music.Raw','Doogi/launcher.exe'].map(file);
  for(const f of files)vi.spyOn(f,'arrayBuffer').mockRejectedValue(Error('must not read'));
  const scan=scanGameFolder(files),selection=selectGameFolder(scan,scan.preferred);
  expect(scan.preferred).toBe('영웅전설4/ED4');expect(selection.files.map(f=>f.path)).toEqual(['Game.bat','ED4.EXE','EFFECT/Music.Raw']);
  expect(selection.files[2].file).toBe(files[2]);expect(selection.excluded).toBe(1);
 });
 it('offers separate games without silently merging them',()=>{
  const scan=scanGameFolder(['pack/A/GAME.BAT','pack/B/GAME.BAT'].map(file));expect(scan.roots).toEqual(['','A','B']);expect(scan.preferred).toBe('');
  expect(selectGameFolder(scan,'B').files).toHaveLength(1);expect(()=>selectGameFolder(scan,'C')).toThrow();
 });
 it('accepts unknown modified executables without a whitelist',()=>{
  const scan=scanGameFolder([file('pack/NEW/MOD.COM')]);expect(scan.preferred).toBe('NEW');expect(selectGameFolder(scan,'NEW').files[0].path).toBe('MOD.COM');
 });
 it('never crops resource-only patch directories',()=>{
  const scan=scanGameFolder(['patch/SAVE/CUSTOM.DAT','patch/EFFECT/X.RAW'].map(file),true);expect(scan.roots).toEqual(['']);expect(selectGameFolder(scan,'').files[0].path).toBe('SAVE/CUSTOM.DAT');
 });
 it('defers ED4.iso without reading it and keeps other files and original Blob references',()=>{
  const iso=file('pack/ED4.iso');const read=vi.spyOn(iso,'arrayBuffer');const scan=scanGameFolder([file('pack/GAME.BAT'),iso,file('pack/DATA.BIN')]);
  const result=selectGameFolder(scan,'');expect(result.skippedIso).toBe(1);expect(result.files.map(f=>f.path)).toEqual(['GAME.BAT','DATA.BIN']);expect(read).not.toHaveBeenCalled();expect(scan.files).toHaveLength(3);
 });
 it('reports music outside the chosen game rather than guessing a new mount path',()=>{
  const scan=scanGameFolder(['pack/GAME/GAME.BAT','pack/music/X.RAW'].map(file));expect(selectGameFolder(scan,'GAME').outsideRaw).toBe(1);
 });
 it.each(['pack/../GAME/GAME.BAT','/pack/GAME.BAT','C:/pack/GAME.BAT','pack//GAME.BAT','pack/./GAME.BAT','pack/a\\b/GAME.BAT','pack/a\u0000/GAME.BAT'])('rejects unsafe selection before cropping: %s',path=>{
  expect(()=>scanGameFolder([file(path)])).toThrow();
 });
 it('rejects flat file selection with an actionable unsupported message',()=>{
  try{scanGameFolder([new File(['data'],'GAME.BAT')]);throw Error('unexpected');}catch(e){expect(publicImportError(e)).toBe(folderUnavailable);}
 });
 it('rejects mixed selection roots',()=>expect(()=>scanGameFolder(['A/GAME.BAT','B/GAME.BAT'].map(file))).toThrow());
 it('does not sanitize non-ASCII game paths or weaken existing DOS path policy',()=>{
  const scan=scanGameFolder(['wrapper/GAME.BAT','wrapper/음악/X.RAW'].map(file));expect(()=>canonicalPath(selectGameFolder(scan,'').files[1].path)).toThrow();
 });
 it('gives extraction instructions for compressed-only or ISO-only input',()=>{
  for(const path of ['pack/game.zip','pack/game.7z.001','pack/ED4.iso'])expect(()=>scanGameFolder([file(path)])).toThrow('압축파일을 먼저 해제');
 });
 it('checks capability and known Android Chrome limitations without rejecting modern Chrome',()=>{
  expect(folderPickerAvailable({},'Chrome/150')).toBe(false);
  for(const version of [120,131])expect(folderPickerAvailable({webkitdirectory:true},`Android Chrome/${version}`)).toBe(false);
  expect(folderPickerAvailable({webkitdirectory:true},'Android Chrome/132')).toBe(true);
  expect(folderPickerAvailable({webkitdirectory:true},'Android Chrome/130 SamsungBrowser/27')).toBe(true);
 });
});
