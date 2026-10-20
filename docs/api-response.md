# api-response

Helper functions in `lib/api-response.ts` that make every API route return the same JSON shape.

## Response shape

**Success**

```json
{
  "success": true,
  "data": {},
  "message": "optional"
}
```

**Error**

```json
{
  "success": false,
  "error": "Error message",
  "details": "optional"
}
```

## Functions

| Function | Default status | Description |
| --- | --- | --- |
| `success(data, status?, message?)` | 200 | Returns a success response with data |
| `error(message, status?, details?)` | 400 | Returns an error response |
| `unauthorized(message?)` | 401 | Missing or invalid token |
| `forbidden(message?)` | 403 | Logged in but not allowed |
| `notFound(message?)` | 404 | Resource does not exist |
| `serverError(message?)` | 500 | Unexpected server error |

## Usage

```typescript
import { success, error, notFound, serverError } from "@/lib/api-response";

export async function GET() {
    try {
        const owner = await Owner.findOne();
        if (!owner) return notFound("Owner not found");
        return success(owner);
    } catch (err) {
        return serverError();
    }
}

export async function POST(req: Request) {
    const body = await req.json();
    if (!body.email) return error("Email is required", 400);
    const owner = await Owner.create(body);
    return success(owner, 201, "Owner created");
}
```

## Types

- `ApiSuccess<T>`: type of a success response.
- `ApiError`: type of an error response.

Use them on the client to type fetch results:

```typescript
const res = await fetch("/api/owner");
const json: ApiSuccess<IOwner> | ApiError = await res.json();

if (json.success) {
    console.log(json.data.name);
} else {
    console.error(json.error);
}
```

## Rules

- Always return through these helpers, never `NextResponse.json` directly.
- Use `201` for created resources, `200` for everything else successful.
- Never put a password or token in `data`.
