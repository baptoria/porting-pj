import {
  previewRemoval,
  removeProfileData,
  renameProfile,
  retiredProfiles,
  restoreRetired,
  cleanupMusic,
  type RemovalScope,
  type RemovalPlan,
} from "./profile-management";
import { database, getSave } from "./storage";
import { exportBackup } from "./backup";
export function installProfileManagement(o: {
  run: (a: () => Promise<void>) => Promise<void>;
  idle: () => void;
  refresh: () => Promise<void>;
  notify: (s: string, error?: boolean) => void;
  download: (b: Uint8Array, n: string) => void;
}) {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<dialog id="profile-manage"><h2>프로필 관리</h2><label>이름<input id="manage-name" maxlength="100"></label><button id="manage-rename">이름 변경</button><button id="manage-delete">프로필 삭제…</button><button id="manage-close">닫기</button></dialog>
  <dialog id="profile-delete"><h2>프로필 삭제</h2><p id="delete-name"></p><label>삭제 범위<select id="delete-scope"><option value="profile">프로필만 삭제 · 게임과 세이브 유지</option><option value="unused">프로필 + 미사용 게임·음악 · 세이브 유지</option><option value="all">프로필 + 세이브·복구 지점 + 미사용 데이터</option></select></label><p id="delete-preview" role="status"></p><p>다른 프로필의 공유 데이터는 보존합니다. 보존한 세이브는 저장 공간 관리에서 프로필 복원·백업으로 다시 사용할 수 있습니다.</p><label id="delete-strong" hidden>세이브까지 영구 삭제하려면 “삭제” 입력<input id="delete-phrase" autocomplete="off"></label><button id="delete-backup">세이브 백업 다운로드</button><p class="hint">다운로드 완료는 기기의 다운로드 목록에서 직접 확인하세요. 복구 지점은 기존 복구 도구에서 별도로 내보낼 수 있습니다.</p><button id="delete-confirm" class="danger">선택 범위 삭제</button><button id="delete-cancel">취소</button></dialog>`,
  );
  const get = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const manage = get<HTMLDialogElement>("profile-manage"),
    dialog = get<HTMLDialogElement>("profile-delete");
  let id = "",
    plan: RemovalPlan | undefined;
  for (const d of [manage, dialog]) {
    const e = document.createElement("p");
    e.setAttribute("role", "alert");
    e.className = "management-error";
    d.append(e);
  }
  const run = (a: () => Promise<void>) =>
    void o.run(async () => {
      for (const d of [manage, dialog])
        d.querySelector(".management-error")!.textContent = "";
      try {
        o.idle();
        await a();
      } catch (e) {
        const d = dialog.open ? dialog : manage;
        d.querySelector(".management-error")!.textContent =
          e instanceof Error ? e.message : String(e);
        throw e;
      }
    });
  async function preview() {
    plan = undefined;
    get<HTMLButtonElement>("delete-confirm").disabled = true;
    const scope = get<HTMLSelectElement>("delete-scope").value as RemovalScope;
    get("delete-strong").hidden = scope !== "all";
    get<HTMLInputElement>("delete-phrase").value = "";
    plan = await previewRemoval(id, scope);
    get("delete-name").textContent = plan.profile.name;
    get("delete-preview").textContent =
      `삭제: 게임 ${plan.archiveIds.length}개, 음악 보관함 ${plan.musicIds.length}개${scope === "all" ? `, 세이브 ${plan.saves}개, 복구 지점 ${plan.recoveryPoints}개` : " · 세이브/복구 지점 보존"}\n공유 보호: 게임 ${plan.sharedArchives}개, 음악 ${plan.sharedMusic}개\n예상 회수량 ${(plan.estimatedBytes / 1048576).toFixed(2)} MiB (파일 논리 크기; 실제 회수량은 브라우저마다 다름)${plan.targets.length ? "\n"+plan.targets.join("\n") : ""}`;
    get<HTMLButtonElement>("delete-backup").disabled = !plan.saves;
    get<HTMLButtonElement>("delete-confirm").disabled = scope === "all";
  }
  async function openDelete(profileId: string) {
    id = profileId;
    get<HTMLSelectElement>("delete-scope").value = "profile";
    await preview();
    manage.close();
    if (!dialog.open) dialog.showModal();
  }
  document.getElementById("profiles")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-manage-profile]",
    );
    if (!b) return;
    e.stopPropagation();
    run(async () => {
      id = b.dataset.manageProfile!;
      const p = await (await database()).get("profiles", id);
      if (!p) throw Error("프로필이 없습니다.");
      get<HTMLInputElement>("manage-name").value = p.name;
      manage.showModal();
    });
  });
  get("manage-close").onclick = () => manage.close();
  get("delete-cancel").onclick = () => dialog.close();
  get("manage-rename").onclick = () =>
    run(async () => {
      await renameProfile(id, get<HTMLInputElement>("manage-name").value);
      manage.close();
      await o.refresh();
    });
  get("manage-delete").onclick = () => run(() => openDelete(id));
  get("delete-scope").onchange = () => run(preview);
  get("delete-phrase").oninput = () => {
    get<HTMLButtonElement>("delete-confirm").disabled =
      !plan ||
      (plan.scope === "all" &&
        get<HTMLInputElement>("delete-phrase").value !== "삭제");
  };
  get("delete-backup").onclick = () =>
    run(async () => {
      const s = await getSave(id);
      if (s && plan) {
        o.download(exportBackup(plan.profile, s), `ed4-save-${id}.zip`);
        o.notify(
          "백업 다운로드를 요청했습니다. 기기에 저장되었는지 확인하세요.",
        );
      }
    });
  get("delete-confirm").onclick = () =>
    run(async () => {
      if (
        !plan ||
        (plan.scope === "all" &&
          get<HTMLInputElement>("delete-phrase").value !== "삭제")
      )
        throw Error("삭제 범위를 다시 확인하세요.");
      const pending = await removeProfileData(plan);
      dialog.close();
      plan = undefined;
      await o.refresh();
      await renderRetired();
      o.notify(
        pending.length
          ? "프로필 정리는 완료했지만 음악 일부 정리가 남았습니다. 저장 공간 관리에서 다시 시도하세요."
          : "선택한 범위를 삭제했습니다. 공유 데이터는 보존했습니다.",
        !!pending.length,
      );
    });
  document
    .getElementById("storage-dialog")!
    .insertAdjacentHTML(
      "beforeend",
      '<section><h3>목록에서 제거한 프로필</h3><div id="retired-profiles"></div><button id="cleanup-music">미완료 음악 정리 다시 시도</button><p id="cleanup-state" role="status"></p></section>',
    );
  async function renderRetired() {
    const root = get("retired-profiles");
    root.replaceChildren();
    for (const r of await retiredProfiles()) {
      const row = document.createElement("div");
      row.className = "data-row";
      const name = document.createElement("span");
      name.textContent =
        r.profile.name +
        (r.dataKept ? " · 데이터 보존" : " · 게임 데이터는 다시 연결 필요");
      row.append(name);
      for (const [label, action] of [
        [
          "프로필 복원",
          async () => {
            await restoreRetired(r.id);
            await o.refresh();
            await renderRetired();
            o.notify(
              "프로필과 기존 세이브 연결을 복원했습니다. 누락된 게임 데이터는 저장 공간 관리에서 다시 연결하세요.",
            );
          },
        ],
        ["삭제 범위…", () => openDelete(r.id)],
      ] as const) {
        const b = document.createElement("button");
        b.textContent = label;
        b.onclick = () => run(action);
        row.append(b);
      }
      root.append(row);
    }
    if (!root.childElementCount) root.textContent = "보존된 프로필 없음";
    const jobs=await (await database()).getAll("cleanup");
    get("cleanup-state").textContent = `미완료 음악 정리 ${jobs.length}개`+(jobs.some(j=>j.lastError)?` · 최근 오류: ${[...new Set(jobs.map(j=>j.lastError).filter(Boolean))].join(", ")}`:"");
  }
  get("cleanup-music").onclick = () =>
    run(async () => {
      const pending = await cleanupMusic();
      await o.refresh();
      await renderRetired();
      o.notify(
        pending.length
          ? "음악 정리가 아직 완료되지 않았습니다. 다른 프로필과 세이브는 유지됩니다."
          : "미완료 정리를 확인했습니다.",
        !!pending.length,
      );
    });
  return { openDelete, renderRetired };
}
