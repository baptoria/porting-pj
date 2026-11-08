import { canonicalPath, executables, validateExecutable } from "./archive";
import { inspectGame } from "./file-analysis";
import type { Files, Profile } from "./model";

export interface LaunchCandidate {
  path: string;
  missing: string[];
  warnings: string[];
  initialization: string[];
  blocked: boolean;
}
export interface LaunchAnalysis {
  candidates: LaunchCandidate[];
  automatic?: string;
  reason: string;
}

/** Conservative static BAT analysis, never a command generator/interpreter.
 * Unknown syntax requires one explicit choice; known missing files block that BAT.
 * Actual DOS execution always uses the original selected BAT bytes unchanged.
 */
export function analyzeLaunch(files: Files, musicPaths: string[] = []): LaunchAnalysis {
  const present = new Set([...Object.keys(files), ...musicPaths].map(p => canonicalPath(p)));
  const windows = new Set(inspectGame(files).windowsExecutables);
  const resolvePath = (cwd: string, value: string): string => {
    let path = value.replace(/\\/g, "/").toUpperCase();
    if (/^[A-Z]:/.test(path)) {
      if (!path.startsWith("C:/")) throw Error("드라이브 상대 경로를 확인하세요");
      path = path.slice(2);
    }
    const parts = path.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
    for (const part of path.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") { if (!parts.length) throw Error("원본 밖의 상대 경로"); parts.pop(); }
      else parts.push(part);
    }
    return parts.length ? canonicalPath(parts.join("/")) : "";
  };
  const candidates = executables(files).map(path => {
    const item: LaunchCandidate = { path, missing: [], warnings: [], initialization: [], blocked: false };
    try { validateExecutable(path, files); } catch (e) { item.warnings.push(String(e)); item.blocked = true; }
    if (windows.has(path)) { item.warnings.push("DOS용이 아닌 PE/NE 실행 파일"); item.blocked = true; }
    const walk = (batch: string, initialCwd: string, stack: string[]): string => {
      let cwd = initialCwd;
      if (stack.includes(batch) || stack.length > 8) { item.warnings.push("BAT 호출 순환/깊이 제한: " + batch); return cwd; }
      const bytes = files[batch];
      if (!bytes || bytes.length > 16384 || bytes.some(b => b >= 128)) {
        item.warnings.push("BAT 길이 또는 문자 인코딩을 직접 확인하세요: " + batch); return cwd;
      }
      const lines = new TextDecoder().decode(bytes).split(/\r\n|\n|\r/).map(s => s.trim().replace(/^@/, ""))
        .filter(s => s && !/^(?:REM(?:\s|$)|::)/i.test(s));
      for (const [index, line] of lines.entries()) {
        if (/[%!&|<>^]/.test(line)) { item.warnings.push("변수/분기/리다이렉션을 직접 확인하세요: " + batch); continue; }
        const tokens = line.split(/\s+/), command = tokens.shift()!.toUpperCase();
        if (["ECHO", "CLS", "PAUSE"].includes(command)) continue;
        if (command === "C:") { item.warnings.push("드라이브별 작업 폴더를 직접 확인하세요: " + batch); continue; }
        if (["CD", "CHDIR"].includes(command)) {
          try {
            if (tokens.length !== 1) throw Error("CD 문법");
            cwd = resolvePath(cwd, tokens[0]);
            if (cwd && ![...present].some(p => p.startsWith(cwd + "/"))) item.missing.push(cwd + "/");
          } catch { item.warnings.push("작업 폴더 변경을 직접 확인하세요: " + batch); }
          continue;
        }
        if (["SET", "PATH", "IF", "GOTO", "FOR", "SHIFT", "EXIT", "LH", "LOADHIGH"].includes(command) || command.startsWith(":")) {
          item.warnings.push("자동 해석하지 않는 BAT 명령: " + command); continue;
        }
        const called = command === "CALL", target = called ? tokens.shift() : command;
        if (!target) { item.warnings.push("CALL 대상 없음"); continue; }
        try {
          const name = resolvePath(cwd, target);
          const choices = /\.(EXE|COM|BAT)$/i.test(name) ? [name] : [name + ".COM", name + ".EXE", name + ".BAT"];
          const matches = choices.filter(p => present.has(p));
          if (!matches.length) {
            if (/\.(EXE|COM|BAT)$/i.test(name)) item.missing.push(name);
            else item.warnings.push("DOS 내부 명령 또는 PATH의 프로그램인지 확인하세요: " + target);
            continue;
          }
          if (matches.length !== 1) { item.warnings.push("명령 확장자 중복: " + name); continue; }
          const found = matches[0];
          validateExecutable(found, files);
          if (windows.has(found)) { item.blocked = true; item.warnings.push("DOS용이 아닌 초기화 파일: " + found); }
          for (const arg of tokens.filter(t => /\.(?:EXE|COM|BAT|SYS|RAW)$/i.test(t))) {
            const ref = resolvePath(cwd, arg);
            if (!present.has(ref)) item.missing.push(ref);
          }
          item.initialization.push(found);
          if (found.endsWith(".BAT")) {
            cwd = walk(found, cwd, [...stack, batch]);
            if (!called && index < lines.length - 1) item.warnings.push("CALL 없는 BAT 연결 뒤 명령을 확인하세요: " + batch);
          }
        } catch { item.warnings.push("명령/경로를 직접 확인하세요: " + target); }
      }
      return cwd;
    };
    if (path.endsWith(".BAT")) {
      walk(path, path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "", []);
      if (!item.initialization.length) item.warnings.push("실행 흐름을 확인할 프로그램 호출이 없습니다.");
    }
    item.missing = [...new Set(item.missing)]; item.warnings = [...new Set(item.warnings)];
    item.blocked ||= item.missing.length > 0;
    return item;
  });
  const games = candidates.filter(c => /(^|\/)GAME\.BAT$/.test(c.path));
  const preferred = games.length === 1 ? games[0] : candidates.length === 1 ? candidates[0] : undefined;
  const automatic = preferred && !preferred.blocked && !preferred.warnings.length ? preferred.path : undefined;
  return { candidates, automatic, reason: automatic ? "실제 파일 참조와 실행 흐름을 확인했습니다. 게임 호환성은 실기 확인이 필요합니다." : candidates.length ? "실행 후보가 여러 개이거나 초기화 명령을 확인해야 합니다. 처음 한 번만 선택하세요." : "실행 BAT/EXE/COM이 없습니다. 게임 폴더 전체를 선택하세요." };
}

export function launchChoice(analysis: LaunchAnalysis, executable: string, manual: boolean): NonNullable<Profile["launch"]> {
  const candidate = analysis.candidates.find(c => c.path === executable);
  if (!candidate || candidate.blocked) throw Error("실행 파일 또는 참조 파일이 누락되었거나 지원하지 않습니다.\n" + (candidate?.missing.join(", ") ?? executable));
  if (!manual && analysis.automatic !== executable) throw Error("실행 후보를 먼저 선택하세요.");
  return { source: manual ? "user-choice" : executable.endsWith(".BAT") ? "analyzed-batch" : "single-file", presetId: "ed4-generic-experimental-v1", experimental: true, initialization: candidate.initialization };
}
