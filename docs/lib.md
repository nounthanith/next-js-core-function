# lib/ documentation

Reference for the shared helpers in `lib/`. Written so the project can be picked up again years later.

This file covers three files: `env.ts`, `auth.ts`, `withAuth.ts`.
Related files documented elsewhere: `db.ts` (database connection), `api-response.ts` (see `api-response.md`), `crud.ts` (generic CRUD).

---

## 1. Overview

```
lib/
├── db.ts            # MongoDB connection (cached)
├── env.ts           # reads and validates environment variables
├── auth.ts          # JWT + cookie helpers, getCurrentOwner
├── withAuth.ts      # wrapper that protects API routes
├── api-response.ts  # success / error JSON helpers
└── crud.ts          # generic CRUD service and route factory
```

**Dependency direction (never import the other way):**

```
env.ts  →  auth.ts  →  withAuth.ts
              ↑
            db.ts
```

- `env.ts` imports nothing from the project.
- `auth.ts` imports `env.ts`, `db.ts`, and the Owner model.
- `withAuth.ts` imports `auth.ts` and `api-response.ts`.

**Packages needed**

```bash
npm i jsonwebtoken bcryptjs
npm i -D @types/jsonwebtoken @types/bcryptjs
```

---

## 2. env.ts

### Purpose

One place to read environment variables. If a required variable is missing, the app fails immediately with a clear message, instead of failing later with a vague error such as `secretOrPrivateKey must have a value`.

### Code

```typescript
function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
}

export const env = {
    MONGODB_URI: required("MONGODB_URI"),
    JWT_SECRET: required("JWT_SECRET"),
    NODE_ENV: process.env.NODE_ENV ?? "development",
    isProduction: process.env.NODE_ENV === "production",
};
```

### .env.local

```env
MONGODB_URI=mongodb://localhost:27017/myapp
JWT_SECRET=put-a-long-random-string-here
```

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Rules

- Always use `env.JWT_SECRET`, never `process.env.JWT_SECRET` directly in other files.
- Never commit `.env.local`. Make sure `.env*` is in `.gitignore`.
- To add a new variable: add it to `env.ts` (use `required` if the app cannot run without it), then add it to `.env.local` and to the production server.
- Never import `env.ts` in client components. Variables without the `NEXT_PUBLIC_` prefix only exist on the server.

### Troubleshooting

| Problem | Cause |
| --- | --- |
| `Missing environment variable: X` at build | Variable not set in the build environment (Docker build, CI, hosting dashboard) |
| Variable is `undefined` after editing `.env.local` | Restart `npm run dev`; Next.js reads env files only on start |

---

## 3. auth.ts

### Purpose

All low-level authentication logic: create and verify tokens, set and clear the cookie, and get the logged-in owner.

### How authentication works

1. Owner logs in with email and password.
2. Server checks the password with bcrypt.
3. Server creates a JWT with `signToken` and stores it in an **httpOnly cookie**.
4. The browser sends the cookie automatically on every request.
5. Protected routes call `getCurrentOwner()` (usually through `withAuth`) to read the cookie, verify the token, and load the owner from the database.

httpOnly means JavaScript in the browser cannot read the token, which protects against token theft through XSS.

### Code

```typescript
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import connectDB from "./db";
import { env } from "./env";
import Owner from "@/models/owner.model";
import { OwnerPublic } from "@/types/owner.type";

export const COOKIE_NAME = "token";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

export interface TokenPayload {
    id: string;
    email: string;
}

export function signToken(payload: TokenPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: MAX_AGE });
}

export function verifyToken(token: string): TokenPayload | null {
    try {
        return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    } catch {
        return null; // expired, tampered, or malformed
    }
}

export function setAuthCookie(res: NextResponse, token: string) {
    res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: MAX_AGE,
    });
    return res;
}

export function clearAuthCookie(res: NextResponse) {
    res.cookies.set(COOKIE_NAME, "", {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });
    return res;
}

export async function getCurrentOwner(): Promise<OwnerPublic | null> {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) return null;

    await connectDB();
    return Owner.findById(payload.id).lean<OwnerPublic>();
}
```

### Functions

| Function | Returns | Use |
| --- | --- | --- |
| `signToken(payload)` | JWT string | After a successful login or register |
| `verifyToken(token)` | payload or `null` | Checking a token; never throws |
| `setAuthCookie(res, token)` | the same response | Attach the login cookie |
| `clearAuthCookie(res)` | the same response | Logout |
| `getCurrentOwner()` | owner or `null` | Server components and API routes |

### Login route example

```typescript
// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import Owner from "@/models/owner.model";
import { signToken, setAuthCookie } from "@/lib/auth";
import { error } from "@/lib/api-response";

export async function POST(req: Request) {
    await connectDB();
    const { email, password } = await req.json();

    // password has select: false, so ask for it explicitly
    const owner = await Owner.findOne({ email }).select("+password");
    if (!owner || !(await bcrypt.compare(password, owner.password))) {
        return error("Invalid email or password", 401); // same message for both cases
    }

    const token = signToken({ id: String(owner._id), email: owner.email });
    const res = NextResponse.json({ success: true, data: { name: owner.name } });
    return setAuthCookie(res, token);
}
```

### Logout route example

```typescript
// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";

export async function POST() {
    return clearAuthCookie(NextResponse.json({ success: true, data: null }));
}
```

### Use in a server component

```typescript
import { redirect } from "next/navigation";
import { getCurrentOwner } from "@/lib/auth";

export default async function DashboardPage() {
    const owner = await getCurrentOwner();
    if (!owner) redirect("/login");
    return <h1>Hello {owner.name}</h1>;
}
```

### Security notes

- Return the same error for a wrong email and a wrong password, so attackers cannot find which emails exist.
- `secure: true` in production means the cookie is sent only over HTTPS. Without HTTPS in production, login will appear to work but the cookie will not be stored.
- The token holds only `id` and `email`. Never put the password or sensitive data in a JWT: it is signed, not encrypted.
- Changing `JWT_SECRET` logs out every user immediately. Use this deliberately if a token leak is suspected.
- `jsonwebtoken` works in Node.js routes and server components only. Next.js `middleware.ts` runs on the Edge runtime, where you need the `jose` package instead.
- If cookies are used for auth, `sameSite: "lax"` blocks most CSRF. For a separate frontend on another domain (for example an Expo app), send the token in an `Authorization: Bearer` header instead and add a branch in `getCurrentOwner`.

### Troubleshooting

| Problem | Cause |
| --- | --- |
| `cookies()` returns a Promise error | Next.js 15 and later: `cookies()` is async, so use `await cookies()` |
| Login works but next request is 401 | Cookie not stored: check `secure` on HTTP, `path`, or a cross-domain fetch missing `credentials: "include"` |
| `bcrypt.compare` throws `data and hash arguments required` | Forgot `.select("+password")` |
| User stays logged in after logout | `clearAuthCookie` options (`path`, `sameSite`) must match `setAuthCookie` |

---

## 4. withAuth.ts

### Purpose

A wrapper (higher-order function) that protects an API route. If there is no valid login, it returns `401` and the handler never runs. If there is, the handler receives the owner as a third argument.

### Code

```typescript
import { getCurrentOwner } from "./auth";
import { unauthorized } from "./api-response";
import { OwnerPublic } from "@/types/owner.type";

type AuthedHandler<C> = (
    req: Request,
    ctx: C,
    owner: OwnerPublic
) => Promise<Response> | Response;

export function withAuth<C = unknown>(handler: AuthedHandler<C>) {
    return async (req: Request, ctx: C) => {
        const owner = await getCurrentOwner();
        if (!owner) return unauthorized();
        return handler(req, ctx, owner);
    };
}
```

### Usage

**Simple route**

```typescript
// app/api/me/route.ts
import { withAuth } from "@/lib/withAuth";
import { success } from "@/lib/api-response";

export const GET = withAuth(async (_req, _ctx, owner) => {
    return success(owner);
});
```

**Route with `[id]`**

```typescript
// app/api/owners/[id]/route.ts
import { withAuth } from "@/lib/withAuth";
import { success, forbidden } from "@/lib/api-response";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAuth<Ctx>(async (_req, { params }, owner) => {
    const { id } = await params;
    if (String(owner._id) !== id) return forbidden();
    // delete logic here
    return success(null, 200, "Deleted");
});
```

**With crud.ts**

```typescript
import { withAuth } from "@/lib/withAuth";
import { owners } from "@/lib/owner.crud";

export const GET = withAuth((req) => owners.list(req));
export const POST = withAuth((req) => owners.create(req));
```

### 401 vs 403

- **401 Unauthorized**: not logged in or token invalid. Handled by `withAuth`.
- **403 Forbidden**: logged in but not allowed to do this. Check inside the handler, as in the delete example above.

### Extending later

If roles are added (`admin`, `owner`), build on top instead of editing `withAuth`:

```typescript
export function withRole<C = unknown>(role: string, handler: AuthedHandler<C>) {
    return withAuth<C>(async (req, ctx, owner) => {
        if (owner.role !== role) return forbidden();
        return handler(req, ctx, owner);
    });
}
```

### Troubleshooting

| Problem | Cause |
| --- | --- |
| Always 401 in Postman | Cookie not sent: log in first in the same Postman session, or test from the browser |
| TypeScript error on `ctx` | Pass the context type: `withAuth<Ctx>(...)` |
| Page needs login, not an API route | Use `getCurrentOwner()` in the server component and `redirect("/login")`, not `withAuth` |

---

## 5. Request flow (summary)

```
Browser ──cookie──▶ Route handler
                       │
                  withAuth
                       │ getCurrentOwner()
                       │   ├─ read cookie
                       │   ├─ verifyToken (env.JWT_SECRET)
                       │   └─ find owner in MongoDB
                       │
              no owner ─▶ 401 (api-response)
              owner    ─▶ handler(req, ctx, owner)
```

---

## 6. Maintenance checklist

- [ ] `JWT_SECRET` is long, random, and different in development and production
- [ ] `.env.local` is not committed
- [ ] Production runs on HTTPS
- [ ] Passwords are hashed (pre-save hook in `owner.model.ts`); never stored as plain text
- [ ] Update `jsonwebtoken`, `bcryptjs`, `mongoose`, and `next` regularly: run `npm audit` every few months
- [ ] After a major Next.js upgrade, re-check `cookies()` and route `params` (both became async in version 15)
- [ ] Consider rate limiting the login route to slow down password guessing