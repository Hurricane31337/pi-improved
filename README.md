# pi-improved

Everything this fork changes about plain [pi](https://github.com/earendil-works/pi-mono), as a
single pi extension.

The point is that **there is no fork**. Plain pi stays untouched, and every behavioural change
lives here as extension code. Upgrading pi is a version bump, not a merge.

## What it changes

| Change | Why | How |
|---|---|---|
| `read` / `edit` / `write` preserve a file's encoding | Plain pi reads and writes everything as UTF-8. On a Windows codebase containing Windows-1252 sources, one edit rewrites every non-ASCII byte as `U+FFFD` — lossy and irreversible. | Encoding-aware `operations` handed to pi's own tool factories |
| `read` returns at most 200 lines and requires `offset` | Plain pi allows 2000 lines and an optional offset, so a model can pull a whole file into context and lose track of position. | Tighter schema + `limit` clamped before delegating |
| Scaleway Generative APIs available as a provider | Not supported upstream. | `pi.registerProvider` |
| `--list-providers` prints provider ids as JSON | The IDE extensions shell out to the bundled CLI to populate their provider picker and need a machine-readable list from the binary they actually run. | `pi.registerFlag` + `session_start` |

## Design rule

**Never reimplement a pi behaviour we only want to adjust.**

The encoding work is the clearest example. In the old monorepo it was a change across seven core
files that altered `EditOperations.writeFile`'s signature, which then conflicted on every upstream
merge. Here it is a set of `operations` passed to pi's exported factories:

```ts
const editOperations: EditOperations = {
  readFile:  async (p) => transcodeToUtf8(await fsReadFile(p)),
  writeFile: async (p, content) => fsWriteFile(p, encodeBuffer(content, await targetEncoding(p))),
  access:    (p) => fsAccess(p, constants.R_OK | constants.W_OK),
};
```

Reads hand the tool clean UTF-8; writes convert back to the file's original encoding. The tool
keeps its UTF-8 assumption and is not modified at all — so its logic, result shapes, renderers and
future upstream fixes all still apply.

## What is deliberately *not* here

Some behaviour the IDE extensions need cannot be expressed through the extension API, because pi
exposes no hook for it. Those live as patches in the consuming repo
(`pi-IDE-Extensions/patches/`), each one documented with why it cannot be an extension:

- **Settings persistence for model / thinking level chosen over RPC.** `setModel(model, { persist })`
  writes `settings.json`, but extensions get no settings API, so the RPC handler cannot be fixed
  from here.
- **Flat config-directory layout** (`~/.<app>/models.json` rather than `~/.<app>/agent/models.json`).
- **Product branding and log paths** per extension variant.

Keeping that list short — and visible — is the whole point of the split.

## Gotchas discovered while building this

- **`pi.getFlag()` returns the default inside a factory.** pi applies CLI flag values
  (`applyExtensionFlagValues`) *after* every extension factory has run, so a flag must be read from
  an event hook. `--list-providers` uses `session_start`. The upstream docs example checks the flag
  in the factory body, which does not work.
- **Relative imports must use `.ts`**, not `.js` — extensions are loaded from source by jiti.
- **Overriding a built-in tool does not inherit `promptSnippet` / `promptGuidelines`**, though
  renderers *are* inherited per slot when omitted.

## Layout

```
src/
  index.ts                     extension entry: wires everything together
  encoding.ts                  encoding detection / transcoding
  tools/file-tools.ts          read, edit, write overrides + read pagination
  providers/scaleway.ts        Scaleway provider registration
  providers/scaleway.models.json  static catalog snapshot (pricing, thinking maps)
  list-providers.ts            --list-providers flag
test/
  encoding.test.ts             unit tests for detection and round-tripping
  file-tools.test.ts           integration tests against pi's real tools
```

## Development

```bash
npm install
npm test          # unit + integration tests
npm run check     # biome + tsc
```

The integration tests need a pi checkout, resolved from `vendor/pi` or a sibling `../pi`. They skip
themselves when neither is present, so the unit tests still run anywhere.

Try it against a pi checkout:

```bash
cd ../pi
npx tsx packages/coding-agent/src/cli.ts -e ../pi-improved/src/index.ts --list-providers
```
