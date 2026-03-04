"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Key, User, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { setAuthCookie } from "@/app/actions";
import { loginStudent, loginFaculty } from "@/lib/api";

export default function LoginPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (role: "student" | "faculty" | "admin") => {
        setIsLoading(true);
        try {
            if (role === "student") {
                const usn = (document.getElementById("usn") as HTMLInputElement).value;
                const pwd = (document.getElementById("password") as HTMLInputElement).value;
                const { access_token } = await loginStudent(usn, pwd);
                await setAuthCookie(access_token, role, usn);
            } else if (role === "faculty") {
                const id = (document.getElementById("faculty-id") as HTMLInputElement).value;
                const pwd = (document.getElementById("faculty-password") as HTMLInputElement).value;
                const { access_token } = await loginFaculty(id, pwd);
                await setAuthCookie(access_token, role, id);
            } else if (role === "admin") {
                const id = (document.getElementById("admin-id") as HTMLInputElement).value;
                await setAuthCookie("mock-token-admin", role, id); // Admin login is not backed by DB in this version
            }
            router.push(role === "admin" ? "/admin" : `/${role}`);
        } catch (e: any) {
            alert(e.message || "Authentication failed. Check credentials.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden bg-background">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary opacity-20 blur-[100px]"></div>

            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-none border border-primary/50 bg-primary/10 mb-4 shadow-[0_0_15px_rgba(20,180,180,0.2)]">
                        <Shield className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-2 uppercase">Access Portal</h1>
                    <p className="text-muted-foreground font-mono text-sm tracking-widest">Identify Yourself</p>
                </div>

                <Tabs defaultValue="student" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 rounded-none p-0 bg-secondary/50 border border-border h-12">
                        <TabsTrigger value="student" className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-mono uppercase tracking-wider text-xs">
                            Student
                        </TabsTrigger>
                        <TabsTrigger value="faculty" className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-mono uppercase tracking-wider text-xs">
                            Faculty
                        </TabsTrigger>
                        <TabsTrigger value="admin" className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-mono uppercase tracking-wider text-xs">
                            Admin
                        </TabsTrigger>
                    </TabsList>

                    {/* Student Tab */}
                    <TabsContent value="student">
                        <Card className="rounded-none border-t-0 shadow-2xl bg-card/80 backdrop-blur-md">
                            <CardHeader className="space-y-1">
                                <CardTitle className="text-xl font-mono uppercase text-primary">Student Access</CardTitle>
                                <CardDescription className="font-mono text-xs">Enter your USN and password.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="usn" className="font-mono text-xs uppercase text-primary/70">USN / ID</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input id="usn" defaultValue="U24AN23S0001" className="pl-9 rounded-none border-primary/20 bg-background/50 focus-visible:ring-primary font-mono" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="password" className="font-mono text-xs uppercase text-primary/70">Password</Label>
                                    <div className="relative">
                                        <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input id="password" type="password" defaultValue="••••••••" className="pl-9 rounded-none border-primary/20 bg-background/50 focus-visible:ring-primary font-mono" />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button className="w-full rounded-none font-mono uppercase tracking-widest group" onClick={() => handleLogin("student")} disabled={isLoading}>
                                    {isLoading ? "Authenticating..." : "Establish Connection"}
                                    {!isLoading && <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Faculty Tab */}
                    <TabsContent value="faculty">
                        <Card className="rounded-none border-t-0 shadow-2xl bg-card/80 backdrop-blur-md">
                            <CardHeader className="space-y-1">
                                <CardTitle className="text-xl font-mono uppercase text-primary">Faculty Override</CardTitle>
                                <CardDescription className="font-mono text-xs">Authorize with faculty credentials.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="faculty-id" className="font-mono text-xs uppercase text-primary/70">Faculty ID</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input id="faculty-id" defaultValue="FAC-205" className="pl-9 rounded-none border-primary/20 bg-background/50 focus-visible:ring-primary font-mono" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="faculty-password" className="font-mono text-xs uppercase text-primary/70">Access Code</Label>
                                    <div className="relative">
                                        <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input id="faculty-password" type="password" defaultValue="admin123" className="pl-9 rounded-none border-primary/20 bg-background/50 focus-visible:ring-primary font-mono" />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button className="w-full rounded-none font-mono uppercase tracking-widest group" onClick={() => handleLogin("faculty")} disabled={isLoading}>
                                    {isLoading ? "Authenticating..." : "Override Protocol"}
                                    {!isLoading && <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Admin Tab */}
                    <TabsContent value="admin">
                        <Card className="rounded-none border-t-0 shadow-2xl bg-card/80 backdrop-blur-md">
                            <CardHeader className="space-y-1">
                                <CardTitle className="text-xl font-mono uppercase text-primary">System Admin</CardTitle>
                                <CardDescription className="font-mono text-xs">Root access. Manages student accounts.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="admin-id" className="font-mono text-xs uppercase text-primary/70">Admin ID</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input id="admin-id" defaultValue="ADMIN-001" className="pl-9 rounded-none border-primary/20 bg-background/50 focus-visible:ring-primary font-mono" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="admin-password" className="font-mono text-xs uppercase text-primary/70">Master Key</Label>
                                    <div className="relative">
                                        <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input id="admin-password" type="password" defaultValue="••••••••" className="pl-9 rounded-none border-primary/20 bg-background/50 focus-visible:ring-primary font-mono" />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <Button className="w-full rounded-none font-mono uppercase tracking-widest group" onClick={() => handleLogin("admin")} disabled={isLoading}>
                                    {isLoading ? "Authenticating..." : "Root Access"}
                                    {!isLoading && <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>
                </Tabs>

                <div className="mt-8 border border-border bg-black/50 p-3 font-mono text-[10px] text-primary/50 flex flex-col gap-1">
                    <div className="flex justify-between">
                        <span>SYS.AUTH.PROTOCOL</span>
                        <span>v2.4.1</span>
                    </div>
                    <div className="w-full h-[1px] bg-border my-1"></div>
                    <span className="text-muted-foreground">{`> AWAITING CREDENTIAL INPUT...`}</span>
                </div>
            </div>
        </div>
    );
}
