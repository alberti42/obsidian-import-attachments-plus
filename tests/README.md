# Tests

One vocabulary, two runners. A test is written with either `it` or `itInVault`,
depending on one question: **does it need a live vault?**

```
tests/shared/spec.ts        suite / it / assert… — the vocabulary and the registry
tests/shared/specs/         pure specs: run headlessly AND inside Obsidian
tests/unit/specs.test.ts    replays the pure specs into node --test
tests/inApp/harness.ts      itInVault + the vault context; runs both registries
tests/inApp/suites/         vault-only tests
tests/vault/                sandbox vault to run the in-app suite in
```

| | `it` | `itInVault` |
| --- | --- | --- |
| Needs a vault | no | yes |
| Runs under `npm test` | **yes** | no |
| Runs inside Obsidian | **yes** | yes |
| Good for | folder resolution, path handling, settings shapes | monkey patches, the file explorer, metadata-cache timing, modals |

A pure spec runs in **both** places, and that is deliberate rather than wasteful. The
`obsidian` npm package ships **type declarations only** — there is no runtime — so
headlessly those specs execute against `tests/shims/obsidian.ts`, a hand-written stand-in
for `normalizePath` and friends. Inside Obsidian the very same file executes against the
real thing. **A spec that passes under `npm test` and fails in the app means the shim has
drifted from Obsidian's behaviour** — which is the one failure mode hand-written fakes
otherwise hide completely.

Anything that cannot be tested honestly outside Obsidian should not be: the bugs this
plugin actually had were a monkey patch on a method that no longer exists and a race
between two notes being re-indexed. A stub would have reproduced both *incorrectly* and
the tests would have passed.

## Headless suite — `npm test`

```bash
npm test        # bundles tests/unit/*.test.ts, then runs node --test
```

esbuild bundles `tests/unit/specs.test.ts` (resolving the `baseUrl: src` bare imports,
which `node --test` alone cannot do) into `dist-tests/`, aliasing `obsidian` to the shim.
No test framework is installed — Node's built-in runner is enough, and the plugin stays
dependency-free.

**To add a pure spec:** write `tests/shared/specs/<name>.spec.ts` using `suite` and `it`
from `../spec`, then add one import line to `tests/shared/specs/index.ts`. That single
list is what both runners read, so there is nowhere else to register it.

Assertions come from `../spec` (`assert`, `assertEqual`, `assertDeepEqual`,
`assertThrows`) rather than `node:assert`, because the same file has to run inside
Obsidian where `node:assert` does not exist.

Keep the shim small. If a spec needs much more of Obsidian than the shim already offers,
that is the signal it should be an `itInVault` test instead.

## In-app suite — `npm run dev:test`

```bash
npm run dev:test    # watch build with the suite compiled in
```

Then point a vault's `.obsidian/plugins/import-attachments-plus` at this repository's
`dist/`, open the vault, and run **Run plugin tests** from the command palette. Results
appear in a modal; full stack traces go to the developer console.

`tests/vault/` is a sandbox vault for exactly this. Every test creates its own folder
under `_plugin-tests/` and deletes it afterwards, so a run leaves the vault as it found
it — you can run the suite repeatedly without resetting anything.

The command **only exists in this build**. `esbuild.config.mjs` substitutes
`process.env.INCLUDE_TESTS` at build time, and the production bundle is verifiably free
of the suite:

```bash
npm run build && grep -c run-plugin-tests dist/main.js   # 0
```

### Writing one

```ts
import { suite, itInVault, assert, assertEqual } from '../harness';

suite('my area', () => {
  itInVault('does the thing', async (t) => {
    const image = await t.attachment('Note (attachments)/pic.png');
    await t.note('Note.md', `![[${image.name}]]\n`);   // already waits for the cache

    assertEqual(/* … */, /* … */, 'message shown on failure');
  });
});
```

Then import the file from `tests/inApp/index.ts` — importing is what registers it.

`itInVault` rather than `it`: the name is the reminder that this test can only run in
one of the two places. If you find yourself reaching for it when the test does not
actually touch the vault, use `it` in `tests/shared/specs/` instead and get the headless
run for free.

The context `t` gives you:

- `t.note(path, content)` / `t.attachment(path)` — create fixtures inside this test's
  scratch folder, already waited for
- `t.rewrite(file, content)` — change a note and wait for the cache
- `t.untilResolved()` — resolves once the metadata cache has drained its queue. **You
  rarely need to call this yourself**: `t.note()` and `t.rewrite()` already wait, and
  they subscribe *before* the change so they cannot miss the event. Calling it on its
  own when the cache is already idle costs the full 2 s fallback, because `resolved`
  only fires when there was work queued — four redundant calls were adding 8 s to a
  four-test run
- `t.until(predicate, description)` — poll for a condition with a timeout. **This** is
  what you want when waiting for the plugin's own deferred work, such as the automatic
  stray repair, which lands after the cache settles rather than with it
- `t.scratch` — this test's folder; prefix any absolute vault path with it

## What is worth testing next

Roughly in order of what a bug would cost:

1. `compileAttachmentFolderMatcher` — gates every destructive action. Covered, extend it.
2. Settings migration from the 1.3.0 shape — silent corruption of a user's config.
3. `createAttachmentName` — `${uuid}`, `${date}`, `${md5}`, and the collision loop in
   `findNewFilename`. Needs a vault, so in-app.
4. The import pipeline end to end: drop a file, check where it lands and what link text
   is inserted, for both wikilink and markdown-link settings.
5. Folder hiding: create an attachment folder at runtime and assert the file explorer
   item carries `import-plugin-hidden`. This is the class of bug that motivated the
   in-app suite in the first place.
