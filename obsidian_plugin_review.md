# Obsidian community-plugin scan — remediation worklist

Working file for a Claude Code session. **One concern per session**: pick the lowest-numbered
`status: todo` concern whose prerequisites are met, do only that concern, then update this file.

## Provenance

| | |
| --- | --- |
| Source | <https://community.obsidian.md/plugins/import-attachments-plus> |
| Scanned commit | `29d7192` — *chore: release 1.6.2* |
| Site badge | 96 warnings (95 recoverable + 3 info + 1 pass; one warning row is not rendered in the page payload) |
| Report pulled | 2026-08-25 |
| Line numbers | **remapped to `HEAD` (`b624c5e`) and verified** — every line below was confirmed to still hold the quoted code |

`src/main.ts` shifted by ~89 lines between the scanned commit and `HEAD` (the `attachmentFolder.ts`
extraction). The `line` column is current; `scanned` is what the website shows. All other files are unchanged.

To re-pull the report (no JSON API exists; this returns the React flight payload):

```bash
curl -H 'RSC: 1' https://community.obsidian.md/plugins/import-attachments-plus
```

## Protocol for the working session

1. Read this file plus `CLAUDE.md`. The **Key design points** there override the scanner: several
   findings are deliberate and marked as such below.
2. Change `status:` on the concern you took to `in-progress`, then to one of
   `done` / `wontfix` / `blocked`, and append a one-line `outcome:` with the commit SHA.
   Update it in the **same commit** as the code change so the file never lies.
3. Do not touch sites belonging to another concern, even in a file you are already editing.
   Overlapping edits across sessions are what makes this list unusable.
4. Gates before you call a concern done:
   - `npm run lint` — must stay **clean** (no errors, no warnings; CLAUDE.md)
   - `npm test` — 30 pure specs
   - `npm run build` — carries the `tsc -noEmit` type check
   - anything on the drop / paste / rename / delete paths needs a **manual vault test**; say so
     explicitly if you could not run one
5. ⚠️ `dist/` holds whichever build ran last. If you ran `npm run build` mid-debugging you wiped
   the dev tracing; check with `grep -c sourceMappingURL dist/main.js` before drawing conclusions.

## Verdict legend

- `fix` — mechanical fix
- `fix-with-care` — fix, needs judgement
- `investigate` — investigate first
- `false-positive-document` — false positive — document, do not change
- `false-positive-fix-anyway` — behaviourally fine — optional refactor
- `decision-needed` — needs a decision from the user

## Index

| ID | Concern | Sites | Verdict | Risk | Size | Status |
| --- | --- | --- | --- | --- | --- | --- |
| [C01](#c01) | Floating promises | 20 | `fix-with-care` | medium | L | done |
| [C02](#c02) | Unbound method references (`this` scoping) | 17 | `false-positive-fix-anyway` | medium | M | done |
| [C03](#c03) | Console logging | 10 | `false-positive-document` | low | S | done |
| [C04](#c04) | `setTimeout` → `window.setTimeout` | 6 | `fix` | low | S | done |
| [C05](#c05) | `await` on non-promises | 6 | `fix` | low | S | done |
| [C06](#c06) | `document.createElement` → `createEl` | 4 | `investigate` | low | S | done |
| [C07](#c07) | Unnecessary type assertions | 3 | `fix` | low | S | done |
| [C08](#c08) | `eslint-disable` without a reason | 3 | `fix` | low | S | done |
| [C09](#c09) | Cross-enum comparison in settings | 3 | `fix-with-care` | medium | S | done |
| [C10](#c10) | CommonJS `require` in `eslint.config.js` | 2 | `decision-needed` | low | S | todo |
| [C11](#c11) | `async` handler where `void` is expected | 2 | `fix` | low | S | done |
| [C12](#c12) | Top-level `path` import (mobile) | 2 | `investigate` | high | L | todo |
| [C13](#c13) | Top-level `fs` import (mobile) | 2 | `investigate` | high | L | todo |
| [C14](#c14) | Top-level `crypto` import (mobile) | 1 | `investigate` | high | S | todo |
| [C15](#c15) | API newer than `minAppVersion` | 2 | `decision-needed` | medium | S | todo |
| [C16](#c16) | Redundant `\| undefined` on optional params | 2 | `fix` | low | S | done |
| [C17](#c17) | Inline `style.display` in settings | 2 | `fix` | low | S | done |
| [C18](#c18) | `authorUrl` unreachable | 1 | `decision-needed` | low | S | todo |
| [C19](#c19) | `builtin-modules` dependency | 1 | `fix` | low | S | done |
| [C20](#c20) | `instanceof HTMLElement` across windows | 2 | `fix` | medium | S | done |
| [C21](#c21) | `clearTimeout` → `window.clearTimeout` | 1 | `fix` | low | S | done |
| [C22](#c22) | No `getSettingDefinitions()` (settings search) | 1 | `decision-needed` | medium | M | todo |
| [C23](#c23) | `Object.create(TFile.prototype) as TFile` | 1 | `false-positive-document` | low | S | done |
| [C24](#c24) | `display()` deprecated since 1.13 | 1 | `decision-needed` | low | S | todo |
| [C25](#c25) | `workspace.activeLeaf` deprecated | 1 | `fix` | low | S | done |
| [C26](#c26) | No release-asset attestations | — | `decision-needed` | low | M | todo |
| [C27](#c27) | Delete-image menu item did nothing (found while testing C25) | 2 | `fix` | high | S | done |
| [C28](#c28) | Delete prompt in a popout may never resolve (found while fixing C20) | 1 | `investigate` | medium | S | done |
| [C29](#c29) | Delete confirmation never resolved — deletion silently half-done | 1 | `fix` | **critical** | M | done |
| [C30](#c30) | Delete menu offered in reading view | 1 | `fix` | low | S | done |
| [C31](#c31) | 'Delete link and file' looked for the link at the caret | 1 | `fix` | medium | S | done |

**Suggested order.** Mechanical first, so the noise drops fast and later diffs stay small:
C16 → C05 → C08 → C07 → C04+C21 → C17 → C25 → C19 → C20 → C03 → C23 → C06.
Then the judgement calls: C01+C11 → C02 → C09.
Then take to the user: C18, C15, C10, C26, and C12/C13/C14 as one decision, with C22+C24 last
(they depend on the version floor C15 settles).

---

## C01 — Floating promises

```yaml
id: C01
status: todo          # todo | in-progress | done | wontfix | blocked
outcome: 20 sites, but 8 of them were manufactured by two needless `async` keywords; buckets recorded in the section; both rules now enforced in eslint.config.js — 4219b4e, 193e9b9, 302f2a0, acde983, 42060d5
severity: medium       # as reported by the scan
verdict: fix-with-care
risk: medium
size: L
sites: 20          # was 22; two were fixed in C27
```

**Scanner message**

> Promises must be awaited, end with a call to .catch, end with a call to .then with a rejection handler or be explicitly marked as ignored with the `void` operator.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/ImportAttachmentsModal.ts:151` | 151 | `this.import();` |
| `src/ImportAttachmentsModal.ts:695` | 695 | `if (doRenderPreview) {this.renderPreview();}` |
| `src/ImportAttachmentsModal.ts:872` | 872 | `this.renderPreview();` |
| `src/ImportAttachmentsModal.ts:906` | 906 | `this.renderPreview();` |
| `src/main.ts:180` | 260 | `updateVisibilityAttachmentFolders(this);` |
| `src/main.ts:502` | 568 | `this.delete_file_cb(file);` |
| ~~`src/main.ts:637`~~ | 703 | ~~`this.delete_file_cb(fileToBeDeleted,target);`~~ — **awaited**, see [C27](#c27) |
| ~~`src/main.ts:821`~~ | 910 | ~~`this.delete_img_cb(evt,target);`~~ — **caught + Notice**, see [C27](#c27) |
| `src/main.ts:884` | 973 | `this.handleFiles(filesArray, editor, view, doToggleEmbedPreference, ImportOperationType.PASTE);` |
| `src/main.ts:1013` | 1102 | `this.handleFiles(files_array, editor, view, doForceAsking, ImportOperationType.DRAG_AND_DROP);` |
| `src/main.ts:1081` | 1170 | `this.moveFileToAttachmentsFolder(nonFolderFilesArray, editor, view, importSettings);` |
| `src/main.ts:1392` | 1481 | `updateVisibilityAttachmentFolders(this);` |
| `src/main.ts:1403` | 1492 | `window.setTimeout(() => { updateVisibilityAttachmentFolders(this); }, 0);` |
| `src/main.ts:1411` | 1500 | `window.setTimeout(() => { updateVisibilityAttachmentFolders(this); }, 0);` |
| `src/patchConsole.ts:58` | 58 | `saveLogs();` |
| `src/patchOpenFile.ts:114` | 114 | `plugin.app.openWithDefaultApp(file.path);` |
| `src/settings.ts:48` | 48 | `this.plugin.saveSettings();` |
| `src/settings.ts:461` | 461 | `updateVisibilityAttachmentFolders(this.plugin);` |
| `src/settings.ts:576` | 576 | `this.plugin.saveSettings();` |
| `src/settings.ts:578` | 578 | `updateVisibilityAttachmentFolders(this.plugin);` |
| `src/settings.ts:615` | 615 | `this.plugin.saveSettings();` |
| `src/settings.ts:617` | 617 | `updateVisibilityAttachmentFolders(this.plugin);` |

**What the scanner wants** — every promise either awaited, `.catch()`-ed, or explicitly discarded with `void`.

**20 sites, not 22.** Two were on the delete path and are fixed in [C27](#c27), where the silent
rejection was the whole reason a broken feature looked like a no-op. That is also the worked
example of bucket 2 below.

**Assessment** — real, and the largest group. Do *not* blanket-prefix with `void`: several of these are the plugin's actual work (`this.import()`, `moveFileToAttachmentsFolder`, save-settings) where a rejection currently vanishes silently. Triage each site into one of three buckets:
1. fire-and-forget UI refresh (e.g. `this.renderPreview()`) → `void` is right,
2. work whose failure the user must see → `await` it, or `.catch(e => { console.error(e); new Notice(...) })`,
3. an `async` handler passed where a `void` return is expected → see C11, fix together.

**Do this** — walk the sites in file order, one file per commit. State the bucket you chose for each site in the commit message.

**Done, and the site list was not the right starting point.** A one-off type-checked lint run
(`no-floating-promises` + `no-misused-promises`, which the repo config does not enable) is the
ground truth and reproduced all 20 + C11's 2 exactly. Then, in file order:

| what | sites | bucket |
| --- | --- | --- |
| `updateVisibilityAttachmentFolders` is **not async** — no `await` in its body, no caller awaits it | 7 | none needed |
| `import()` in the modal, likewise | 1 | none needed |
| `renderPreview()` ×3, `saveLogs()` | 4 | 1 — `void` |
| `delete_file_cb`, `handleFiles` ×2, `moveFileToAttachmentsFolder`, `openWithDefaultApp`, `saveSettings` ×3 | 8 | 2 — `Utils.reportFailure` |
| C11's two async click listeners | 2 | 3 |

**Eight of the twenty needed no handling at all** — two `async` keywords on functions that never
await were manufacturing them. Prefixing `void` twenty times would have hidden that.

New shared helper `Utils.reportFailure(what, err)` — `console.error` plus a `Notice`, phrased for a
user — because eight sites in four files wanted the same thing.

`saveLogs()` in `patchConsole.ts` is the one deliberate exception: it runs *inside* the patched
console, so a `catch` that logs would re-enter it, and a `Notice` would fire per log line.

**Guarded against regression** — both rules are now enabled permanently in `eslint.config.js`, the
only type-aware rules there, which makes `npm run lint` a gate on this class of bug rather than a
one-time cleanup. They are effectively free: `project: 'tsconfig.json'` was already configured for
`src/**` (naming-convention needs it), so the TypeScript program was being built either way.
Measured, two runs each: **1.86 s / 1.39 s without, 1.73 s / 1.75 s with**.

**Traps** — `editor_drop_cb`/`editor_paste_cb` are Obsidian event callbacks: making the registration site `await` changes nothing (Obsidian ignores the returned promise), so the handling has to be *inside* the callback.

**Verify** — `npm run lint` stays clean, `npm test` green, then drag-drop + paste + rename by hand in a vault (these paths are not covered headlessly).

---

## C02 — Unbound method references (`this` scoping)

```yaml
id: C02
status: todo          # todo | in-progress | done | wontfix | blocked
outcome: 11 callbacks are arrow properties (binds gone, identity preserved), 4 patch sites disabled with reasons, and unbound-method is now enforced — 1fc9f4c; verified in a vault: drop, paste, rename, both menus, folder create/rename, stray repair, and the off() path on unload
severity: medium       # as reported by the scan
verdict: false-positive-fix-anyway
risk: medium
size: M
sites: 17
```

**Scanner message**

> A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.
> Consider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. 
> If a function does not access `this`, it can be annotated with `this: void`.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:182` | 262 | `this.app.workspace.on('layout-change', this.layout_change_cb)` |
| `src/main.ts:195` | 275 | `this.app.workspace.on('editor-drop', this.editor_drop_cb)` |
| `src/main.ts:201` | 281 | `this.app.workspace.on('editor-paste', this.editor_paste_cb)` |
| `src/main.ts:206` | 286 | `this.app.vault.on('rename', this.editor_rename_cb)` |
| `src/main.ts:217` | 297 | `this.app.vault.on('create', this.note_created_cb)` |
| `src/main.ts:220` | 300 | `this.app.metadataCache.on('changed', this.note_changed_cb)` |
| `src/main.ts:223` | 303 | `this.app.metadataCache.on('resolved', this.metadata_resolved_cb)` |
| `src/main.ts:229` | 309 | `this.app.vault.on('create', this.folder_created_cb)` |
| `src/main.ts:232` | 312 | `this.app.vault.on('rename', this.folder_renamed_cb)` |
| `src/main.ts:396` | 462 | `this.app.workspace.on('file-menu', this.file_menu_cb);` |
| `src/main.ts:400` | 466 | `this.app.workspace.off('file-menu', this.file_menu_cb as (...data: unknown[]) => unknown);` |
| `src/main.ts:408` | 474 | `d.addEventListener('contextmenu', this.context_menu_cb);` |
| `src/main.ts:430` | 496 | `d.removeEventListener('contextmenu', this.context_menu_cb);` |
| `src/patchFileManager.ts:23` | 23 | `originalPromptForDeletion = FileManager.prototype.promptForDeletion;` |
| `src/patchImportFunctions.ts:47` | 47 | `originalGetAvailablePathForAttachments = Vault.prototype.getAvailablePathForAttachments;` |
| `src/patchImportFunctions.ts:64` | 64 | `originalSaveAttachment = App.prototype.saveAttachment;` |
| `src/patchOpenFile.ts:88` | 88 | `originalOpenFile = WorkspaceLeaf.prototype.openFile;` |

**What the scanner wants** — no bare `this.someMethod` passed as a value.

**Assessment** — two distinct groups, and they need opposite treatment:

*Group A — the 13 `main.ts` event registrations.* These are **already safe**: the methods are `.bind(this)`-ed in the constructor at `main.ts:92-99`. The lint rule cannot see that, so it flags the registration site. Behaviourally a false positive.
- To satisfy it properly, convert each method to an arrow-function class property (`editor_drop_cb = async (evt, editor, view) => { … }`) and delete the matching `.bind` line in the constructor. Arrow properties are per-instance, so reference identity stays stable — which matters for the one `off()` call at `main.ts:400` (`file-menu`).
- Do the conversion and the `.bind` removal in the *same* commit. Half-done leaves a method bound to nothing or a double-bind.

*Group B — the 4 `patch*.ts` sites* (`originalX = SomeClass.prototype.method`). This is the monkey-patch save/restore pattern and it is **required** to store the unbound prototype method. Do **not** bind these. Add a scoped `eslint-disable-next-line @typescript-eslint/unbound-method` with a description (see C09) and move on. (That rule *is* resolvable, unlike the one C23 wanted to disable — but this config does not enable type-checked rules, so check first whether the directive is even needed: an unused one is a warning.)

**Traps** — CLAUDE.md: callbacks handed to `app.workspace.on(...)` must keep a stable identity so they can be `off()`-ed. Never wrap a registration in a fresh inline arrow.

**Done, both groups, and the rule is now enforced.** A one-off type-checked run reproduced all 17
(13 in `main.ts`, 4 in `patch*.ts`), so the split in the assessment was exactly right.

*Group A* — the 11 callbacks became arrow-function class properties and the 11 `.bind(this)` lines
went, in the same commit as the concern requires. **No registration site changed**: arrow
properties are per-instance, so `this.file_menu_cb` is still one stable reference and the `off()` at
`main.ts:423` still matches. The 13 findings in `main.ts` are gone; the bundle is ~570 bytes smaller
for the 11 binds it no longer performs.

*Group B* — the 4 `patch*.ts` sites keep the unbound prototype method, which is the whole point of
the save/restore: `unpatchX` puts it *back on the prototype*, where `this` is the caller. Each now
carries `// eslint-disable-next-line @typescript-eslint/unbound-method -- <reason>`.

**And the rule is enabled in `eslint.config.js`** — this was the precondition for the disables. As
[C23](#c23) found, a directive naming a rule ESLint cannot resolve is a hard error, and an *unused*
directive for a rule that is resolvable but disabled is a warning; either way the lint gate breaks.
Enabling the rule makes the four disables meaningful, costs nothing (the TypeScript program is
already built), and means a future `.bind`-less registration of a plain method gets caught.

**Verify** — after converting, load the plugin and confirm drop/paste/rename/file-menu all still fire, then unload and confirm the `file-menu` handler is gone (menu entries disappear).

---

## C03 — Console logging

```yaml
id: C03
status: done          # todo | in-progress | done | wontfix | blocked
outcome: dev-gated the only unconditional log (verified absent from the production bundle); patchConsole.ts now says why its console references stay — dea6fef
severity: medium       # as reported by the scan
verdict: false-positive-document
risk: low
size: S
sites: 10
```

**Scanner message**

> Avoid unnecessary logging to console

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/hideAttachmentFolders.ts:23` | 23 | `? (...args: unknown[]) => { console.log('[hide attachment folders]', ...args); }` |
| `src/main.ts:86` | 86 | `console.log('Import Attachments+: development mode including extra logging and debug features');` |
| `src/main.ts:242` | 322 | `console.log('Loaded plugin Import Attachments+');` |
| `src/patchConsole.ts:38` | 38 | `originalConsole.log = console.log;` |
| `src/patchConsole.ts:43` | 43 | `info: console.info,` |
| `src/patchConsole.ts:44` | 44 | `log: console.log,` |
| `src/patchConsole.ts:63` | 63 | `if(originalConsole.info) {console.info = logMessages(originalConsole.info, 'info');}` |
| `src/patchConsole.ts:64` | 64 | `if(originalConsole.log) {console.log = logMessages(originalConsole.log, 'log');}` |
| `src/patchConsole.ts:78` | 78 | `console.info = originalConsole.info;` |
| `src/patchConsole.ts:82` | 82 | `console.log = originalConsole.log;` |

**Assessment** — almost entirely deliberate:
- `patchConsole.ts` (7 sites) *is* the console-capture feature; the flagged lines are references like `originalConsole.log = console.log`. Untouchable.
- `hideAttachmentFolders.ts:23` is the dev-only tracer, gated on `process.env.NODE_ENV === 'development'` and tree-shaken out of production (CLAUDE.md relies on this to answer "is this private API still called?").
- `main.ts:86` is the dev-mode banner, also gated.
- `main.ts:242` (`console.log('Loaded plugin Import Attachments+')`) is the only unconditional one.

**Do this** — remove or dev-gate `main.ts:242`; leave the rest and add a one-line comment at the top of `patchConsole.ts` saying the console references are the point, so the next reader (or scan) does not re-litigate it.

---

## C04 — `setTimeout` → `window.setTimeout`

```yaml
id: C04
status: done          # todo | in-progress | done | wontfix | blocked
outcome: all 6 modal setTimeout calls window-scoped, together with C21 — 65c6161
severity: medium       # as reported by the scan
verdict: fix
risk: low
size: S
sites: 6
```

**Scanner message**

> Use 'window.setTimeout()' instead of 'setTimeout()' for popout window compatibility.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/ImportAttachmentsModal.ts:154` | 154 | `setTimeout(() => {` |
| `src/ImportAttachmentsModal.ts:266` | 266 | `setTimeout(() => {` |
| `src/ImportAttachmentsModal.ts:350` | 350 | `setTimeout(() => {` |
| `src/ImportAttachmentsModal.ts:434` | 434 | `setTimeout(() => {` |
| `src/ImportAttachmentsModal.ts:505` | 505 | `setTimeout(() => {` |
| `src/ImportAttachmentsModal.ts:565` | 565 | `setTimeout(() => {` |

**Assessment** — real and worth fixing. Multi-window support is a stated design point (CLAUDE.md #2): a bare `setTimeout` in a popout window resolves against the wrong global.

**Do this** — mechanical replacement at all 6 sites. Pair with C21 (`clearTimeout`) in one commit; `settings.ts:46` already uses `window.setTimeout`, so this makes the file consistent.

**Verify** — `npm run lint`, then open a modal in a popout window and confirm the delayed focus/scroll still happens.

---

## C05 — `await` on non-promises

```yaml
id: C05
status: done          # todo | in-progress | done | wontfix | blocked
outcome: dropped the 6 no-op awaits (5 debouncedSaveSettings, 1 doesFileExist); enclosing async kept — c3c682e
severity: medium       # as reported by the scan
verdict: fix
risk: low
size: S
sites: 6
```

**Scanner message**

> Unexpected `await` of a non-Promise (non-"Thenable") value.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:1117` | 1206 | `const existingFile = await Utils.doesFileExist(this.app.vault,destFilePath);` |
| `src/settings.ts:433` | 433 | `await this.debouncedSaveSettings();` |
| `src/settings.ts:444` | 444 | `await this.debouncedSaveSettings();` |
| `src/settings.ts:460` | 460 | `await this.debouncedSaveSettings();` |
| `src/settings.ts:487` | 487 | `await this.debouncedSaveSettings();` |
| `src/settings.ts:506` | 506 | `await this.debouncedSaveSettings();` |

**Assessment** — real, confirmed by reading the signatures:
- `settings.ts` ×5: `debouncedSaveSettings(fnc?)` returns `void` (`settings.ts:38`). `await` on it is a no-op that reads as "the save completed", which it does not — the save is 50 ms later.
- `main.ts:1117`: `Utils.doesFileExist(vault, path)` is declared `: boolean` (`utils.ts:213`), not async.

**Do this** — drop the `await`. Then check whether the enclosing functions still need to be `async`; if a caller's only `await` was one of these, the `async` may now be dead too (but leaving it is harmless — do not chase it if it widens the diff).

**Traps** — do not "fix" this by making `debouncedSaveSettings` return a promise. Its whole contract is to debounce; a caller awaiting the flush would be a behaviour change.

---

## C06 — `document.createElement` → `createEl`

```yaml
id: C06
status: done          # todo | in-progress | done | wontfix | blocked
outcome: one real site; used activeDocument.createElement rather than createEl, and recorded why; other 3 sites are false positives — 901c5e8
severity: medium       # as reported by the scan
verdict: investigate
risk: low
size: S
sites: 4
```

**Scanner message**

> Uses `document.createElement` instead of Obsidian's `createEl` helpers

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/ImportAttachmentsModal.ts:61` | 61 | `switchLabel.createEl('span', { cls: 'import-slider' });` |
| `src/ImportAttachmentsModal.ts:632` | 632 | `this.previewEmptyEl.createEl('div', { text: 'No preview', cls: 'import-preview-text' });` |
| `src/ImportAttachmentsModal.ts:633` | 633-636 | `this.previewEmptyEl.createEl('div', {` |
| `src/main.ts:914` | 1003 | `const input = document.createElement('input');` |

**Assessment** — only **one** real site. `grep -rn 'document.createElement' src/` returns exactly `main.ts:914`. The three `ImportAttachmentsModal.ts` sites the scanner points at already use `createEl`/`createDiv`, so the line attribution there is off or the rule is matching the surrounding block — confirm and dismiss them.

**Confirmed and dismissed:** `grep -c createElement src/ImportAttachmentsModal.ts` is **0**. All
three flagged lines already use `el.createEl(...)`. False positives.

**Do this** — `main.ts:914` is a hidden `<input type=file>` used to open a native picker. It is never attached to a document, so `createEl` buys nothing except rule compliance; converting it is still fine (`createEl('input', { attr: { type: 'file' } })`). Low value either way — decide and record which.

**Decided: neither option the scan offered — `activeDocument.createElement('input')`.** The reasoning,
since the worklist asked for it to be recorded:

- The element is never attached, so `createEl`'s conveniences (cls/text/parent) are dead weight here.
- `createEl` is a *global* helper and creates in the **main window's** document. So does the
  `document.createElement` it would replace. Converting therefore buys rule compliance and nothing
  else — while leaving a cross-window bug of exactly the kind [C20](#c20) just fixed twice: run the
  import command from a popout and the file dialog belongs to the wrong window.
- `activeDocument` is the document of the window the user is actually in. Obsidian does **not**
  augment `Document` with `createEl` (only `on`/`off`, `obsidian.d.ts:223`), so compliance and
  cross-window correctness cannot be combined at this site. Correctness wins; the cosmetic warning
  stays.

**Unverified** — whether Chromium routes a detached input's file chooser to its owning document's
window. If it does not, this change is merely harmless rather than a fix. Testable by running the
command from a popout and seeing which window the dialog attaches to.

**Verify** — if changed, exercise the "import from vault / choose file" command end to end; a detached input that stops firing `change` is a silent break.

---

## C07 — Unnecessary type assertions

```yaml
id: C07
status: done          # todo | in-progress | done | wontfix | blocked
outcome: two assertions were redundant and are gone; the modal one was NOT (querySelector returns Element) — now querySelector<HTMLElement> — cdb52b9
severity: medium       # as reported by the scan
verdict: fix
risk: low
size: S
sites: 3
```

**Scanner message**

> This assertion is unnecessary since it does not change the type of the expression.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/ImportAttachmentsModal.ts:909` | 909 | `const firstRow = scroller.querySelector(‘.${ROW_CLASSNAME}‘) as HTMLElement \| null;` |
| `src/strayAttachments.ts:127` | 127 | `const filesWithLinks = (app.vault.getFiles() as TFile[])` |
| `src/strayAttachments.ts:129` | 129 | `.map(t => ({ f: t, m: app.metadataCache.getFileCache(t) as CachedMetadata \| null }))` |

**Assessment** — real; `as` casts that assert the type the expression already has.

**Do this** — delete the three assertions. `strayAttachments.ts:127` (`app.vault.getFiles() as TFile[]`) and `:129` (`getFileCache(t) as CachedMetadata | null`) already return those types.

**Traps** — `strayAttachments.ts` has the documented `== null` vs `=== null` hazard nearby (CLAUDE.md, Lint section). Do not touch the comparisons while you are in the file; removing a cast must not change a nullability check.

**Verify** — `npm test` (the stray-attachment specs cover this file), plus the in-app suite if you have a dev build.

---

## C08 — `eslint-disable` without a reason

```yaml
id: C08
status: done          # todo | in-progress | done | wontfix | blocked
outcome: appended `-- reason` to all three no-require-imports directives; lint still suppresses them — 4ebfa6a
severity: medium       # as reported by the scan
verdict: fix
risk: low
size: S
sites: 3
```

**Scanner message**

> Unexpected undescribed directive comment. Include descriptions to explain why the comment is necessary.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:989` | 1078 | `// eslint-disable-next-line @typescript-eslint/no-require-imports` |
| `src/main.ts:995` | 1084 | `// eslint-disable-next-line @typescript-eslint/no-require-imports` |
| `src/main.ts:1374` | 1463 | `// eslint-disable-next-line @typescript-eslint/no-require-imports` |

**Assessment** — real and cheap. All three are `// eslint-disable-next-line @typescript-eslint/no-require-imports`, the deliberate lazy `require('electron')` (CLAUDE.md: `electron` is required inside functions on purpose, unlike `fs`/`path`).

**Do this** — append ` -- electron is required lazily so the module is not touched on mobile` (or the accurate reason per site). Format: `// eslint-disable-next-line rule -- reason`.

**Note** — the same fix pattern applies to any disable you add for C02 group B.

---

## C09 — Cross-enum comparison in settings

```yaml
id: C09
status: todo          # todo | in-progress | done | wontfix | blocked
outcome: narrowed with two new type guards, removing 12 casts; also fixed `value in ImportActionType`, which tested keys rather than values — a6bdfc2
severity: medium       # as reported by the scan
verdict: fix-with-care
risk: medium
size: S
sites: 3
```

**Scanner message**

> The two values in this comparison do not have a shared enum type.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/settings.ts:75` | 75 | `if (value !== ImportActionType.ASK_USER) {` |
| `src/settings.ts:96` | 96 | `if (value !== ImportActionType.ASK_USER) {` |
| `src/settings.ts:117` | 117 | `if (value !== YesNoTypes.ASK_USER) {` |

**Assessment** — real type-safety hole: the dropdown handler receives a `string`, compared against `ImportActionType.ASK_USER` / `YesNoTypes.ASK_USER`. TypeScript is telling you the comparison can never be trusted.

**Do this** — narrow at the boundary: type the handler parameter as the enum (`(value: ImportActionType) => …`) or convert explicitly (`value as ImportActionType`) once, at the top of the callback, rather than at each comparison.

**Traps** — this gates real behaviour (whether the "ask the user" modal appears). Getting the narrowing wrong silently disables the prompt. `types.ts` already has type guards — prefer reusing one over a bare cast.

**Done — and two of the three validations were wrong in a way the scan did not report.** Sites 75
and 96 guarded with `value in ImportActionType`, which tests the enum's **keys**, not its values.
It works only by coincidence: every member is spelled `MOVE='MOVE'`. Give any member a value that
differs from its key and both dropdowns would silently stop saving — `console.error('Invalid import
action type')` and no write — while the UI went on showing the new selection.

Fixed as the concern suggested, by narrowing once at the boundary with a real guard rather than
casting at each use. Two new guards in `types.ts`, `isImportActionType` and `isYesNoTypes`, written
in the same shape as the existing `isAttachmentFolderLocationType`. After the guard, `value` *is*
the enum, so the ASK_USER comparisons share its type and **all four `as` casts per handler are
gone** (12 in total across the three handlers).

**Left alone deliberately** — the fourth dropdown (`MultipleFilesImportTypes`, `settings.ts:150`)
uses `Object.values(...).includes(value as ...)`. That is *correct*, unlike `in`, and it is not a
C09 site: it has no ASK_USER comparison. It could take the same treatment for consistency, which
is a one-line follow-up nobody has asked for.

**Verify** — flip each of the three settings through every value and confirm ASK_USER still opens
the modal and the others still skip it.

**Verify** — flip each of the three settings through every value and confirm the ASK_USER path still opens a modal and the others still skip it.

---

## C10 — CommonJS `require` in `eslint.config.js`

```yaml
id: C10
status: todo          # todo | in-progress | done | wontfix | blocked
outcome:              # one line + commit SHA, filled in by the session that closes this
severity: medium       # as reported by the scan
verdict: decision-needed
risk: low
size: S
sites: 2
```

**Scanner message**

> A `require()` style import is forbidden.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `eslint.config.js:3` | 3 | `const js = require('@eslint/js');` |
| `eslint.config.js:4` | 4 | `const tseslint = require('typescript-eslint');` |

**Assessment** — cosmetic. `eslint.config.js` is a build-tooling file, not shipped code; the scan does not distinguish.

**Options** — (a) rename to `eslint.config.mjs` and use `import`; (b) rename to `.cjs` and keep `require`; (c) leave it and accept 2 warnings.

**Traps** — `package.json` has no `"type": "module"`, so plain `.js` is CJS today and the file works. Renaming touches how `npm run lint` resolves config; run `npm run lint` immediately after and confirm it still reports on `src` **and** `tests` (CLAUDE.md: this config was silently matching zero files once before).

---

## C11 — `async` handler where `void` is expected

```yaml
id: C11
status: todo          # todo | in-progress | done | wontfix | blocked
outcome: both listeners now return void — one extracted as moveOneStray(), one catching through reportFailure; done in the C01 pass as its note suggested — 302f2a0
severity: medium       # as reported by the scan
verdict: fix
risk: low
size: S
sites: 2
```

**Scanner message**

> Promise returned in function argument where a void return was expected.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/ImportAttachmentsModal.ts:835` | 835-856 | `confirmButton.addEventListener('click', async (e) => {` |
| `src/ImportAttachmentsModal.ts:933` | 933-935 | `yesButton.addEventListener('click', async () => {` |

**Assessment** — real. `addEventListener('click', async (e) => { … })`: a rejection inside becomes an unhandled rejection with no UI feedback.

**Do this** — wrap the body in `try/catch` and surface the failure (`new Notice(...)` / `console.error`), keeping the handler `async`; or extract the work into a named async function and call it as `void doThing().catch(...)`.

**Note** — same root cause as C01; if you do C01 first, do these two sites in that pass and mark this concern done-with-C01.

---

## C12 — Top-level `path` import (mobile)

```yaml
id: C12
status: todo          # todo | in-progress | done | wontfix | blocked
outcome:              # one line + commit SHA, filled in by the session that closes this
severity: medium       # as reported by the scan
verdict: investigate
risk: high
size: L
sites: 2
```

**Scanner message**

> Do not import Node.js built-in module "path". Node.js APIs are not available on mobile. Use a dynamic import() or require() guarded by Platform.isDesktop instead.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:44` | 45 | `import { sep, posix } from 'path';` |
| `src/utils.ts:8` | 8 | `import * as path from 'path';` |

**Assessment** — real, and this is the plugin's biggest open question, not a lint nit. `manifest.json` declares `isDesktopOnly: false`, but `fs`, `path` and `crypto` are `require`d at module top level, so on mobile the plugin may fail to load outright. CLAUDE.md lists this as **never verified by a human**. C12/C13/C14 are one problem — handle them in a single session.

**Do this** — decide the direction *first*, with the user:
- (a) set `isDesktopOnly: true` — honest, one-line, loses the mobile-capable subset (rename events, delete menus) that the current code claims to support; or
- (b) make the imports lazy behind `Platform.isDesktopApp` and split the desktop-only helpers into a module loaded on demand — the real fix, and a substantial refactor of `utils.ts` + `main.ts`.

**Traps** — `utils.ts` uses `path` throughout for the POSIX↔OS conversion that CLAUDE.md design point #6 depends on; do not swap it for string surgery without tests. `attachmentFolder.ts` was extracted precisely so this logic is testable without Obsidian — lean on `npm test` here.

**Verify** — after either route, `npm run build`, then load on a real mobile device or accept that (a) makes the question moot. Do not claim mobile works without a device test.

---

## C13 — Top-level `fs` import (mobile)

```yaml
id: C13
status: todo          # todo | in-progress | done | wontfix | blocked
outcome:              # one line + commit SHA, filled in by the session that closes this
severity: medium       # as reported by the scan
verdict: investigate
risk: high
size: L
sites: 2
```

**Scanner message**

> Do not import Node.js built-in module "fs". Node.js APIs are not available on mobile. Use a dynamic import() or require() guarded by Platform.isDesktop instead.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:46` | 47 | `import { promises as fs } from 'fs';  // This imports the promises API from fs` |
| `src/utils.ts:2` | 2 | `import { promises as fs } from 'fs';  // This imports the promises API from fs` |

Same problem and same decision as **C12** — `main.ts:46`, `utils.ts:2`. Do not fix in isolation.

---

## C14 — Top-level `crypto` import (mobile)

```yaml
id: C14
status: todo          # todo | in-progress | done | wontfix | blocked
outcome:              # one line + commit SHA, filled in by the session that closes this
severity: medium       # as reported by the scan
verdict: investigate
risk: high
size: S
sites: 1
```

**Scanner message**

> Do not import Node.js built-in module "crypto". Node.js APIs are not available on mobile. Use a dynamic import() or require() guarded by Platform.isDesktop instead.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/utils.ts:3` | 3 | `import * as crypto from 'crypto';` |

Same problem as **C12** — `utils.ts:3`. Cheapest of the three to resolve independently: `crypto` is used for `hashFile` (the `${md5}` name template) and `crypto.randomUUID()` is available as a web global, so part of this import may already be replaceable.

---

## C15 — API newer than `minAppVersion`

```yaml
id: C15
status: todo          # todo | in-progress | done | wontfix | blocked
outcome:              # one line + commit SHA, filled in by the session that closes this
severity: medium       # as reported by the scan
verdict: decision-needed
risk: medium
size: S
sites: 2
```

**Scanner message**

> Uses Obsidian APIs newer than the declared `minAppVersion`

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:588` | 652 | `return this.app.vault.getFileByPath(file_path);` |
| ~~`src/main.ts:631`~~ | 697 | ~~`const fileInVault = this.app.vault.getFileByPath(src);`~~ — **gone**, see [C27](#c27) |

**Assessment** — real. Both sites call `vault.getFileByPath()`, which postdates the declared `minAppVersion: 1.5.0`. On 1.5.0 these calls are `undefined` → a crash on the attachment-resolution path.

**One site down.** `main.ts:631` was removed by [C27](#c27) — not for this concern's reason but because `getFileByPath` was the wrong function there entirely. **One site left** (`main.ts:588`), so this stays open, but it is now a one-line decision. Note the remaining site has the same linkpath-vs-vault-path confusion C27 fixed, though there a `null` is benign: it only skips a cross-check. Worth folding into whichever way C15 is settled.

**Do this** — one of:
- (a) bump `minAppVersion` in `manifest.json` to the version that introduced `getFileByPath` (**look it up, do not guess**); or
- (b) replace with `vault.getAbstractFileByPath(p)` + `instanceof TFile`, which works on every supported version.

(b) is the safer default — it keeps the 1.5.0 floor that every release so far has declared.

**Traps** — CLAUDE.md: `manifest.json`, `package.json` and `versions.json` must stay in sync; `minAppVersion` is *not* touched by `npm version`, so a bump is a hand edit. `versions.json` maps plugin version → minAppVersion, so bumping affects which app versions get offered the update.

---

## C16 — Redundant `| undefined` on optional params

```yaml
id: C16
status: done          # todo | in-progress | done | wontfix | blocked
outcome: dropped `| undefined` at both sites; type check clean, no behaviour change — b396655
severity: medium       # as reported by the scan
verdict: fix
risk: low
size: S
sites: 2
```

**Scanner message**

> Explicit undefined is unnecessary on an optional parameter.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:733` | 799 | `getAttachmentFolderOfMdNote(md_file?: ParsedPath \| undefined): string {` |
| `src/settings.ts:38` | 38 | `debouncedSaveSettings(fnc?:(()=>void) \| undefined) {` |

**Assessment** — real and trivial: `x?: T | undefined` — the `?` already implies it.

**Do this** — drop the `| undefined` at both sites. Pure syntax, no behaviour change.

**Verify** — `npm run build` (the `tsc -noEmit` pass) is sufficient.

---

## C17 — Inline `style.display` in settings

```yaml
id: C17
status: done          # todo | in-progress | done | wontfix | blocked
outcome: class toggle instead of inline display; needed a new class — .import-plugin-hidden is explorer-scoped — c9d948e
severity: medium       # as reported by the scan
verdict: fix
risk: low
size: S
sites: 2
```

**Scanner message**

> Sets styles directly instead of using CSS classes, `setCssProps`, or `setCssStyles`

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/settings.ts:588` | 588 | `attachmentFolderSetting.settingEl.style.display = 'none';` |
| `src/settings.ts:592` | 592 | `attachmentFolderSetting.settingEl.style.display = '';` |

**Assessment** — real. Obsidian asks plugins to toggle classes so themes and snippets can override.

**Do this** — replace the two `settingEl.style.display = 'none' | ''` with a class toggle (`settingEl.toggleClass('import-plugin-hidden', hide)` — that class already exists in `styles/styles.css`) or `setCssStyles({ display: … })`.

**Traps** — `import-plugin-hidden` is also what `hideAttachmentFolders.ts` puts on file-explorer items. If you reuse it here, confirm the CSS rule is not scoped to the explorer; if it is, add a separate class rather than widening the existing rule.

**Verify** — toggle the setting that hides/shows that row and watch it appear and disappear.

---

## C18 — `authorUrl` unreachable

```yaml
id: C18
status: todo          # todo | in-progress | done | wontfix | blocked
outcome:              # one line + commit SHA, filled in by the session that closes this
severity: medium       # as reported by the scan
verdict: decision-needed
risk: low
size: S
sites: 1
```

**Scanner message**

> Manifest URL field is not reachable

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `manifest.json:8` | 8 | `"authorUrl": "https://www.linkedin.com/in/dr-andrea-alberti/",` |

**Assessment** — **scanner false positive, user's call.** `manifest.json:8` is `authorUrl` → your LinkedIn profile, which returns **HTTP 999** to non-browser clients (LinkedIn blocks bots). Verified: `curl` gets 999, a browser gets the page. `fundingUrl` returns 200 and is fine.

**Options** — (a) leave it and accept the warning permanently; (b) point `authorUrl` at `https://github.com/alberti42` to clear it. Purely a preference — **ask the user, do not decide.**

---

## C19 — `builtin-modules` dependency

```yaml
id: C19
status: done          # todo | in-progress | done | wontfix | blocked
outcome: replaced with module.builtinModules and uninstalled; production bundle byte-identical — 0eff357
severity: medium       # as reported by the scan
verdict: fix
risk: low
size: S
sites: 1
```

**Scanner message**

> "builtin-modules" should be replaced with an alternative package.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `package.json:22` | 20 | `"builtin-modules": "^5.3.0",` |

**Assessment** — cosmetic; it is a **devDependency** used by the esbuild config to mark Node builtins external, so it never ships. The scan does not distinguish dev from runtime deps.

**Do this** — replace with the stdlib equivalent: `import { builtinModules } from 'node:module'`, then drop the dep from `package.json`.

**Traps** — CLAUDE.md: **zero runtime dependencies** is a hard rule; this change keeps that true and shrinks the dev tree. After editing, run `npm run build` and confirm the bundle still externalises the builtins (the bundle size should not jump).

---

## C20 — `instanceof HTMLElement` across windows

```yaml
id: C20
status: done          # todo | in-progress | done | wontfix | blocked
outcome: both sites use instanceOf; the scan had missed the context-menu one, which broke the feature in popouts outright; verified in a popout: the item appears and deletion works — 9000d19
severity: medium       # as reported by the scan
verdict: fix
risk: medium
size: S
sites: 2          # 1 from the scan, 1 it missed
```

**Scanner message**

> Use '.instanceOf(HTMLElement)' instead of 'instanceof HTMLElement' for cross-window safe type checking.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/patchFileManager.ts:129` | 129 | `node instanceof HTMLElement && node.classList.contains('modal-container')` |
| `src/main.ts:879` | — | `if(!(evt.target instanceof HTMLElement)) {return;}` — **the scan missed this one** |

**Assessment** — real, and a genuine bug in popout windows: each window has its own `HTMLElement` constructor, so `node instanceof HTMLElement` is `false` for a node from another window. `patchFileManager.ts:129` uses it to detect the modal container, i.e. deletion prompts in a popout may not be recognised.

**Do this** — swap for Obsidian's cross-window-safe check (`node.instanceOf(HTMLElement)`).

**A second site, not in the scan.** `context_menu_cb` (`main.ts:879`) opens with
`evt.target instanceof HTMLElement`, and that handler is registered on **every document**
(design point #2) precisely so it works in popouts. In a popout the check is false, so the
handler returns immediately and *Delete image file* never appears there at all. Same defect,
same fix; `grep -rn 'instanceof HTMLElement' src/` now returns nothing.

⚠️ **`instanceOf` is not the whole popout story for the modal site.** The observer is armed with
`.observe(document.body, …)`, and that `document` is the **main window's**. If Obsidian renders
the delete-confirm modal into the focused popout's document instead, the observer never fires and
`registeredUserDecisionPromise` never resolves — the await simply hangs, with no error. Unmeasured;
filed as [C28](#c28) rather than guessed at.

**Traps** — multi-window is design point #2; `patchFileManager` is on the note-deletion path, which is destructive. Test in a popout: delete a note that has an attachment folder and confirm the folder prompt still appears and still targets the right folder.

**Testing note** — the modal branch only runs when Obsidian's *Confirm file deletion* is on
(`promptDelete`). With it off, `callOriginalPromptForDeletion` resolves immediately and the
observer is never armed, so the fixed line is not exercised at all. The `main.ts` site, by
contrast, is exercised by any right-click on an embed in a popout.

---

## C21 — `clearTimeout` → `window.clearTimeout`

```yaml
id: C21
status: done          # todo | in-progress | done | wontfix | blocked
outcome: settings.ts clearTimeout window-scoped, in the same commit as C04 — 65c6161
severity: medium       # as reported by the scan
verdict: fix
risk: low
size: S
sites: 1
```

**Scanner message**

> Use 'window.clearTimeout()' instead of 'clearTimeout()' for popout window compatibility.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/settings.ts:43` | 43 | `clearTimeout(this.saveTimeout);` |

Same as **C04**, one site (`settings.ts:43`). Note the sibling line `settings.ts:46` already uses `window.setTimeout`, so the pair is currently mismatched — fix both in one commit.

---

## C22 — No `getSettingDefinitions()` (settings search)

```yaml
id: C22
status: todo          # todo | in-progress | done | wontfix | blocked
outcome:              # one line + commit SHA, filled in by the session that closes this
severity: medium       # as reported by the scan
verdict: decision-needed
risk: medium
size: M
sites: 1
```

**Scanner message**

> This PluginSettingTab does not implement getSettingDefinitions(); its settings will not appear in Obsidian's settings search for users on 1.13.0 or later. Consider adopting the declarative settings API.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/settings.ts:28` | 28 | `export class ImportAttachmentsSettingTab extends PluginSettingTab {` |

**Assessment** — real but version-gated: on Obsidian ≥ 1.13 this plugin's settings will not show up in the settings search. The API does not exist on 1.5.0, the declared floor (see C15).

**Do this** — a feature, not a cleanup. Adding it means describing every control in `settings.ts` declaratively, guarded so 1.5.0 users keep the existing `display()` path. Related info-level item: `display` itself is deprecated since 1.13.0 (**C24**).

**Recommendation** — do C15 first (it settles the version floor), then treat this as its own scoped task.

---

## C23 — `Object.create(TFile.prototype) as TFile`

```yaml
id: C23
status: done          # todo | in-progress | done | wontfix | blocked
outcome: comment only — an eslint-disable naming the scanner rule is a hard error in ESLint 10 — ba6ac7d
severity: medium       # as reported by the scan
verdict: false-positive-document
risk: low
size: S
sites: 1
```

**Scanner message**

> Avoid casting to 'TFile'. Use an 'instanceof TFile' check to safely narrow the type.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/utils.ts:224` | 224 | `const tfile = Object.create(TFile.prototype) as TFile;` |

**Assessment** — deliberate. `utils.ts:224` is `createMockTFile`, which fabricates a `TFile` for a file that is not in the vault yet; an `instanceof` check is not applicable because the object is being constructed. The scanner's suggested fix does not apply.

**Do this** — add a scoped `eslint-disable-next-line` **with a description** (see C08) plus a comment explaining why a real `TFile` cannot be obtained here. Do not restructure.

⚠️ **The `eslint-disable` half of that is not available.** The rule lives in the community
scanner, not in `eslint.config.js`, and ESLint 10 treats a directive naming an unresolvable
rule as an **error** (`Definition for rule 'obsidianmd/no-tfile-tfolder-cast' was not found`),
which breaks the lint gate. Measured, not assumed. So: explanatory comment only, unless the
scanner's plugin is ever added as a devDependency. **The same applies to C02 group B.**

---

## C24 — `display()` deprecated since 1.13

```yaml
id: C24
status: todo          # todo | in-progress | done | wontfix | blocked
outcome:              # one line + commit SHA, filled in by the session that closes this
severity: info       # as reported by the scan
verdict: decision-needed
risk: low
size: S
sites: 1
```

**Scanner message**

> `display` is deprecated. Since 1.13.0. Use {@link getSettingDefinitions} instead.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:645` | 711 | `if(activeTab && activeTab instanceof ImportAttachmentsSettingTab) {activeTab.display();}` |

Info-level. `main.ts:645` calls `activeTab.display()` to redraw the settings tab after an external settings change (design point #5, `onExternalSettingsChange`). The replacement is `getSettingDefinitions` — i.e. this is the same work as **C22**. Keep them together; do not half-migrate.

---

## C25 — `workspace.activeLeaf` deprecated

```yaml
id: C25
status: done          # todo | in-progress | done | wontfix | blocked
outcome: getActiveViewOfType(MarkdownView) replaces activeLeaf in context_menu_cb; null now bails instead of falling through — c3cd712; verified in a vault: the item appears on an embed in a note and not on an image outside a markdown view
severity: info       # as reported by the scan
verdict: fix
risk: low
size: S
sites: 1
```

**Scanner message**

> `activeLeaf` is deprecated. The use of this field is discouraged.
> The recommended alternatives are:
> - If you need information about the current view, use {@link Workspace.getActiveViewOfType}.
> - If you need to open a new file or navigate a view, use {@link Workspace.getLeaf}.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:795` | 884 | `const activeLeaf = this.app.workspace.activeLeaf;` |

Info-level, real. `main.ts:795` reads `this.app.workspace.activeLeaf`. Replace per Obsidian's guidance — usually `workspace.getActiveViewOfType(MarkdownView)` when you want the active editor, or `workspace.getMostRecentLeaf()` when you want a leaf to open into. Read the surrounding function to pick which; they are not interchangeable.

**Verify** — exercise the command that runs through this line with several panes open, including a popout.

---

## C26 — No release-asset attestations

```yaml
id: C26
status: todo          # todo | in-progress | done | wontfix | blocked
outcome:              # one line + commit SHA, filled in by the session that closes this
severity: info       # as reported by the scan
verdict: decision-needed
risk: low
size: M
sites: 2  # release assets: main.js, styles.css
```

**Scanner message**

> Missing GitHub artifact attestations for release assets

**Sites** — none in source; release-asset / repo-level check.

Info-level, repo-level (no source lines — it concerns the released `main.js` and `styles.css`). Attestations let users cryptographically verify the assets were built from this repo.

**Assessment** — the scan already reports **"Build reproduced the release `main.js` byte-for-byte"** as a pass, so reproducibility is established; attestations would add provenance signing on top.

**Do this** — requires a GitHub Actions release workflow with `actions/attest-build-provenance` and `id-token: write`. The repo currently has **no CI** (CLAUDE.md) and releases are cut by hand with `gh release create`, so this means introducing a release workflow. Scoped project, user's call.

---

## C27 — Delete-image menu item did nothing

```yaml
id: C27
status: done          # todo | in-progress | done | wontfix | blocked
outcome: two causes — wrong DOM element (closest('.internal-embed')) and wrong resolver (resolveLink); verified working in a real vault — 2b9a3b6 + 68129dc
severity: high        # not from the scan: found by manual test
verdict: fix
risk: high
size: S
sites: 2
```

**Not a scanner finding.** Found while manually verifying [C25](#c25): right-clicking an embedded
image offered *Delete image file*, and clicking it did nothing at all — no notice, no error, no
deletion.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:630` | — | `const src = parent.getAttribute('src');` |
| `src/main.ts:631` | — | `const fileInVault = this.app.vault.getFileByPath(src);` |

**Two independent causes, both confirmed by a dev-build trace in a real vault.** The first fix
alone did not make the feature work; both lines above were wrong.

**Cause 1 — the wrong element.** `target.parentElement` is not the `.internal-embed` wrapper:
Obsidian nests further elements between it and the `<img>`, so `getAttribute('src')` returned
`null` (`[delete attachment] menu item clicked {tagName: 'IMG', src: null}`) and the function
returned before resolving anything. Fixed by `target.closest('.internal-embed')`, which located
`div.internal-embed.media-embed.image-embed.is-loaded`.

**Cause 2** — the `src` attribute of an `.internal-embed` is the link *as written*, i.e. a
**linkpath**, while `vault.getFileByPath()` resolves from the **vault root**. The two coincide only
under the `Absolute path in vault` link format. Under `Shortest path when possible` (Obsidian's
default) or `Path from the current file`, folders are omitted — `Notes/shot.png` is embedded as
`![[shot.png]]` — so the lookup returned `null` and `delete_img_cb` hit a bare `return`. Links are
written by `fileManager.generateMarkdownLink` (`main.ts:1268`), which honours that setting, so the
plugin generated links its own delete path could not resolve.

This is exactly the invariant CLAUDE.md already states for `strayAttachments.ts`: resolve links via
`getFirstLinkpathDest`, never by re-parsing the written form. The rule was simply never applied here.
The trace confirms it was load-bearing: `src` arrived as the bare
`Screenshot ….png` and resolved to `Notes/Screenshot ….png`, which `getFileByPath` could never
have found.

**Also fixed, but not the cause and still unverified.** CodeMirror's `posAtDOM` raises when the
node is not part of the editor content — its own doc comment says so — which is the normal case in
reading view, in a hover popover and inside a Dataview block. That throw is not a
`DeleteLinkError`, so it was rethrown into a floated promise and vanished. It is now caught, with
a fallback that asks the metadata cache for the offset of the *sole* reference to the file (with
none there is nothing to remove; with several there is no way to know which was clicked, so both
decline and the file is deleted without touching the note). The confirmed session ran in
`mode: 'source'`, where `posAtDOM` returned 6 — so **this branch has never actually been
exercised**; reading view is the test that would.

**Fix** — export the existing `resolveLink()` from `strayAttachments.ts` (one implementation, and it
already handles url-encoded markdown-style embeds) and call it with the active note as the source
path. The unresolved branch now logs instead of returning silently, which is what hid this.

**Instrumentation** — the path now carries dev-only tracing in the `hideAttachmentFolders.ts`
idiom, in both `main.ts` and `patchFileManager.ts`. It is what turned "nothing happens" into a
one-click diagnosis, and this path has now broken twice invisibly, so it stays.

⚠️ **CLAUDE.md is wrong about that idiom.** It claims the dev-only tracing calls are "tree-shaken
out of production entirely". They are not: `process.env.NODE_ENV` is substituted and the tracer
collapses to a no-op, but the call sites and their argument expressions survive — `'swept'`, from
the pre-existing tracer that sentence describes, is present in `dist/main.js` after
`npm run build`. Harmless, but the claim should not be relied on.

**Interaction with C15** — this deleted one of C15's two `getFileByPath` sites; see that concern.

**Interaction with C01** — two of C01's 22 floating-promise sites are on this path and were fixed
here, because the unhandled rejection *was* the invisibility: `delete_img_cb` is now awaited by its
caller, and the menu `onClick` catches, logs and shows a `Notice`. C01's site list is annotated.

**Verify** — right-click an embedded image under a non-absolute link format and delete it; confirm
both the file and the link go. Repeat with a markdown-style embed (`![alt](path)`) and with a
subfolder attachment.

---

## C28 — Delete prompt in a popout may never resolve

```yaml
id: C28
status: todo          # todo | in-progress | done | wontfix | blocked
outcome: real, and fixed by construction in C29 — both documents are observed now, and the yes-path no longer needs the modal at all; popout *cancel* still unverified — 4386b0a
severity: unknown     # not from the scan: noticed while fixing C20
verdict: investigate
risk: medium
size: S
sites: 1
```

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/patchFileManager.ts:185` | — | `}).observe(document.body, config);` |

**Not a scanner finding.** Noticed while fixing [C20](#c20). `callOriginalPromptForDeletion` arms a
`MutationObserver` on `document.body` — the **main window's** body, since `document` is resolved at
module scope — and then awaits a promise that only the observer can resolve. If Obsidian renders
the delete-confirm modal into a focused popout's document, the observer never fires and the await
never settles: no error, no prompt, nothing. That is the same shape of silent failure as
[C27](#c27), where a floated rejection made a broken feature look inert.

**Unmeasured.** It needs one test rather than an argument: enable Obsidian's *Confirm file deletion*,
open a note in a popout, delete an attachment there, and watch for
`[delete attachment] modal container detected` in a dev build. If it never prints, this is real.

**Confirmed real, and fixed in [C29](#c29)** — which had to rewrite this function anyway. The
observer now watches `document` **and** `activeDocument`, and, more importantly, the answer no
longer depends on seeing the modal: a confirmed deletion is recognised from the vault's own
`delete` event, so the popout "yes" path cannot be missed regardless of which document the modal
lives in. What remains unverified is *cancelling* a prompt in a popout, which would fall through to
the 60 s timeout rather than settling immediately if the modal were somehow not observed.

**Original note — the observer must watch the document the modal is actually in.** Candidates:
`activeWindow.document.body`, or the `doc` of the leaf being acted on (`leaf.view.containerEl.doc`).
Design point #2 already requires everything document-touching to go through
`iterateOverAllDocuments`, which this does not.

**Traps** — this is the note/attachment deletion path. A wrong observer root does not merely fail to
detect: it hangs the caller, and `modalResolvePromise` is a single module-level slot, so a stuck
prompt can strand the next one too.

---

## C29 — Delete confirmation never resolved

```yaml
id: C29
status: done          # todo | in-progress | done | wontfix | blocked
outcome: replaced modal-button scraping with the vault's own delete event; verified in a vault, file and link both go — 4386b0a
severity: critical    # not from the scan: found by manual test
verdict: fix
risk: high
size: M
sites: 1
```

**Not a scanner finding, and the most serious thing this review turned up.** Found while testing
[C28](#c28), with Obsidian's *Confirm file deletion* turned on — which is its **default**.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/patchFileManager.ts:133` | — | `const deleteButton = modal.querySelector('.modal-button-container .mod-warning');` |

**What happened** — `callOriginalPromptForDeletion` read the user's answer off the confirm modal's
buttons. Current Obsidian has no `.modal-button-container .mod-warning`, so the lookup returned
null and the code `throw`-ed — *inside the MutationObserver callback*, where nothing catches. The
listeners were never attached, `modalResolvePromise` was never called, and the promise stayed
pending forever. Obsidian's own prompt still trashed the file, so the visible result was:

- the file disappeared,
- and everything downstream of the answer was skipped: the link was never removed
  (`removeWikilinkOnFileDeletion` looked broken), and in `patchFileManager` the whole
  attachment-folder cleanup never ran — so **deleting a note never deleted its attachment folder**
  for any user with the confirmation prompt on.

Trace, on a first attempt with the prompt enabled:

```
[delete attachment] modal container detected
Uncaught Error: Failed to correctly identify the "Delete" button.
[delete attachment] original promptForDeletion returned, awaiting the user decision
   … and then nothing at all
```

**Fix** — stop reading private markup. `promptForDeletion` resolves as soon as the modal opens, so
the answer does still have to be observed, but the **vault is the authority**: a `vault.on('delete')`
for that exact path means yes. Cancellation is inferred from the modal disappearing without a
deletion (with a 200 ms grace, because the modal closes before the trash completes), and both
`document` and `activeDocument` are watched. Every path now settles — 60 s with a prompt, 2 s
without — because a pending promise here strands the caller, which is the whole bug.

**Why it hid for so long** — three silent-failure mechanisms in a row, all of them on this one
path: a throw inside an observer callback, a promise nobody times out, and a floated rejection at
the caller ([C01](#c01)). Any one of the three would have surfaced it.

**Verify** — with *Confirm file deletion* **on**: delete an attachment via the context menu (file
and link both go), cancel the prompt (neither goes), and delete a note with a `${notename}` folder
(the folder-cleanup prompt appears at all). The first is verified; see the outcome line.

---

## C30 — Delete menu offered in reading view

```yaml
id: C30
status: done          # todo | in-progress | done | wontfix | blocked
outcome: context_menu_cb now returns unless getMode() is 'source', so reading view keeps Obsidian's own image menu — 2c0a3e9
severity: low         # not from the scan: the user's call while testing C27/C29
verdict: fix
risk: low
size: S
sites: 1
```

**The user's decision**, made while testing the fixes above: *Delete image file* should not be
offered in reading view.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:879` | — | `context_menu_cb` — the view-mode gate |

**Why it is more than cosmetic** — the handler calls `evt.preventDefault()` before building its own
`Menu`, so in reading view it did not *add* an item, it **replaced** Obsidian's image context menu
(*Copy image*, *Open in default app*, …) with a single item that then edits a note the reader is not
editing. Returning early leaves the native menu untouched.

`MarkdownView.getMode()` reports `'source'` for both source mode and live preview, so
`!== 'source'` excludes reading view and nothing else.

**Knock-on for [C27](#c27)** — the `posAtDOM` fallback added there was aimed at reading view, which
can no longer reach this code at all. It is still reachable from a hover popover or a Dataview block
while the underlying note is in source mode, so it stays, but it remains **unexercised**. Note a
known edge if anyone does chase it: in a hover popover the *active* view is the underlying note, so
the cache fallback would look for the link in the wrong file. It declines rather than guessing when
the reference is not unique.

---

## C31 — 'Delete link and file' looked for the link at the caret

```yaml
id: C31
status: done          # todo | in-progress | done | wontfix | blocked
outcome: both callers now fall back to the metadata cache for the link position; verified — file deleted and link removed — 23c6f41
severity: medium      # not from the scan: found by manual test
verdict: fix
risk: medium
size: S
sites: 1
```

**Not a scanner finding.** Reported as "the button to delete an image does not work anymore" while
testing [C09](#c09). The console said:

```
No matching link found at the click position: no link was found at the line number 3 containing:
```

— an **empty** line 3.

**Sites**

| line | scanned | code |
| --- | --- | --- |
| `src/main.ts:566` | — | `pos = codemirror.state.selection.main.head;` |

**Cause** — the stack had no `delete_img_cb` in it, so this was the *other* entry point: **Delete
link and file**, which `file_menu_cb` adds to Obsidian's own file menu. That caller passes no DOM
node, so the only clue `delete_file_cb` had was the caret — and right-clicking does not move the
caret. It searched whatever line the user had last typed on, found no link there, and fell through
to deleting the file while leaving the link in the note.

Not a regression from the C01/C09 work; the caret has always been the only clue on that path. What
made it visible now is [C30](#c30): with the plugin's own entry gone from reading view, Obsidian's
menu — carrying this item — is what a right-click on an embed offers there.

**Fix** — the position is no longer a single guess. `delete_file_cb` collects **candidate offsets**,
best first, and tries each: `posAtDOM` for the embed menu (when the node is in the editor content),
the caret for the file menu, and then `offsetOfSoleReference` from the metadata cache backing up
both. The cache is authoritative about where the link is; the DOM and the caret are only hints.

**Verified in a real vault** — the note is left empty and the attachment is gone, on the same click
that failed before.

**Not touched, but seen in passing** — the cross-check inside the loop still calls
`vault.getFileByPath(file_path)` on the raw link text, which is [C15](#c15)'s remaining site and has
the same linkpath confusion [C27](#c27) fixed. With a relative link such as
`![[../Hello (attachments)/x.png]]` it simply returns null and the check is skipped. Benign, and
still C15's to settle.

---

## Not a warning

- **Pass:** the scan reproduced the released `main.js` **byte-for-byte** from source. Worth keeping
  true — it is the strongest signal on the page, and C19/C26 both touch the build.
- **"Malware scan not available."** Reported separately, not counted as a warning; nothing to do.
- **Not a bug, but confusing** (noticed while verifying [C09](#c09), and deliberately left alone).
  One modal answers two questions — move/copy *and* embed/link — so `main.ts:1148` opens it when
  *either* setting is still `ASK_USER`. Fixing the move/copy row therefore does not stop the prompt
  while *Embed imported documents* is on "Ask each time", which is its default; and the modal's
  "remember the decision" writes **both** fields, so it does stop it. Nothing on either settings row
  says so. If it is ever worth refining: ask only the unanswered question, or add a sentence to both
  descriptions. Not filed as a concern — the behaviour is intended.

