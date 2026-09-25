# @superx/template-app — A Vue 3 + Electron desktop template

A **minimal, fully-runnable** Electron + Vue 3 + TypeScript template that
demonstrates the three-layer architecture defined in
[`docs/template-guide.md`](../../docs/template-guide.md):

```
foundation/   ←  framework-grade primitives (no business knowledge)  → @superx/foundation
features/     ←  business logic, one folder per product capability
components/   ←  visual building blocks, consumed by features
```

This project is a **workspace package consumer**: it declares
`@superx/foundation` and `@superx/shared` as `workspace:*` dependencies and
imports them by package name — **no copied sources**. Any fix or feature
landed in the foundation packages is picked up by this template (and the
main app) immediately, from a single source of truth.

---

## What the demo shows

| Layer       | Demo piece                                        | What it illustrates                                                                 |
|-------------|---------------------------------------------------|-------------------------------------------------------------------------------------|
| `foundation/theme` | `useTheme()`                             | Runtime theme switching with localStorage persistence                              |
| `foundation/settings` | `useSerializedSettingsSave` + `SettingsRegistry` | Safe, ordered writes that never get overwritten by stale snapshots                |
| `foundation/shell` | `AppShell`, `WindowTitleBar`, `StatusBar`, `SidebarLayout` (+ controlled `useSidebarResize`) | The visual chrome that wraps any app |
| `foundation/workbench` | `WorkbenchTabBar`, `useWorkbenchTabs` | Domain-neutral tab strip with pin/drag-reorder/close actions                       |
| `shared/ipc` | `counter.ts`                                       | One source of truth for channel names + payload types (renderer / preload / main)  |
| `features/counter` | `useCounter` + `CounterPanel`             | The full IPC choreography with `JSON.parse(JSON.stringify(...))` Proxy-safe writes |
| `components` | `SettingsTab`, `AboutPanel`                       | Pure UI panels that compose `features/` controllers                                |
| `App.vue`    | The composition layer                              | How the foundation pieces are wired together                                       |

---

## Quick start

Run from the **repository root** (the workspace owns the dependency tree):

```bash
pnpm install
pnpm --filter @superx/template-app dev     # starts the Electron app with hot-reload
```

Other scripts (per-package):

```bash
pnpm --filter @superx/template-app build           # bundles main, preload, renderer into ./out
pnpm --filter @superx/template-app typecheck       # typechecks both node and web sides
pnpm --filter @superx/template-app check:paths     # static relative-import sanity check
```

---

## How the workspace packages are wired

Three places point the `@superx/*` names at package sources (no build step,
edits to the packages are hot-reloaded here instantly):

1. `package.json` — `"@superx/foundation": "workspace:*"` declares the
   dependency (pnpm links it into `node_modules`).
2. `electron.vite.config.ts` — renderer alias
   `'@superx/shared': resolve(__dirname, '../../packages/shared/src')` etc., so Vite
   compiles the TypeScript sources directly.
3. `tsconfig.web.json` — `paths` entries so `tsc` resolves the same names.

> This mirrors exactly how the main app (`apps/superconnectx`) consumes the
> packages — the template is a faithful miniature of the real thing.

---

## Project layout

```
packages/template-app/
├── electron.vite.config.ts          # 3-segment build (main / preload / renderer)
├── tsconfig.node.json               # main / preload / shared (Node + DOM)
├── tsconfig.web.json                # renderer (DOM + Vue) + @superx/* paths
├── package.json                     # workspace deps + scripts
├── _check_paths.cjs                 # static relative-import sanity check
└── src/
    ├── main/index.ts                # main-process entry + IPC handlers
    ├── preload/index.ts             # contextBridge surface (the only renderer-facing API)
    ├── preload/index.d.ts           # window.api typing
    ├── shared/
    │   └── ipc/counter.ts           # channel constants + payload types (this app's own contracts)
    └── renderer/
        ├── index.html
        └── src/
            ├── main.ts              # Vue mount
            ├── App.vue              # composition layer — wires @superx/foundation + features + components
            ├── assets/
            │   ├── main.css         # global reset
            │   └── themes.css       # data-theme="dark"/"light" CSS variables
            ├── components/
            │   ├── AboutPanel.vue
            │   └── SettingsTab.vue
            └── features/
                └── counter/
                    ├── CounterPanel.vue
                    └── useCounter.ts

# framework-grade primitives now live in workspace packages (single source of truth):
packages/shared/src/workbench/       # cross-process types (tabs, split)
packages/foundation/src/             # theme/ settings/ shell/ workbench/
```

---

## How to add a new feature

Following the five-step recipe in [`docs/template-guide.md`](../../docs/template-guide.md):

### 1. Define the IPC contract (if it needs persistence)

```ts
// src/shared/ipc/notes.ts
export const NOTE_CHANNEL = { LIST: 'note:list', ADD: 'note:add' } as const
export interface Note { id: string; text: string }
```

### 2. Wire main-process handlers

```ts
// src/main/index.ts (extend existing ipcMain.handle block)
ipcMain.handle(NOTE_CHANNEL.LIST, () => notes)
ipcMain.handle(NOTE_CHANNEL.ADD, (_e, payload: Note) => { notes.push(payload); return payload })
```

### 3. Extend the preload surface

```ts
// src/preload/index.ts
notes: {
  list: () => ipcRenderer.invoke(NOTE_CHANNEL.LIST),
  add: (payload: Note) => ipcRenderer.invoke(NOTE_CHANNEL.ADD, JSON.parse(JSON.stringify(payload)))
}
```

### 4. Build the feature controller

```ts
// src/renderer/src/features/notes/useNotes.ts
const value = ref<Note[]>([])
const refresh = async () => { value.value = await window.api.notes.list() }
const add = async (text: string) => {
  const snapshot = JSON.parse(JSON.stringify({ id: crypto.randomUUID(), text }))
  await window.api.notes.add(snapshot)
  await refresh()
}
```

### 5. Build the UI component

```vue
<!-- src/renderer/src/features/notes/NotesPanel.vue -->
<template>
  <ul>
    <li v-for="n in notes.value" :key="n.id">{{ n.text }}</li>
    <input v-model="draft" @keydown.enter="add(draft); draft = ''" />
  </ul>
</template>
<script setup lang="ts">
import { useNotes } from './useNotes'
const { value: notes } = useNotes()
</script>
```

That's it. **No foundation file changes, no App.vue wiring needed** beyond
adding a tab entry. The foundation pieces (`AppShell`, `WorkbenchTabBar`, etc.)
will pick the panel up automatically once you add a tab to the strip.

---

## Proxy-safety contract (must-read)

Vue 3's `ref()` / `reactive()` wrap objects in `Proxy` instances. Electron's IPC
structured-clone algorithm **cannot serialize Proxies** — calling
`ipcRenderer.invoke('x', refValue)` throws `Error: An object could not be cloned`.

The rule in this template is:

> Any object passed to `window.api.*` (i.e. across the contextBridge boundary)
> **must first be wrapped in `JSON.parse(JSON.stringify(obj))`** to strip the
> Proxy wrapper.

See:

- The comment block at the top of `src/preload/index.ts`
- `features/counter/useCounter.ts` (`setValue`) for the canonical example

For pure **no-payload** invokes (`get`, `reset`), no wrapping is needed.

---

## Theme variables

All UI colors are driven by CSS variables defined in
`src/renderer/src/assets/themes.css` under `:root[data-theme='dark']` and
`:root[data-theme='light']`. `useTheme()` flips the `data-theme` attribute on
`<html>` and persists the choice. **Never hard-code colors in components** —
extend the theme variables instead.

---

## License

MIT — same as the parent project.
