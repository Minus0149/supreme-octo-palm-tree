"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, CheckCircle2, AlertCircle, BarChart3, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getFaceStatus, uploadFaceFrames, getAttendanceSummary, getRecentLogs } from "@/lib/api";
import { getAuthUser } from "@/app/actions";

// Head movement instructions shown during scan
const SCAN_STEPS = [
    "Look STRAIGHT at the camera",
    "Turn head SLIGHTLY LEFT",
    "Turn head SLIGHTLY RIGHT",
    "Tilt head UP slowly",
    "Tilt head DOWN slowly",
    "Look STRAIGHT — hold still",
];

export default function StudentDashboard() {
    const [usn, setUsn] = useState<string | null>(null);
    // Face registration state
    const [faceStatus, setFaceStatus] = useState<"unregistered" | "pending" | "approved" | "rejected" | "trained">("unregistered");
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isRegistering, setIsRegistering] = useState(false);
    const [captureCount, setCaptureCount] = useState(0);
    const [scanStep, setScanStep] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Attendance state
    const [attendance, setAttendance] = useState<{
        percentage: number;
        total_held: number;
        total_present: number;
        by_subject: { subject: string; code: string; held: number; present: number; percentage: number }[];
    } | null>(null);
    const [logs, setLogs] = useState<{ id: number; subject: string; date: string; status: string; confidence_score: number | null }[]>([]);

    // Load data on mount
    useEffect(() => {
        async function load() {
            try {
                const user = await getAuthUser();
                if (!user.id) return;
                setUsn(user.id);

                const [faceRes, attRes, logsRes] = await Promise.all([
                    getFaceStatus(user.id),
                    getAttendanceSummary(user.id),
                    getRecentLogs(user.id, 5),
                ]);
                setFaceStatus(faceRes.status as typeof faceStatus);
                setAttendance(attRes);
                setLogs(logsRes);
            } catch {
                // Backend might not be running — fall back to empty state silently
            }
        }
        load();
    }, []);

    // Build weekly chart data from by_subject
    const chartData = attendance?.by_subject.map((s, i) => ({
        week: `W${i + 1} `,
        present: s.percentage,
    })) ?? [
            { week: "W1", present: 85 }, { week: "W2", present: 90 }, { week: "W3", present: 88 },
            { week: "W4", present: 95 }, { week: "W5", present: 82 }, { week: "W6", present: 80 }, { week: "W7", present: 91 },
        ];

    // Cleanup camera on unmount
    useEffect(() => {
        return () => { stream?.getTracks().forEach(t => t.stop()); };
    }, [stream]);

    const initializeCamera = async () => {
        try {
            const ms = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
            setStream(ms);
            if (videoRef.current) videoRef.current.srcObject = ms;
        } catch {
            alert("Could not access camera. Check browser permissions.");
        }
    };

    const startCaptureSequence = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current) return;

        setIsRegistering(true);
        setUploadError(null);
        setCaptureCount(0);
        setScanStep(0);

        const ctx = canvasRef.current.getContext("2d");
        const blobs: Blob[] = [];
        const totalFrames = 30;
        const stepInterval = Math.floor(totalFrames / SCAN_STEPS.length); // change prompt every ~5 frames

        let count = 0;

        await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                if (count >= totalFrames) {
                    clearInterval(interval);
                    resolve();
                    return;
                }

                // Update step prompt
                setScanStep(Math.min(Math.floor(count / stepInterval), SCAN_STEPS.length - 1));

                if (videoRef.current && ctx && canvasRef.current) {
                    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
                    canvasRef.current.toBlob((blob) => {
                        if (blob) blobs.push(blob);
                    }, "image/jpeg", 0.9);
                }

                count++;
                setCaptureCount(count);
            }, 150);
        });

        // Stop camera
        stream?.getTracks().forEach(t => t.stop());
        setStream(null);

        // Upload to backend
        try {
            if (!usn) throw new Error("User ID missing");
            await uploadFaceFrames(usn, blobs);
            setFaceStatus("pending");
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setIsRegistering(false);
        }
    }, [stream]);

    const shortage = attendance
        ? Math.max(0, Math.ceil((0.75 * attendance.total_held) - attendance.total_present))
        : 1;

    return (
        <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-overlay pointer-events-none"></div>

            <header className="mb-8 flex justify-between items-end border-b border-border pb-4 relative z-10">
                <div>
                    <h1 className="text-3xl font-mono font-bold tracking-tight uppercase text-primary">Student Portal</h1>
                    <p className="text-muted-foreground font-mono text-sm tracking-widest mt-1">ID: {usn || "LOADING..."} | SEM: 6 | DEPT: CS</p>
                </div>
                <div className="text-right">
                    <div className="text-4xl font-mono font-bold text-primary">{attendance?.percentage ?? "—"}%</div>
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Aggregate Attendance</div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
                {/* Left: Face Registration + Quick Stats */}
                <div className="flex flex-col gap-6 lg:col-span-1">
                    <Card className="rounded-none border-primary/20 bg-card/80 backdrop-blur">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="font-mono text-sm tracking-widest uppercase flex items-center gap-2 text-primary">
                                <Camera className="w-4 h-4" /> Biometric Registration
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {faceStatus === "trained" || faceStatus === "approved" ? (
                                <div className="space-y-4 text-center">
                                    <div className="w-32 h-32 mx-auto border border-primary/50 bg-primary/10 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(20,180,180,0.2)]">
                                        <CheckCircle2 className="w-12 h-12" />
                                    </div>
                                    <p className="text-sm font-mono text-primary uppercase tracking-widest">Active Embedding</p>
                                    <p className="text-[10px] font-mono text-muted-foreground uppercase">
                                        {faceStatus === "trained" ? "Model Trained — Ready for Verification" : "Approved — Training in Progress"}
                                    </p>
                                </div>
                            ) : faceStatus === "pending" ? (
                                <div className="space-y-4 text-center">
                                    <div className="w-32 h-32 mx-auto border border-primary/30 bg-primary/5 flex items-center justify-center text-primary/50 shadow-[0_0_10px_rgba(20,180,180,0.1)]">
                                        <Camera className="w-10 h-10 animate-pulse" />
                                    </div>
                                    <p className="text-sm font-mono text-primary/70 uppercase tracking-widest">Pending Review</p>
                                    <p className="text-[10px] font-mono text-muted-foreground uppercase">30 Frames Uploaded<br />Awaiting Faculty Approval</p>
                                </div>
                            ) : (
                                <div className="space-y-4 text-center">
                                    {/* Camera viewfinder */}
                                    <div className={`w-full aspect-square max-w-[220px] mx-auto border-2 ${isRegistering ? "border-primary border-solid shadow-[0_0_20px_rgba(20,180,180,0.3)]" : "border-border border-dashed"} flex items-center justify-center relative overflow-hidden bg-black/80`}>
                                        <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${stream ? "block" : "hidden"}`} />
                                        {!stream && <UserPlaceholder />}

                                        {/* Scan overlay */}
                                        {isRegistering && (
                                            <>
                                                {/* Corner brackets */}
                                                <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-primary" />
                                                <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-primary" />
                                                <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-primary" />
                                                <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-primary" />
                                                {/* Scan line */}
                                                <div className="absolute inset-0 pointer-events-none">
                                                    <div className="w-full h-0.5 bg-primary/60 absolute animate-[scan_2s_ease-in-out_infinite]" />
                                                </div>
                                                {/* Frame counter */}
                                                <div className="absolute bottom-6 left-0 right-0 text-center">
                                                    <span className="bg-black/80 text-primary font-mono text-[10px] px-2 py-1 border border-primary/30">
                                                        FRAME {captureCount}/30
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Scan step instruction */}
                                    <div className="min-h-[2rem]">
                                        {isRegistering ? (
                                            <p className="text-[11px] font-mono text-primary uppercase tracking-widest animate-pulse">
                                                {SCAN_STEPS[scanStep]}
                                            </p>
                                        ) : (
                                            <p className="text-[10px] font-mono text-muted-foreground">
                                                {faceStatus === "rejected"
                                                    ? "⚠ Registration rejected. Please re-scan."
                                                    : "Status: UNREGISTERED — 30 samples required"}
                                            </p>
                                        )}
                                    </div>

                                    {uploadError && (
                                        <p className="text-[10px] font-mono text-destructive bg-destructive/10 px-2 py-1 border border-destructive/20">
                                            ✗ {uploadError}
                                        </p>
                                    )}

                                    {/* Progress bar while scanning */}
                                    {isRegistering && (
                                        <div className="w-full h-1 bg-border">
                                            <div
                                                className="h-full bg-primary transition-all duration-150"
                                                style={{ width: `${(captureCount / 30) * 100}% ` }}
                                            />
                                        </div>
                                    )}

                                    <div>
                                        {stream ? (
                                            <Button
                                                onClick={startCaptureSequence}
                                                disabled={isRegistering}
                                                className="w-full rounded-none font-mono text-xs"
                                                variant="default"
                                            >
                                                {isRegistering ? "SCANNING..." : "▶ START SCAN"}
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={initializeCamera}
                                                className="w-full rounded-none font-mono text-xs hover:bg-primary/20 hover:text-primary border border-primary/50"
                                                variant="outline"
                                            >
                                                <Camera className="w-4 h-4 mr-2" /> ENABLE CAMERA
                                            </Button>
                                        )}
                                    </div>

                                    <canvas ref={canvasRef} className="hidden" width={640} height={480} />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-4">
                        <Card className="rounded-none border-border bg-card/50">
                            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                <Activity className="w-6 h-6 text-primary mb-2 opacity-80" />
                                <div className="text-2xl font-mono font-bold text-foreground">{attendance?.total_held ?? "—"}</div>
                                <div className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Classes Held</div>
                            </CardContent>
                        </Card>
                        <Card className="rounded-none border-border bg-card/50">
                            <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                                <AlertCircle className={`w-6 h-6 mb-2 opacity-80 ${shortage > 0 ? "text-destructive" : "text-primary"}`} />
                                <div className={`text-2xl font-mono font-bold ${shortage > 0 ? "text-destructive" : "text-foreground"}`}>
                                    {shortage}
                                </div>
                                <div className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">Shortages</div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Right: Charts + Logs */}
                <div className="flex flex-col gap-6 lg:col-span-2">
                    <Card className="rounded-none border-border bg-card/50">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="font-mono text-sm tracking-widest uppercase flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-primary" /> Attendance Trajectory
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} fontFamily="monospace" />
                                    <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} fontFamily="monospace" domain={[0, 100]} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--primary)", borderRadius: "0", fontFamily: "monospace", fontSize: "12px" }}
                                        itemStyle={{ color: "var(--primary)" }}
                                    />
                                    <Area type="step" dataKey="present" stroke="var(--primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorPresent)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card className="rounded-none border-border bg-card/50 flex-1">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="font-mono text-sm tracking-widest uppercase text-muted-foreground">
                                Recent Pipeline Logs
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm font-mono text-left">
                                    <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-3 font-normal">Subject</th>
                                            <th className="px-4 py-3 font-normal">Date</th>
                                            <th className="px-4 py-3 font-normal">Status</th>
                                            <th className="px-4 py-3 font-normal text-right">Confidence</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {logs.length > 0 ? logs.map((log) => (
                                            <tr key={log.id} className="hover:bg-primary/5 transition-colors">
                                                <td className="px-4 py-3">{log.subject}</td>
                                                <td className="px-4 py-3 text-muted-foreground">{log.date}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline - flex items - center px - 2 py - 0.5 text - [10px] uppercase tracking - wider ${log.status === "present" ? "bg-primary/10 text-primary border border-primary/20" : "bg-destructive/10 text-destructive border border-destructive/20"} `}>
                                                        {log.status === "present" ? "Face Detected" : "Absent"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-primary">
                                                    {log.confidence_score ? `${log.confidence_score}% ` : "—"}
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-[11px] font-mono uppercase tracking-widest">
                                                    No records found. Start backend to load data.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function UserPlaceholder() {
    return (
        <svg className="w-14 h-14 text-muted-foreground/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
    );
}
