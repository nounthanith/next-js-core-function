import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import connectDB from "./db";
import { env } from "./env";
import { COOKIE_NAME, TOKEN_TTL_SECONDS, signToken, verifyToken } from "./jwt";
import User from "@/models/user.model";
import { type IUser, type UserRole } from "@/types/user.type";

export interface SessionUser {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    phone?: string;
    address?: string;
    photo?: string;
}

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
    const token = await signToken({ sub: user.id, role: user.role });
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: TOKEN_TTL_SECONDS,
    });
}

export async function deleteSession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
}

function tokenFromRequest(req: Request): string | null {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);

    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

    return null;
}

export function toSessionUser(user: IUser): SessionUser {
    return {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        photo: user.photo,
    };
}

export async function getSessionUser(req?: Request): Promise<SessionUser | null> {
    let token = req ? tokenFromRequest(req) : null;

    if (!token) {
        const cookieStore = await cookies();
        token = cookieStore.get(COOKIE_NAME)?.value ?? null;
    }
    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload) return null;

    await connectDB();
    const user = await User.findById(payload.sub).lean<IUser>();
    if (!user) return null;

    return toSessionUser(user);
}
