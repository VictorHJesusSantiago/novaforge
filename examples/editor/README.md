# NovaForge Editor

The visual editor (`@novaforge/editor`), running against a small real scene — a floor, three
falling crates, a ball, and a text label. Not a mock-up: every panel here is wired to a live
`@novaforge/runtime` `Game`.

```bash
npm install      # from the repository root
npm run dev --workspace @novaforge/example-editor
```

## What you can do

- **Select** an entity by clicking it in the scene tree or in the viewport.
- **Move** it by dragging in the viewport once selected.
- **Edit** any field in the inspector — every control there is generated from the component's
  schema, not hand-written per component.
- **Add or remove components** from the inspector's component list.
- **Undo/redo** every edit, including drags (one drag is one undo step) and deletions (which
  restore the exact prior values, not factory defaults).
- **Play** to let physics run; **Stop** to discard the run and return to exactly the scene you
  had before pressing Play; **Step** to advance one fixed physics step at a time while paused.
- **Save** downloads the scene as JSON; **Load** reopens one.
- **Drop an image** onto the asset panel at the bottom to load a texture — or to hot-reload one
  under an id already in use by a sprite, with no code change and no reload.

## What this is not

A pixel-perfect Godot clone. Entity picking is nearest-centre-within-a-radius, not per-shape hit
testing; there is no entity hierarchy (every entity is a sibling in the scene tree); a physics
shape's vertices are shown, not edited, in the inspector. Each of these is a stated, deliberate
scope boundary — see the doc comments in `@novaforge/editor`'s source for the reasoning behind
each one.
