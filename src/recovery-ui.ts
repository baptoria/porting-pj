import type { Files, Profile, Save } from "./model";
import {
  candidatePaths,
  effectiveFiles,
  equalBytes,
  restoredSave,
  saveScope,
  type RecoveryPoint,
  type RecoveryPolicy,
} from "./temp-save";
import { deletedFiles, isSavePath } from "./save-state";

function dialog(title: string) {
  window.dispatchEvent(new Event("ed4-release-input"));
  const d = document.createElement("dialog");
  const h = document.createElement("h2");
  h.textContent = title;
  d.append(h);
  (document.querySelector("#play-area") ?? document.body).append(d);
  d.addEventListener(
    "close",
    () => {
      window.dispatchEvent(new Event("ed4-release-input"));
      d.remove();
    },
    { once: true },
  );
  return d;
}
function text(d: HTMLElement, value: string) {
  const p = document.createElement("p");
  p.textContent = value;
  d.append(p);
  return p;
}
function button(d: HTMLElement, label: string, id: string, action: () => void) {
  const b = document.createElement("button");
  b.textContent = label;
  b.id = id;
  b.type = "button";
  b.onclick = action;
  d.append(b);
  return b;
}
export function chooseConsumedExit(
  paths: string[],
): Promise<"return" | "exit" | "recovery"> {
  return new Promise((resolve) => {
    const d = dialog("이어하기용 임시 저장 확인");
    d.id = "temp-exit-dialog";
    text(
      d,
      "이전 이어하기용 임시 세이브가 사용되었을 가능성이 있습니다. 게임 내부에서 다시 종료 저장하거나 일반 저장을 수행하지 않으면 현재 진행 상황을 이어 할 수 없을 수 있습니다.",
    );
    text(
      d,
      "파일 존재 후 삭제 관측: " +
        paths.join(", ") +
        " — 읽기 성공 여부는 확인하지 못했습니다.",
    );
    text(
      d,
      "웹 실행기 저장은 파일 변경분만 보관합니다. 현재 메모리의 진행 내용을 새 게임 세이브로 만들지 않습니다.",
    );
    let settled = false;
    const finish = (value: "return" | "exit" | "recovery") => {
      if (settled) return;
      settled = true;
      d.close();
      resolve(value);
    };
    button(d, "게임으로 돌아가기", "temp-exit-return", () => finish("return"));
    button(d, "현재 파일 변경분만 보존하고 종료", "temp-exit-confirm", () =>
      finish("exit"),
    );
    button(d, "마지막 복구 체크포인트 확인", "temp-exit-recovery", () =>
      finish("recovery"),
    );
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      finish("return");
    });
    d.showModal();
  });
}
export function showRecoveryPanel(
  data: {
    profile: Profile;
    source: Files;
    save?: Save;
    points: RecoveryPoint[];
    policy?: RecoveryPolicy;
    running: boolean;
  },
  actions: {
    exportPoint: (p: RecoveryPoint) => void;
    apply: (p: RecoveryPoint) => Promise<void>;
    preview: (p: RecoveryPoint) => Promise<void>;
    policy: (value: string) => Promise<void>;
  },
) {
  const d = dialog("이어하기 복구 지점");
  d.id = "recovery-dialog";
  text(d, `${data.profile.name} · ${data.profile.id}`);
  text(
    d,
    "복구는 파일 시점으로 돌아갑니다. 그 이후 메모리에만 있던 진행 내용은 복원하지 못합니다. 삭제된 임시 파일을 자동으로 되살리지 않습니다.",
  );
  const select = document.createElement("select");
  select.id = "recovery-point";
  for (const p of data.points) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = `${new Date(p.createdAt).toLocaleString("ko-KR")} · ${{ "before-consumption": "실행 전 복구본", "file-checkpoint": "파일 변경 체크포인트", "before-restore": "복구 적용 전 백업" }[p.kind]} · ${p.sessionId.slice(0, 8)}`;
    select.append(o);
  }
  d.append(select);
  const details = document.createElement("pre");
  details.id = "recovery-details";
  details.style.whiteSpace = "pre-wrap";
  details.style.maxHeight = "240px";
  details.style.overflow = "auto";
  d.append(details);
  const point = () => data.points.find((p) => p.id === select.value);
  const render = () => {
    const r = point(),
      effective = effectiveFiles(data.source, data.save),
      recovered = r
        ? effectiveFiles(
            data.source,
            restoredSave(data.profile, data.save, data.source, r),
          )
        : {},
      candidates = candidatePaths(data.source, data.save, data.policy);
    const paths = [
      ...new Set([
        ...Object.keys(data.source),
        ...Object.keys(effective),
        ...deletedFiles(data.save),
        ...Object.keys(r?.save.files ?? {}),
      ]),
    ]
      .filter((p) => saveScope(data.profile, p, candidates))
      .sort();
    const rows = paths
      .slice(0, 300)
      .map(
        (p) =>
          `${p}${candidates.includes(p) ? " [임시 후보]" : ""}\n  등록 원본: ${data.source[p]?.length ?? "없음"} · 현재: ${effective[p]?.length ?? (deletedFiles(data.save).includes(p) ? "삭제 표시" : "없음")} · 복구: ${recovered[p]?.length ?? "없음"} · ${equalBytes(effective[p], recovered[p]) ? "동일" : "차이"}`,
      );
    details.textContent = `현재 브라우저 저장: ${data.save ? new Date(data.save.updatedAt).toLocaleString("ko-KR") : "변경분 없음"}\n원본 개별 파일 작성 시각은 미수집. 현재 파일은 게임 메모리가 아닌 마지막 체크포인트입니다.\n${r ? "복구 관측: " + r.note : "보존된 복구 지점 없음. 이미 삭제된 파일의 과거 바이트는 재구성할 수 없습니다."}\n${rows.join("\n")}\n표시 ${Math.min(paths.length, 300)}/${paths.length}개 (단위 B)`;
  };
  select.onchange = render;
  render();
  const info = text(
    d,
    "브라우저 데이터는 삭제될 수 있습니다. 필요한 복구 지점은 ZIP으로 외부 백업하세요.",
  );
  info.id = "recovery-status";
  const run = async (action: () => Promise<void> | void) => {
    const buttons = Array.from(d.querySelectorAll("button"));
    const previous = buttons.map((b) => b.disabled);
    buttons.forEach((b) => (b.disabled = true));
    try {
      await action();
    } catch (e) {
      info.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      buttons.forEach((b, i) => (b.disabled = previous[i]));
    }
  };
  button(
    d,
    "복구 지점 ZIP 백업",
    "recovery-export",
    () =>
      void run(() => {
        const r = point();
        if (r) actions.exportPoint(r);
      }),
  ).disabled = !data.points.length;
  button(
    d,
    "저장 없이 복구본 시험",
    "recovery-preview",
    () =>
      void run(async () => {
        const r = point();
        if (r) {
          await actions.preview(r);
          d.close();
        }
      }),
  ).disabled = data.running || !data.points.length;
  button(
    d,
    "선택 시점 복구 적용",
    "recovery-apply",
    () =>
      void run(async () => {
        const r = point();
        if (!r) return;
        if (
          !confirm(
            `${new Date(r.createdAt).toLocaleString("ko-KR")}의 파일 시점으로 복구할까요? 현재 변경분은 먼저 별도 백업합니다. 이후 진행 내용은 복원되지 않을 수 있습니다.`,
          )
        )
          return;
        await actions.apply(r);
        d.close();
      }),
  ).disabled = data.running || !data.points.length;
  text(
    d,
    data.running
      ? "실행 중에는 복구 적용/시험을 할 수 없습니다. 게임으로 돌아가거나 종료 후 선택하세요."
      : "원본 게임·RAW는 복구 대상으로 교체하지 않습니다.",
  );
  const label = document.createElement("label");
  label.textContent =
    "수정본의 추가 임시 세이브 후보 경로 (한 줄에 하나, 존재하는 파일만 보존)";
  const input = document.createElement("textarea");
  input.id = "recovery-paths";
  input.value = (data.policy?.paths ?? []).join("\n");
  label.append(input);
  d.append(label);
  button(
    d,
    "후보 경로 저장",
    "recovery-policy",
    () =>
      void run(async () => {
        await actions.policy(input.value);
        info.textContent =
          "후보 경로를 저장했습니다. 다음 실행부터 관측합니다.";
      }),
  ).disabled = data.running;
  button(d, "닫기", "recovery-close", () => d.close());
  d.showModal();
}
