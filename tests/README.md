# Tests

Two suites, split by one question: **does this need a real Obsidian to be meaningful?**

| | `tests/unit/` | `tests/inApp/` |
| --- | --- | --- |
| Run with | `npm test` | `npm run dev:test`, then a command inside Obsidian |
| Needs Obsidian | no | yes |
| Can gate a PR | yes | no — it is a manual regression suite |
| Good for | pure logic: path handling, folder resolution, settings shapes | monkey patches, the file explorer, metadata-cache timing, modals |

The split matters. The `obsidian` npm package ships **type declarations only** — there is
no runtime — so anything touching `TFile`, `normalizePath` or the metadata cache cannot
execute under Node without being faked. Faking it is fine for a pure function and
actively misleading for everything else: the bugs this plugin actually had were a patched
method that no longer exists and a race between two notes being re-indexed. A stub would
have reproduced both of those *incorrectly* and the tests would have passed.

## Headless suite — `npm test`

```bash
npm test        # bundles tests/unit/*.test.ts, then runs node --test
```

esbuild bundles each test (resolving the `baseUrl: src` bare imports, which `node --test`
alone cannot do) into `dist-tests/`, aliasing `obsidian` to `tests/shims/obsidian.ts`.
No test framework is installed — Node's built-in runner and `node:assert/strict` are
enough, and the plugin stays dependency-free.

To add a test, drop a `tests/unit/<name>.test.ts` in place; it is picked up by the glob.

Keep the shim small. If a test needs much more of Obsidian than the shim already offers,
that is the signal it belongs in the in-app suite instead.

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
import { suite, it, assert, assertEqual } from '../harness';

suite('my area', () => {
  it('does the thing', async (t) => {
    const image = await t.attachment('Note (attachments)/pic.png');
    await t.note('Note.md', `![[${image.name}]]\n`);
    await t.untilResolved();

    assertEqual(/* … */, /* … */, 'message shown on failure');
  });
});
```

Then import the file from `tests/inApp/index.ts` — importing is what registers it.

The context `t` gives you:

- `t.note(path, content)` / `t.attachment(path)` — create fixtures inside this test's
  scratch folder, already waited for
- `t.rewrite(file, content)` — change a note and wait for the cache
- `t.untilResolved()` — **the important one.** Resolves once the metadata cache has
  drained its queue. Most timing bugs in this plugin come from acting before both sides
  of a move have been re-indexed, so assert after this, not after a fixed delay
- `t.until(predicate, description)` — poll for a condition with a timeout, for things the
  cache does not announce
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
