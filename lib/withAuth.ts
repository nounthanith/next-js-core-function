import "server-only";
import { forbidden, unauthorized } from "./api-response";
import { getSessionUser, type SessionUser } from "./auth";
import { handleError } from "./crud";
import type { UserRole } from "@/types/user.type";

export interface AuthRouteContext {
    params: Promise<Record<string, string>>;
}

export interface AuthOptions {
    roles?: UserRole[];
    self?: boolean;
}

export interface AuthContext {
    user: SessionUser;
}

export function withAuth<C extends AuthRouteContext>(
    handler: (req: Request, ctx: C, auth: AuthContext) => Promise<Response>,
    options: AuthOptions = {}
) {
    return async (req: Request, ctx: C): Promise<Response> => {
        try {
            const user = await getSessionUser(req);
            if (!user) return unauthorized();

            if (options.roles && !options.roles.includes(user.role)) {
                if (options.self) {
                    const params = await ctx?.params;
                    if (params?.id && params.id === user.id) {
                        return handler(req, ctx, { user });
                    }
                }
                return forbidden();
            }

            return handler(req, ctx, { user });
        } catch (err) {
            return handleError(err);
        }
    };
}
