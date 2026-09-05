# Brief D: the moving top bar and the footer

Read `00-CONTEXT.md` first. Claims: C1.03.2 to C1.03.6.

The top bar's colour defect is already fixed. What remains is its CONTENT and a footer.

## Part 1 — the top bar becomes a marquee

Today `src/app/App.tsx` around line 483 renders a header holding the app name, a
`SessionIndicator`, and a save-state line.

The owner wants: the app name FIXED on the left, and the instruction for the current view MOVING.

**Reuse `src/ui/components/Marquee.tsx`.** Do not write a new ticker. It already handles the pause
latch, the aria-hidden duplicate track and the reduced-motion rule that shows the first item alone.
Note its `MarqueeItem` requires `{ icon: LimelightIconName, text: string }`, so each instruction
needs an icon as well as a string.

`Marquee` renders nothing on the clinical skin by design. On that skin the top bar must fall back
to a STATIC instruction line, not to nothing.

One new copy key per view, holding a one-sentence instruction. Add them to `src/ui/nav/views.ts`
as a `Record<ViewId, CopyKey>` so a new view without an instruction is a compile error. Keep each
inside R3's twelve words. Upper case is applied in CSS as a skin register: do NOT bake capitals
into the key.

`SessionIndicator` is displaced by this. It is a shipped feature described in-file as visible from
every view. Move it into the marquee as its own item rather than dropping it, and say in your
report where it went.

## Part 2 — the footer

Create `src/ui/components/SiteFooter.tsx`, rendered once at the foot of the app shell.

It carries, in this order:

1. The author's name.
2. A link to the repository.
3. The version and the build commit.
4. The date of the last update.
5. One line: everything stays on this device.
6. The disclaimer in plain words, so it is reachable after the intro has gone.
7. The licence.

`shell.status.loaded` and `shell.status.loading` MOVE here from the top bar.

**No URL may live in a copy string** — `copy.test.ts` asserts it. The repository URL, the version
and the commit are build constants. `vite.config.ts` has no `define` block today, so add one:

```ts
define: {
  __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  __BUILD_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'),
  __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
}
```

Declare the three globals in an ambient `.d.ts`. The repository URL is a plain constant in the
component: `https://github.com/VKotzamanis/FixThisInjustice`.

The footer is quiet: small type, `--text-3`, a hairline top rule, and it must not compete with
the content above it.

## Verification

Everything in `00-CONTEXT.md`, plus: the footer renders on every view, and the top bar degrades to
a static line on the clinical skin.
