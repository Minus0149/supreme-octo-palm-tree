import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Public Paths
    if (pathname === "/" || pathname === "/login") {
        return NextResponse.next();
    }

    // Check for our auth token and role
    const hasToken = request.cookies.has("auth-token");
    const role = request.cookies.get("user-role")?.value;

    if (!hasToken || !role) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
    }

    // Admin — can only access /admin
    if (pathname.startsWith("/admin") && role !== "admin") {
        const url = request.nextUrl.clone();
        url.pathname = role === "faculty" ? "/faculty" : "/student";
        return NextResponse.redirect(url);
    }

    // Faculty — can access /faculty
    if (pathname.startsWith("/faculty") && role !== "faculty") {
        const url = request.nextUrl.clone();
        url.pathname = role === "admin" ? "/admin" : "/student";
        return NextResponse.redirect(url);
    }

    // Student — can access /student
    if (pathname.startsWith("/student") && role !== "student") {
        const url = request.nextUrl.clone();
        url.pathname = role === "faculty" ? "/faculty" : "/admin";
        return NextResponse.redirect(url);
    }

    // Attendance — faculty (take attendance) and students (view-only future) can access
    if (pathname.startsWith("/attendance") && role !== "faculty" && role !== "student") {
        const url = request.nextUrl.clone();
        url.pathname = "/admin";
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
