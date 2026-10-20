# auth

JWT-based authentication for the App Router. The token lives in an httpOnly cookie,
is signed with `JWT_SECRET` using `jose` (HS256, 7 day expiry), and is verified on
every protected request against the database.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Signing key. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |

Both are validated at startup by `lib/env.ts` — the app throws if either is missing.
Set `JWT_SECRET` in every environment (`.env.local`, production, CI).

## Files

| File | Responsibility |
| --- | --- |
| `lib/jwt.ts` | `COOKIE_NAME`, `signToken`, `verifyToken`. No DB imports, so `proxy.ts` can use it |
| `lib/auth.ts` | `hashPassword`, `verifyPassword`, `createSession`, `deleteSession`, `getSessionUser`, `toSessionUser` |
| `lib/withAuth.ts` | Route guard: requires a valid session, optional role / self checks |
| `proxy.ts` | Optimistic page-level redirects (no DB access) |

## Endpoints

| Method + path | Body | Notes |
| --- | --- | --- |
| `POST /api/auth/register` | `{ name, email, password, role?, phone?, address? }` | `role` limited to `user` / `owner`; admin is blocked. Auto-logs-in |
| `POST /api/auth/login` | `{ email, password }` | Sets the `token` cookie. `401` on bad credentials |
| `GET /api/auth/me` | — | Current user, requires auth. Returns `{ id, name, email, role, phone?, address?, photo? }` |
| `POST /api/auth/logout` | — | Clears the cookie |

The session response never includes the password hash.

## Flow

```
register/login ──> hash or verify password ──> signToken(user id + role)
              ──> Set-Cookie: token=<jwt>; HttpOnly; SameSite=Lax; Path=/ (Secure in prod)

request ──> getSessionUser(req)
          ──> verifyToken (signature + expiry) ──> User.findById ──> SessionUser
```

`getSessionUser` reads the token from the cookie, falling back to an
`Authorization: Bearer <token>` header for API clients. It hits the database so a
deleted or changed user is rejected immediately (not just when the JWT expires).

## Protecting routes with `withAuth`

```typescript
import { withAuth } from "@/lib/withAuth";
import { userCRUD } from "@/services/user.service";

// any logged-in user
export const GET = withAuth(userCRUD.list);

// specific roles
export const POST = withAuth(userCRUD.create, { roles: ["admin"] });

// specific roles OR the user themselves (matches the :id route param)
export const PUT = withAuth(updateUser, { roles: ["admin"], self: true });
```

Behavior:

- no session → `401 Unauthorized`
- session but wrong role (and not self) → `403 Forbidden`
- allowed → handler runs with a third argument `{ user }` (the `SessionUser`)

The handler receives `(req, ctx, { user })`, so you can read the caller inside:

```typescript
export const GET = withAuth(async (_req, _ctx, { user }) => success(user));
```

Current rules on the user routes:

| Route | Access |
| --- | --- |
| `GET /api/users` | admin (everyone) · owner (only the users they created) |
| `POST /api/users` | admin (role `user`/`owner`) · owner (forced to role `user`); stamps `createdBy`. Public signup lives at `/api/auth/register` |
| `GET /api/users/:id` | admin · the owner who created it · the user themselves |
| `PUT /api/users/:id` | admin · the owner who created it · the user themselves (role changes: admin only) |
| `DELETE /api/users/:id` | admin · the owner who created it · the user themselves |

## Page protection (`proxy.ts`)

`proxy.ts` (Next 16's renamed middleware) runs before rendering and only reads the
JWT — no database call:

- `/dashboard/**` without a valid token → redirect to `/login?next=<path>`
- `/login` or `/register` with a valid token → redirect to `/dashboard`

It is an optimistic UX filter, not the security boundary. Every route handler still
re-checks auth via `withAuth`.

Pages that ship with it:

| Route | File | Notes |
| --- | --- | --- |
| `/login` | `app/(site)/login/page.tsx` | Client form posts to `/api/auth/login`, then follows `?next=` |
| `/register` | `app/(site)/register/page.tsx` | Always registers as an `owner` (no role picker); collects phone + address |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Server component: `getSessionUser()` + `redirect("/login")` |

Cache Components is enabled, so anything that reads the request (session, `searchParams`)
sits behind `<Suspense>` — otherwise the build fails. That's why the dashboard reads the
user inside a `DashboardContent` child and login awaits `searchParams` in
`LoginFormWithRedirect`, giving `/dashboard` and `/login` a static shell (marked `◐` in
the build output) with the dynamic part streamed in.

## Security notes

- Token is httpOnly (JS can't read it), `Secure` in production, `SameSite=Lax`.
- Ownership scoping: `POST /api/users` stamps `createdBy` with the caller's id. An owner
  can only list, read, update, or delete users where `createdBy` is their own id
  (otherwise `403`), and any account they create is forced to role `user`. Admins are
  unrestricted and see every user.
- Roles can't be escalated from the client: `role` is only accepted on `PUT /api/users/:id`
  when the caller is an admin (otherwise `403`), `admin` is not an allowed registration
  role, and `POST /api/users` can't set `admin` either. Demoting the **last** remaining
  admin is rejected with `409` so you can't lock yourself out.
- To change a role: `PUT /api/users/:id` as an admin with `{ "role": "admin" | "owner" | "user" }`.
  The role change is applied alongside the other fields; a non-admin sending `role` gets a
  `403` instead of a silent no-op.
- Passwords are hashed with bcrypt (10 rounds) before storage.
- 7-day expiry is baked into the token; there is no refresh flow yet.
- Not implemented yet: login rate limiting, refresh tokens, password reset,
  "logout everywhere" (would need a token version / DB session table).
