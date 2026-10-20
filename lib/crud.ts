import mongoose, { Model } from "mongoose";
import connectDB from "./db";
import { success, error, notFound, serverError } from "./api-response";

/* ---------- Types ---------- */

export interface ListOptions<T> {
    page?: number;
    limit?: number;
    sortBy?: string;
    order?: "asc" | "desc";
    filter?: mongoose.QueryFilter<T>;
    search?: string;
    searchFields?: string[];
}

export interface PaginatedResult<T> {
    items: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

export interface CRUDConfig {
    /** Fields searched with ?search=... */
    searchFields?: string[];
    /** Fields allowed as exact-match filters, e.g. ?status=active */
    filterFields?: string[];
    /** Fields clients may set on create/update. Omit to allow all non-operator fields. */
    allowedFields?: string[];
    /** Max items per page */
    maxLimit?: number;
}

export type RouteContext = { params: Promise<{ id: string }> };

/* ---------- Input sanitizing ---------- */

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
    try {
        const body: unknown = await req.json();
        return isPlainObject(body) ? body : null;
    } catch {
        return null;
    }
}

function pickFields(
    body: Record<string, unknown>,
    allowedFields?: string[]
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
        if (key.startsWith("$") || FORBIDDEN_KEYS.has(key)) continue;
        if (allowedFields && !allowedFields.includes(key)) continue;
        out[key] = body[key];
    }
    return out;
}

/* ---------- Service ---------- */

export class CRUDService<T> {
    constructor(private model: Model<T>) { }

    isValidSortField(field: string): boolean {
        return Object.prototype.hasOwnProperty.call(this.model.schema.paths, field);
    }

    async create(data: Partial<T>) {
        const doc = await this.model.create(data as mongoose.AnyKeys<T>);
        return doc.toObject();
    }

    async getAll(options: ListOptions<T> = {}, maxLimit = 100): Promise<PaginatedResult<T>> {
        const page = Math.max(1, options.page ?? 1);
        const limit = Math.min(maxLimit, Math.max(1, options.limit ?? 10));
        const requestedSort = options.sortBy ?? "createdAt";
        const sortBy = this.isValidSortField(requestedSort) ? requestedSort : "_id";
        const order = options.order === "asc" ? 1 : -1;

        const query: Record<string, unknown> = { ...(options.filter ?? {}) };

        if (options.search && options.searchFields?.length) {
            const escaped = options.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(escaped, "i");
            query.$or = options.searchFields.map((field) => ({ [field]: regex }));
        }

        const filter = query as mongoose.QueryFilter<T>;

        const [items, total] = await Promise.all([
            this.model
                .find(filter)
                .sort({ [sortBy]: order })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<T[]>(),
            this.model.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        };
    }

    async getById(id: string) {
        return this.model.findById(id).lean<T>();
    }

    async update(id: string, data: mongoose.UpdateQuery<T>) {
        return this.model
            .findByIdAndUpdate(id, data, { new: true, runValidators: true })
            .lean<T>();
    }

    async delete(id: string) {
        return this.model.findByIdAndDelete(id).lean<T>();
    }
}

/* ---------- Error handling ---------- */

export function handleError(err: unknown) {
    if (err instanceof mongoose.Error.ValidationError) {
        const details = Object.fromEntries(
            Object.entries(err.errors).map(([field, e]) => [field, e.message])
        );
        return error("Validation failed", 400, details);
    }
    if (err instanceof mongoose.Error.CastError) {
        return error(`Invalid value for ${err.path}`, 400);
    }
    if ((err as { code?: number })?.code === 11000) {
        return error("Duplicate value", 409, (err as { keyValue?: unknown }).keyValue);
    }
    console.error(err);
    return serverError();
}

/* ---------- Route handler factory ---------- */

export function createCRUD<T>(model: Model<T>, config: CRUDConfig = {}) {
    const service = new CRUDService<T>(model);
    const { searchFields = [], filterFields = [], allowedFields, maxLimit = 100 } = config;

    return {
        service,

        // GET /api/resource
        list: async (req: Request) => {
            try {
                await connectDB();
                const params = new URL(req.url).searchParams;

                const sortBy = params.get("sortBy");
                if (sortBy && !service.isValidSortField(sortBy)) {
                    return error(`Invalid sort field: ${sortBy}`, 400);
                }

                const filter: Record<string, unknown> = {};
                for (const field of filterFields) {
                    const value = params.get(field);
                    if (value !== null) filter[field] = value;
                }

                const result = await service.getAll(
                    {
                        page: Number(params.get("page")) || 1,
                        limit: Number(params.get("limit")) || 10,
                        sortBy: sortBy ?? undefined,
                        order: params.get("order") === "asc" ? "asc" : "desc",
                        search: params.get("search") ?? undefined,
                        searchFields,
                        filter: filter as mongoose.QueryFilter<T>,
                    },
                    maxLimit
                );

                return success(result);
            } catch (err) {
                return handleError(err);
            }
        },

        // POST /api/resource
        create: async (req: Request) => {
            try {
                await connectDB();
                const body = await readJson(req);
                if (!body) return error("Invalid JSON body", 400);

                const doc = await service.create(pickFields(body, allowedFields) as Partial<T>);
                return success(doc, 201, "Created");
            } catch (err) {
                return handleError(err);
            }
        },

        // GET /api/resource/[id]
        getOne: async (_req: Request, { params }: RouteContext) => {
            try {
                await connectDB();
                const { id } = await params;
                if (!mongoose.isValidObjectId(id)) return error("Invalid id", 400);

                const doc = await service.getById(id);
                if (!doc) return notFound();
                return success(doc);
            } catch (err) {
                return handleError(err);
            }
        },

        // PUT /api/resource/[id]
        update: async (req: Request, { params }: RouteContext) => {
            try {
                await connectDB();
                const { id } = await params;
                if (!mongoose.isValidObjectId(id)) return error("Invalid id", 400);

                const body = await readJson(req);
                if (!body) return error("Invalid JSON body", 400);

                const data = pickFields(body, allowedFields);
                const doc = await service.update(id, { $set: data } as mongoose.UpdateQuery<T>);
                if (!doc) return notFound();
                return success(doc, 200, "Updated");
            } catch (err) {
                return handleError(err);
            }
        },

        // DELETE /api/resource/[id]
        remove: async (_req: Request, { params }: RouteContext) => {
            try {
                await connectDB();
                const { id } = await params;
                if (!mongoose.isValidObjectId(id)) return error("Invalid id", 400);

                const doc = await service.delete(id);
                if (!doc) return notFound();
                return success(doc, 200, "Deleted");
            } catch (err) {
                return handleError(err);
            }
        },
    };
}
