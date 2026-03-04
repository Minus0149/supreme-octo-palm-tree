"use server";

import { cookies } from "next/headers";

export async function setAuthCookie(token: string, role: string, userId: string) {
    const cookieStore = await cookies();
    const opts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7, // 1 week
        path: "/",
    };

    cookieStore.set("auth-token", token, opts);
    cookieStore.set("user-role", role, opts);
    cookieStore.set("user-id", userId, opts);
}

export async function clearAuthCookie() {
    const cookieStore = await cookies();
    cookieStore.delete("auth-token");
    cookieStore.delete("user-role");
    cookieStore.delete("user-id");
}

export async function getAuthUser(): Promise<{ role: string | null; id: string | null; token: string | null }> {
    const cookieStore = await cookies();
    return {
        role: cookieStore.get("user-role")?.value || null,
        id: cookieStore.get("user-id")?.value || null,
        token: cookieStore.get("auth-token")?.value || null,
    };
}
