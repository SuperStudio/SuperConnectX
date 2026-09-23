# base-desktop-app — A Vue 3 + Electron desktop template

A **minimal, fully-runnable** Electron + Vue 3 + TypeScript template that
demonstrates the three-layer architecture defined in
[`docs/template-guide.md`](../../docs/template-guide.md):

```
foundation/   ←  framework-grade primitives (no business knowledge)
features/     ←  business logic, one folder per product capability
components/   ←  visual building blocks, consumed by features
```

This project is **standalone**: it has its own `package.json`, its own
`electron.vite.config.ts`, and its own dependency tree. Clone it, run
`npm install`, and `npm run dev` to see the demo counter app launch.

---

## What the demo shows

| Layer       | Demo piece                                        | What it illustrates                                                                 |
|-------------|---------------------------------------------------|-------------------------------------------------------------------------------------|
| `foundation/theme` | `useTheme()`                             | Runtime theme switching with localStorage persistence                              |
| `foundation/settings` | `useSerializedSettingsSave` + `SettingsRegistry` | Safe, ordered writes that never get overwritten by stale snapshots                |
| `foundation/shell` | `AppShell`, `WindowTitleBar`, `StatusBar`, `SidebarLayout`, `NotificationCenter` | The visual chrome that wraps any app                                            |
| `foundation/workbench` | `WorkbenchTabBar`, `useWorkbenchTabs`, `useSplitWorkspace`, `useWorkbenchTabDrag` | Domain-neutral tab strip and split-layout engine                                 |
| `shared/ipc` | `counter.ts`                                       | One source of truth for channel names + payload types (renderer / preload / main)  |
| `features/counter` | `useCounter` + `CounterPanel`             | The full IPC choreography with `JSON.parse(JSON.stringify(...))` Proxy-safe writes |
| `components` | `SettingsTab`, `AboutPanel`                       | Pure UI panels that compose `features/` controllers                                |
| `App.vue`    | The composition layer                              | How the foundation pieces are wired together                                       |

---

## Quick start

```bash
cd examples/base-desktop-app
npm install
npm run dev          # starts the Electron app with hot-reload
```

Other scripts:

```bash
npm run build           # bundles main, preload, renderer into ./out
npm run typecheck       # typechecks both node and web sides
npm run typecheck:node  # main / preload / shared only
npm run typecheck:web   # renderer only
```

> **Tip:** the first `npm install` pulls Electron (~250 MB). If you already have
> the parent project installed, you can speed things up by pointing the install
> at a local cache via `npm config set cache ../node_modules/.npm-cache`.

---

## Project layout

```
examples/base-desktop-app/
├── electron.vite.config.ts          # 3-segment build (main / preload / renderer)
├── tsconfig.node.json               # main / preload / shared (Node + DOM)
├── tsconfig.web.json                # renderer (DOM + Vue)
├── package.json                     # standalone deps + scripts
└── src/
    ├── main/index.ts                # main-process entry + IPC handlers
    ├── preload/index.ts             # contextBridge surface (the only renderer-facing API)
    ├── preload/index.d.ts           # window.api typing
    ├── shared/
    │   ├── ipc/counter.ts           # channel constants + payload types (single source of truth)
    │   └── workbench/types.ts       # domain-neutral tab/split types
    └── renderer/
        ├── index.html
        └── src/
            ├── main.ts              # Vue mount
            ├── App.vue              # composition layer — wires foundation + features + components
            ├── assets/
            │   ├── main.css         # global reset
            │   └── themes.css       # data-theme="dark"/"light" CSS variables
            ├── foundation/
            │   ├── theme/useTheme.ts
            │   ├── settings/
            │   │   ├── SettingsLayout.vue
            │   │   ├── SettingsRegistry.ts
            │   │   ├── types.ts
            │   │   └── useSerializedSettingsSave.ts
            │   ├── shell/
            │   │   ├── AppShell.vue
            │   │   ├── NotificationCenter.vue
            │   │   ├── SidebarLayout.vue
            │   │   ├── SidebarResizeHandle.vue
            │   │   ├── StatusBar.vue
            │   │   ├── WindowTitleBar.vue
            │   │   ├── useNotificationCenter.ts
            │   │   └── useSidebarResize.ts
            │   └── workbench/
            │       ├── SplitWorkspace.vue
            │       ├── WorkbenchTabBar.vue
            │       ├── useSplitWorkspace.ts
            │       ├── useWorkbenchTabDrag.ts
            │       └── useWorkbenchTabs.ts
            ├── components/
            │   ├── AboutPanel.vue
            │   └── SettingsTab.vue
            └── features/
                └── counter/
                    ├── CounterPanel.vue
                    └── useCounter.ts
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
