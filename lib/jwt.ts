import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { USER_ROLES, type UserRole } from "@/types/user.type";

export const COOKIE_NAME = "token";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface TokenPayload {
    sub: string;
    role: UserRole;
}

export async function signToken(payload: TokenPayload): Promise<string> {
    return new SignJWT({ role: payload.role })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(payload.sub)
        .setIssuedAt()
        .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
        .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
    try {
        const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
        if (typeof payload.sub !== "string") return null;
        if (!USER_ROLES.includes(payload.role as UserRole)) return null;
        return { sub: payload.sub, role: payload.role as UserRole };
    } catch {
        return null;
    }
}
