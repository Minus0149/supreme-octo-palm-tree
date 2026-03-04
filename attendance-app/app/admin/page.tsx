"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, Plus, Trash2, RefreshCw, CheckCircle, Clock, XCircle, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_BASE = "http://localhost:8000";

type Student = {
    id: number;
    usn: string;
    name: string;
    dept: string;
    semester: number;
    registered_at: string;
    face_status: "unregistered" | "pending" | "approved" | "trained";
};

const STATUS_CONFIG = {
    trained: { label: "TRAINED", color: "text-primary border-primary/30 bg-primary/10", Icon: CheckCircle },
    approved: { label: "APPROVED", color: "text-primary/70 border-primary/20 bg-primary/5", Icon: CheckCircle },
    pending: { label: "PENDING", color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5", Icon: Clock },
    unregistered: { label: "UNREGISTERED", color: "text-muted-foreground border-border bg-background", Icon: XCircle },
};

export default function AdminDashboard() {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [deletingUsn, setDeletingUsn] = useState<string | null>(null);
    const [form, setForm] = useState({ usn: "", name: "", dept: "CS", semester: "6", password: "" });
    const [formError, setFormError] = useState<string | null>(null);

    const fetchStudents = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/admin/students`);
            if (res.ok) setStudents(await res.json());
        } catch {
            // backend not reachable
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchStudents(); }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setFormError(null);
        try {
            const res = await fetch(`${API_BASE}/api/admin/students`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    usn: form.usn,
                    name: form.name,
                    dept: form.dept,
                    semester: parseInt(form.semester),
                    password: form.password,
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                setFormError(err.detail || "Error creating student");
                return;
            }
            setShowForm(false);
            setForm({ usn: "", name: "", dept: "CS", semester: "6", password: "" });
            fetchStudents();
        } catch {
            setFormError("Cannot reach backend. Is uvicorn running?");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (usn: string) => {
        if (!confirm(`Delete student ${usn}? This cannot be undone.`)) return;
        setDeletingUsn(usn);
        try {
            await fetch(`${API_BASE}/api/admin/students/${usn}`, { method: "DELETE" });
            setStudents(prev => prev.filter(s => s.usn !== usn));
        } finally {
            setDeletingUsn(null);
        }
    };

    const trained = students.filter(s => s.face_status === "trained").length;
    const pending = students.filter(s => s.face_status === "pending").length;
    const unregistered = students.filter(s => s.face_status === "unregistered").length;

    return (
        <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-overlay pointer-events-none"></div>

            <header className="mb-8 flex justify-between items-end border-b border-border pb-4 relative z-10">
                <div>
                    <h1 className="text-3xl font-mono font-bold tracking-tight uppercase text-primary flex items-center gap-3">
                        <ShieldAlert className="w-7 h-7" /> Admin Dashboard
                    </h1>
                    <p className="text-muted-foreground font-mono text-sm tracking-widest mt-1">ADMIN-001 | System Administrator</p>
                </div>
                <div className="flex gap-3">
                    <Button onClick={fetchStudents} variant="outline" className="rounded-none font-mono text-xs gap-2">
                        <RefreshCw className="w-3 h-3" /> Refresh
                    </Button>
                    <Button onClick={() => setShowForm(!showForm)} className="rounded-none font-mono text-xs gap-2">
                        <Plus className="w-4 h-4" /> New Student
                    </Button>
                </div>
            </header>

            <div className="relative z-10 space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                    {[
                        { label: "Total Students", value: students.length, color: "text-foreground" },
                        { label: "Face Trained", value: trained, color: "text-primary" },
                        { label: "Pending Review", value: pending, color: "text-yellow-400" },
                        { label: "Unregistered", value: unregistered, color: "text-muted-foreground" },
                    ].map(stat => (
                        <Card key={stat.label} className="rounded-none border-border bg-card/50">
                            <CardContent className="p-4 text-center">
                                <div className={`text-3xl font-mono font-bold ${stat.color}`}>{stat.value}</div>
                                <div className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider mt-1">{stat.label}</div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Create Student Form */}
                {showForm && (
                    <Card className="rounded-none border-primary/30 bg-primary/5">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="font-mono text-sm tracking-widest uppercase text-primary flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Create Student Account
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="font-mono text-xs uppercase text-primary/70">USN</Label>
                                    <Input value={form.usn} onChange={e => setForm(f => ({ ...f, usn: e.target.value }))}
                                        placeholder="U24AN23S0010" required className="rounded-none font-mono border-border bg-background/80" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="font-mono text-xs uppercase text-primary/70">Full Name</Label>
                                    <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder="Ravi Kumar" required className="rounded-none font-mono border-border bg-background/80" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="font-mono text-xs uppercase text-primary/70">Department</Label>
                                    <Input value={form.dept} onChange={e => setForm(f => ({ ...f, dept: e.target.value }))}
                                        placeholder="CS" required className="rounded-none font-mono border-border bg-background/80" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="font-mono text-xs uppercase text-primary/70">Semester</Label>
                                    <Input value={form.semester} onChange={e => setForm(f => ({ ...f, semester: e.target.value }))}
                                        type="number" min="1" max="8" required className="rounded-none font-mono border-border bg-background/80" />
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <Label className="font-mono text-xs uppercase text-primary/70">Initial Password</Label>
                                    <Input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                                        type="password" placeholder="At least 8 chars" required className="rounded-none font-mono border-border bg-background/80" />
                                </div>
                                {formError && (
                                    <div className="col-span-2 text-[11px] font-mono text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2">
                                        ✗ {formError}
                                    </div>
                                )}
                                <div className="col-span-2 flex gap-3">
                                    <Button type="submit" disabled={submitting} className="rounded-none font-mono text-xs">
                                        {submitting ? "Creating..." : "Create Account"}
                                    </Button>
                                    <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="rounded-none font-mono text-xs">
                                        Cancel
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {/* Student Table */}
                <Card className="rounded-none border-border bg-card/50">
                    <CardHeader className="border-b border-border/50 pb-4">
                        <CardTitle className="font-mono text-sm tracking-widest uppercase text-primary flex items-center gap-2">
                            <User className="w-4 h-4" /> Registered Students
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm font-mono">
                            <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 text-left font-normal">USN</th>
                                    <th className="px-4 py-3 text-left font-normal">Name</th>
                                    <th className="px-4 py-3 text-left font-normal">Dept</th>
                                    <th className="px-4 py-3 text-left font-normal">Sem</th>
                                    <th className="px-4 py-3 text-left font-normal">Face Status</th>
                                    <th className="px-4 py-3 text-right font-normal">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {loading && (
                                    <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground text-[11px] uppercase">Loading...</td></tr>
                                )}
                                {!loading && students.length === 0 && (
                                    <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground text-[11px] uppercase">No students found. Create one above.</td></tr>
                                )}
                                {students.map(s => {
                                    const cfg = STATUS_CONFIG[s.face_status];
                                    const Icon = cfg.Icon;
                                    return (
                                        <tr key={s.usn} className="hover:bg-primary/5 transition-colors">
                                            <td className="px-4 py-3 font-bold">{s.usn}</td>
                                            <td className="px-4 py-3">{s.name}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{s.dept}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{s.semester}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider border ${cfg.color}`}>
                                                    <Icon className="w-3 h-3" />{cfg.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={deletingUsn === s.usn}
                                                    onClick={() => handleDelete(s.usn)}
                                                    className="rounded-none h-7 text-destructive hover:bg-destructive/10 hover:text-destructive font-mono text-[10px]"
                                                >
                                                    <Trash2 className="w-3 h-3 mr-1" />
                                                    {deletingUsn === s.usn ? "..." : "Delete"}
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
