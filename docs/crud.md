# crud

Generic CRUD route factory in `lib/crud.ts`. Give it a Mongoose model, get ready-made
list / create / get / update / delete handlers that connect to the DB, validate input,
paginate, and return the standard `api-response` JSON shape.

## Config

```typescript
import { createCRUD } from "@/lib/crud";
import Owner from "@/models/owner.model";

const ownerCRUD = createCRUD<IOwner>(Owner, {
    searchFields: ["name", "email"],
    filterFields: ["status"],
    allowedFields: ["name", "email", "phone"],
    maxLimit: 50,
});
```

| Option | Default | Description |
| --- | --- | --- |
| `searchFields` | `[]` | Fields used by `?search=...` |
| `filterFields` | `[]` | Fields allowed as exact-match filters, e.g. `?status=active` |
| `allowedFields` | all | Fields clients may set on create/update. **Always set this for models with sensitive fields** (password, role, ...) |
| `maxLimit` | `100` | Hard cap on `?limit=` |

## Endpoints

Wire the handlers into App Router routes. Per-model CRUD instances live in
`src/services/`:

```typescript
// src/services/owner.service.ts
import { createCRUD } from "@/lib/crud";
import Owner from "@/models/owner.model";
import type { IOwner } from "@/types/owner.type";

export const ownerCRUD = createCRUD<IOwner>(Owner, {
    searchFields: ["name", "email"],
    allowedFields: ["name", "email", "phone", "password"],
});
```

```typescript
// app/api/owners/route.ts
import { ownerCRUD } from "@/services/owner.service";

export const GET = ownerCRUD.list;
export const POST = ownerCRUD.create;

// app/api/owners/[id]/route.ts
import { ownerCRUD } from "@/services/owner.service";

export const GET = ownerCRUD.getOne;
export const PUT = ownerCRUD.update;
export const DELETE = ownerCRUD.remove;
```

| Handler | Method + path | Notes |
| --- | --- | --- |
| `list` | `GET /api/resource` | Paginated list, supports search, filter, sort |
| `create` | `POST /api/resource` | Returns `201` |
| `getOne` | `GET /api/resource/:id` | `400` invalid ObjectId, `404` missing |
| `update` | `PUT /api/resource/:id` | Partial update, runs validators |
| `remove` | `DELETE /api/resource/:id` | Returns the deleted document |

Each handler calls `connectDB()` itself, so routes need no manual connection.

## List query parameters

| Param | Example | Description |
| --- | --- | --- |
| `page` | `?page=2` | 1-based page number, min 1 |
| `limit` | `?limit=20` | Capped at `maxLimit`, min 1 |
| `sortBy` | `?sortBy=name` | Must be a schema field, otherwise `400` |
| `order` | `?order=asc` | `asc` or anything else = `desc` |
| `search` | `?search=ali` | Regex (case-insensitive) across `searchFields` |
| filters | `?status=active` | Exact match on fields listed in `filterFields` |

Response:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 0,
      "totalPages": 0,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

## Security behavior

- `sortBy` is validated against the model schema — no sort injection.
- `$`-prefixed keys (`$set`, `$inc`, ...), `__proto__`, `constructor`, `prototype`
  are stripped from create/update bodies; updates are wrapped in `$set`, so clients
  cannot run operators.
- If `allowedFields` is set, only those keys survive sanitizing (mass-assignment guard).
- Bad JSON body returns `400`, not `500`.
- Validation errors return `400` with `{ field: message }` details; duplicate key
  returns `409`; bad id values return `400`.

## Errors

| Status | When |
| --- | --- |
| 400 | Invalid id, invalid JSON body, invalid sort field, validation failed |
| 404 | Document not found |
| 409 | Duplicate unique value (e.g. email already exists) |
| 500 | Unexpected error (logged server-side) |

## Using the service directly

`createCRUD` exposes `service` for use outside route handlers (scripts, other libs):

```typescript
const { items, pagination } = await ownerCRUD.service.getAll(
    { page: 1, limit: 10, search: "ali", searchFields: ["name"] },
    50
);
const doc = await ownerCRUD.service.getById(id);
```

The service does **not** sanitize inputs — only the route handlers do. Validate ids
and fields yourself when calling the service directly.

## Rules

- Always set `allowedFields` for models with sensitive fields (password, role, tokens).
- Wrap routes with auth (`lib/withAuth.ts`) before exposing them publicly — the
  handlers themselves do no authentication.
- Never return password hashes in responses; keep `select: false` on the schema field.
- Use `PUT` for partial updates; missing fields are left untouched.
