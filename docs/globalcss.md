# globalcss

Design tokens for the whole app live in `src/app/globals.css`. Components never use
raw Tailwind palette classes (`bg-gray-900`, `text-red-600`, …) — they use the
semantic tokens below, so a color changes in exactly one place.

## How it works

```
:root / .dark   ──>   CSS variables (--primary: #059669)
@theme inline   ──>   Tailwind token (--color-primary: var(--primary))
utilities       ──>   bg-primary / text-primary / border-primary / ring-primary
```

Because `@theme inline` points at the runtime variable, flipping `.dark` re-paints
everything with no component edits.

## Token reference

Every `--color-*` below generates `bg-*`, `text-*`, `border-*`, `ring-*`, and
`fill-*` utilities (e.g. `--color-muted` → `bg-muted`, `text-muted`, `border-muted`).

### Surfaces & text

| Token | Utilities | Light | Dark | Use for |
| --- | --- | --- | --- | --- |
| `--background` | `bg-background`, `text-background` | `#ffffff` | `#0b1220` | Page background |
| `--foreground` | `text-foreground` | `#0f172a` | `#e2e8f0` | Default body text |
| `--card` | `bg-card` | `#ffffff` | `#0f172a` | Panels, dialogs, inputs |
| `--card-foreground` | `text-card-foreground` | `#0f172a` | `#e2e8f0` | Text on a card |
| `--muted` | `bg-muted` | `#f1f5f9` | `#1e293b` | Subtle fills, skeletons |
| `--muted-foreground` | `text-muted-foreground` | `#64748b` | `#94a3b8` | Hints, captions, placeholders |

### Brand & accents

| Token | Utilities | Light | Dark | Use for |
| --- | --- | --- | --- | --- |
| `--primary` | `bg-primary`, `text-primary`, `border-primary` | `#059669` | `#10b981` | Main buttons, links, focus |
| `--primary-foreground` | `text-primary-foreground` | `#ffffff` | `#052e16` | Text on primary |
| `--secondary` | `bg-secondary` | `#f1f5f9` | `#1e293b` | Secondary buttons |
| `--secondary-foreground` | `text-secondary-foreground` | `#0f172a` | `#e2e8f0` | Text on secondary |
| `--accent` | `bg-accent` | `#e2e8f0` | `#334155` | Hover fill (secondary/outline/ghost) |
| `--accent-foreground` | `text-accent-foreground` | `#0f172a` | `#f1f5f9` | Text on accent |

### Status colors

Each status has four tokens: the base color, its `foreground`, a `-soft` tinted
surface, and a `-border`. `Alert` combines `bg-<status>-soft`, `border-<status>-border`,
and `text-<status>`.

| Status | Base | Foreground | Soft | Border (light / dark) |
| --- | --- | --- | --- | --- |
| `destructive` / `error` | `#dc2626` / `#ef4444` | `#ffffff` / `#ffffff` | `#fef2f2` / `#2a0f0f` | `#fecaca` / `#7f1d1d` |
| `success` | `#16a34a` / `#22c55e` | `#ffffff` / `#052e16` | `#f0fdf4` / `#052e16` | `#bbf7d0` / `#14532d` |
| `warning` | `#d97706` / `#f59e0b` | `#ffffff` / `#451a03` | `#fffbeb` / `#2a1e05` | `#fde68a` / `#78350f` |
| `info` | `#0284c7` / `#38bdf8` | `#ffffff` / `#082f49` | `#f0f9ff` / `#082f49` | `#bae6fd` / `#0c4a6e` |

Base/foreground/soft/border read as `light-value / dark-value`.

### Structure

| Token | Utilities | Light | Dark | Use for |
| --- | --- | --- | --- | --- |
| `--border` | `border-border` | `#e2e8f0` | `#1e293b` | Dividers, card outlines |
| `--input` | `border-input` | `#cbd5e1` | `#334155` | Input/button borders |
| `--ring` | `ring-ring` | `#059669` | `#34d399` | Focus rings |
| `--overlay` | `bg-overlay` | `rgba(0,0,0,.5)` | `rgba(0,0,0,.7)` | Dialog backdrop |

### Fonts

| Token | Utilities | Value |
| --- | --- | --- |
| `--font-sans` | `font-sans` | `var(--font-geist-sans)` |
| `--font-mono` | `font-mono` | `var(--font-geist-mono)` |

## Common patterns

```tsx
<div className="bg-card text-card-foreground border border-border rounded-lg p-6">
<a className="text-primary underline">Link</a>
<button className="bg-primary text-primary-foreground hover:bg-primary/90">Save</button>
<input className="border border-input focus:border-ring focus:ring-2 focus:ring-ring/30" />
<p className="text-sm text-muted-foreground">Helper text</p>
```

Opacity modifiers (`/90`, `/30`) work on any token because Tailwind v4 blends the
variable with `color-mix`.

## Dark mode

Tokens are defined twice: `:root` (light) and `.dark` (dark). To toggle, put the
class on the root element:

```tsx
<html className="dark">
```

The `dark:` variant is wired for class-based mode in `globals.css`:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

so `dark:bg-black` works if you ever need a one-off, but prefer tokens.

## Changing the brand color

Edit `--primary` (and `--ring`) in **both** `:root` and `.dark`, plus
`--primary-foreground` for legibility. Every button, link, and focus ring follows.

## Adding a new token

1. Add the variable to `:root` **and** `.dark`:

   ```css
   :root { --brand: #7c3aed; }
   .dark { --brand: #a78bfa; }
   ```

2. Map it in `@theme inline`:

   ```css
   @theme inline { --color-brand: var(--brand); }
   ```

3. Use it: `bg-brand`, `text-brand`, `border-brand`, `ring-brand`.

## Which component uses what

| Component | Tokens |
| --- | --- |
| `Button` | `primary` / `secondary` / `accent` / `destructive` / `ring` / `input` |
| `Input` | `background` `foreground` `muted` `muted-foreground` `input` `ring` `destructive` |
| `Alert` | `info` · `success` · `warning` · `destructive` (`-soft`, `-border`, base) |
| `Form` / `FormField` | `foreground` `destructive` `muted-foreground` |
| `Dialog` | `overlay` `card` `card-foreground` `muted-foreground` `border` |
| `Skeleton` | `muted` |

> Rule of thumb: no new component should introduce a raw color class. If a hue is
> missing, add a token here first.
