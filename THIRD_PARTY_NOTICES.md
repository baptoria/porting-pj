# Third-party notices

This project is distributed under GPL-2.0-only; see `LICENSE`. No warranty is provided. No commercial game files are included. The original ED4TEST.COM test fixture and its generator are dedicated under CC0-1.0.

## Runtime and source

- **emulators 0.73.8**, the backend used by js-dos 7.x; Alexander Guryanov and upstream contributors. npm metadata declares GPL-2.0. Pinned source commit: `aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5` at <https://github.com/js-dos/emulators>. DOSBox has its own copyright notices within that source tree. The upstream GPL license is copied intact to `public/licenses/emulators-GPL-2.0.txt` on build.
- `public/sources/emulators-0.73.8-source.zip` accompanies the unmodified runtime binaries. It contains the pinned upstream source, build scripts, native DOSBox / libzip sources and the pinned native-only sokol submodule. The archive's `SOURCE-NOTES.txt` lists omitted test game bundles, images, and optional native benchmark binary embeds. None are needed to build the shipped browser DOSBox target. No upstream game bundles are retained or shipped.
- Upstream browser build: Linux, Emscripten **3.1.21** as specified by its Dockerfile, Node/yarn, CMake, then `yarn`, `yarn gulp wasm`, `yarn gulp`. `scripts/fetch-sources.py` regenerates the source archive from exact commits and records SHA-256 in `licenses/source-manifest.json`. An upstream source rebuild was not performed in this Phase: the npm release binaries were used unmodified.
- A browser engine adapter in `src/engine.ts` owns the Worker transport using the upstream public `backend` interface. No emulator binary patches were made. This permits deterministic teardown after a completed save if the upstream `exit()` acknowledgement is delayed.
- Phase 2 adds `public/dos-worker.js`, a GPL-2.0-only launcher adapter that imports the unmodified upstream Worker and observes its exported Emscripten filesystem during persist messages. It records file paths for deletion tracking. The adapter is included in the launcher source archive; upstream JavaScript and WASM bytes remain unchanged.
- Phase 3 extends this adapter with read-only, range-based access to user-imported OPFS music. It does not modify upstream binaries. The original synthetic PCM generator `scripts/raw-fixture.mjs` and generated `synthetic-raw.zip` are CC0-1.0 fixtures, not ED4 music. Source is included with the launcher. The incremental SHA-256 implementation is launcher source under GPL-2.0-only; no new third-party dependency was added.
- `public/sources/ed4-mobile-source.zip` is generated at build with all launcher source, build scripts, tests, lockfile and notices. When building from this archive, fetch upstream sources using `python scripts/fetch-sources.py` before deployment.
- Serve `docs/sources/` and `docs/licenses/` alongside executable assets when publishing. The in-app license link exposes both source archives. The service worker intentionally does not precache source archives; download them while online. Do not deploy only JavaScript/WASM and omit corresponding sources/notices.

## Other runtime libraries

| Package | License | Original author | Notice copied on build |
|---|---|---|---|
| fflate 0.8.3 | MIT | Arjun Barrett | `public/licenses/fflate-MIT.txt` |
| idb 8.0.3 | ISC | Jake Archibald | `public/licenses/idb-ISC.txt` |

Upstream emulators' included libzip/zlib/sokol files retain their own notices in the supplied source archive. Development tools are pinned in `package-lock.json` and are not shipped as browser runtime code.

## References checked 2026-11-08

- js-dos v7 package declaration: <https://github.com/caiiiycuk/js-dos/blob/7.xx/package.json>
- emulators license: <https://github.com/js-dos/emulators/blob/aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5/LICENSE>
- GPL v2 source distribution terms: <https://www.gnu.org/licenses/old-licenses/gpl-2.0.html>
- Original test fixture dedication: <https://creativecommons.org/publicdomain/zero/1.0/>

This is a record of the shipped components and distribution arrangement, not a claim that rights in any user-supplied game or mod have been granted.

