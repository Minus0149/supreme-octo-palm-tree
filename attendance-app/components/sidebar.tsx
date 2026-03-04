"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Camera, LayoutDashboard, UserSquare, LogOut, Lock, ShieldAlert } from "lucide-react";
import { clearAuthCookie } from "@/app/actions";

interface SidebarProps {
    role: "student" | "faculty" | "admin" | null;
}

export function Sidebar({ role }: SidebarProps) {
    const router = useRouter();
    const pathname = usePathname();

    const handleLogout = async () => {
        await clearAuthCookie();
        router.push("/");
        router.refresh();
    };

    const isLoggedIn = role !== null;

    const navLinkClass = (href: string) =>
        `flex items-center gap-3 px-3 py-2 text-sm transition-colors border-l-2 font-mono ${pathname === href
            ? "text-primary bg-primary/10 border-primary"
            : "text-foreground/70 border-transparent hover:text-primary hover:bg-primary/10 hover:border-primary"
        }`;

    return (
        <div className="w-64 min-h-screen border-r border-border bg-sidebar text-sidebar-foreground flex flex-col font-mono relative overflow-hidden shrink-0">
            {/* Background Decor */}
            <div className="absolute inset-0 opacity-5 pointer-events-none bg-[url('https://transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>

            {/* Logo */}
            <div className="p-6 border-b border-border relative z-10">
                <Link href="/" className="block">
                    <div className="text-xl font-bold text-primary flex items-center gap-2 font-sans tracking-tight">
                        <Camera className="w-6 h-6 text-primary" />
                        <span>A.I.R.S</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 uppercase tracking-widest font-mono">
                        Attendance System
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto py-6 relative z-10">
                <div className="px-4 mb-6">
                    <div className="text-xs text-primary/70 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-none bg-primary animate-pulse"></span>
                        {isLoggedIn ? "System Modules" : "Access Required"}
                    </div>

                    <nav className="space-y-1">
                        {/* Not logged in — show login prompt */}
                        {!isLoggedIn && (
                            <Link href="/login" className={navLinkClass("/login")}>
                                <Lock className="w-4 h-4" />
                                Access Portal
                            </Link>
                        )}

                        {/* Admin — Admin Dashboard + Faculty Monitor */}
                        {role === "admin" && (
                            <>
                                <Link href="/admin" className={navLinkClass("/admin")}>
                                    <ShieldAlert className="w-4 h-4" />
                                    Admin Dashboard
                                </Link>
                                <Link href="/faculty" className={navLinkClass("/faculty")}>
                                    <LayoutDashboard className="w-4 h-4" />
                                    Faculty Monitor
                                </Link>
                            </>
                        )}

                        {/* Faculty — Faculty Monitor + Take Attendance */}
                        {role === "faculty" && (
                            <>
                                <Link href="/faculty" className={navLinkClass("/faculty")}>
                                    <LayoutDashboard className="w-4 h-4" />
                                    Faculty Monitor
                                </Link>
                                <Link href="/attendance" className={navLinkClass("/attendance")}>
                                    <Camera className="w-4 h-4" />
                                    Take Attendance
                                </Link>
                            </>
                        )}

                        {/* Student — Student Portal only */}
                        {role === "student" && (
                            <Link href="/student" className={navLinkClass("/student")}>
                                <UserSquare className="w-4 h-4" />
                                Student Portal
                            </Link>
                        )}

                        {/* Disconnect — only when logged in */}
                        {isLoggedIn && (
                            <button
                                onClick={handleLogout}
                                className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm text-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors border-l-2 border-transparent hover:border-destructive mt-6"
                            >
                                <LogOut className="w-4 h-4" />
                                Disconnect
                            </button>
                        )}
                    </nav>
                </div>
            </div>

            {/* Status Footer */}
            <div className="p-4 border-t border-border bg-background/50 text-xs font-mono text-muted-foreground relative z-10">
                {isLoggedIn ? (
                    <>
                        <div className="flex justify-between items-center">
                            <span>ROLE:</span>
                            <span className="text-primary tracking-widest uppercase">{role}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                            <span>STATUS:</span>
                            <span className="text-primary flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block"></span>
                                ONLINE
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="flex justify-between items-center">
                        <span>STATUS:</span>
                        <span className="text-muted-foreground/50 tracking-widest">STANDBY</span>
                    </div>
                )}
            </div>
        </div>
    );
}
