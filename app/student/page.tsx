"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, CheckCircle2, AlertCircle, BarChart3, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getFaceStatus, uploadFaceFrames, getAttendanceSummary, getRecentLogs } from "@/lib/api";
import { getAuthUser } from "@/app/actions";
import { initializeFaceDetection, detectFace, type FaceDetectionResult } from "@/lib/face-detect";

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
    const [detectionFeedback, setDetectionFeedback] = useState<FaceDetectionResult | null>(null);
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
    const [selectedCamera, setSelectedCamera] = useState<string>("");

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Initialize face detection on mount
    useEffect(() => {
        initializeFaceDetection();

        // Get available cameras
        navigator.mediaDevices.enumerateDevices().then(devices => {
            const videoImputs = devices.filter(d => d.kind === 'videoinput');
            setCameras(videoImputs);
            if (videoImputs.length > 0) setSelectedCamera(videoImputs[0].deviceId);
        }).catch(console.error);
    }, []);

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
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        try {
            const constraints: MediaStreamConstraints = {
                video: selectedCamera
                    ? { deviceId: { exact: selectedCamera }, width: 640, height: 480 }
                    : { facingMode: "user", width: 640, height: 480 }
            };
            const ms = await navigator.mediaDevices.getUserMedia(constraints);
            setStream(ms);
            if (videoRef.current) videoRef.current.srcObject = ms;
            setDetectionFeedback(null);
        } catch {
            alert("Could not access camera. Check browser permissions.");
        }
    };

    // Detection loop when camera is on but not strictly registering
    useEffect(() => {
        let active = true;
        let animationFrame: number;

        const loop = async () => {
            if (!videoRef.current || !stream || !active) return;
            // Only detect if video is playing
            if (videoRef.current.readyState === 4 && !isRegistering) {
                const res = await detectFace(videoRef.current);
                setDetectionFeedback(res);
            }
            if (active) {
                animationFrame = requestAnimationFrame(loop);
            }
        };

        if (stream && !isRegistering) {
            loop();
        }

        return () => {
            active = false;
            cancelAnimationFrame(animationFrame);
        };
    }, [stream, isRegistering]);

    const startCaptureSequence = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current || !stream) return;

        // Ensure models are loaded
        const isLoaded = await initializeFaceDetection();
        if (!isLoaded) {
            setUploadError("Face detection models failed to load.");
            return;
        }

        setIsRegistering(true);
        setUploadError(null);
        setCaptureCount(0);
        setScanStep(0);
        setDetectionFeedback(null);

        const ctx = canvasRef.current.getContext("2d");
        const blobs: Blob[] = [];
        const totalFrames = 30;
        const framesPerStep = Math.floor(totalFrames / SCAN_STEPS.length);

        let count = 0;

        await new Promise<void>((resolve) => {
            const captureLoop = async () => {
                if (count >= totalFrames) {
                    resolve();
                    return;
                }

                if (!videoRef.current || !ctx || !canvasRef.current) return;

                // Validate face before capturing
                const res = await detectFace(videoRef.current);
                setDetectionFeedback(res);

                if (res.status === 'ok') {
                    // Flash effect could be added here
                    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

                    const blob = await new Promise<Blob | null>(res => canvasRef.current!.toBlob(res, "image/jpeg", 0.9));
                    if (blob) {
                        blobs.push(blob);
                        count++;
                        setCaptureCount(count);
                        setScanStep(Math.min(Math.floor(count / framesPerStep), SCAN_STEPS.length - 1));
                    }
                }

                // Small delay to prevent capturing exact exact same frame and let user adjust
                setTimeout(captureLoop, res.status === 'ok' ? 250 : 100);
            };

            captureLoop();
        });

        // Upload to backend
        try {
            if (!usn) throw new Error("User ID missing");
            await uploadFaceFrames(usn, blobs);
            setFaceStatus("pending");

            // Stop camera on success
            stream?.getTracks().forEach(t => t.stop());
            setStream(null);
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : "Upload failed");
            setIsRegistering(false); // Let them try again
        }
    }, [stream, usn]);

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
                                    <div className="relative w-full aspect-[3/4] max-w-[280px] mx-auto overflow-hidden bg-black/90 rounded-2xl shadow-2xl ring-1 ring-border/50">
                                        <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${(stream && (!detectionFeedback || detectionFeedback.status === 'ok')) ? 'opacity-100' : 'opacity-50'} transition-opacity duration-300 ${stream ? "block" : "hidden"}`} />

                                        {!stream && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <UserPlaceholder />
                                            </div>
                                        )}

                                        {/* Dynamic Oval Overlay */}
                                        {stream && (
                                            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center px-4">
                                                <div
                                                    className={`w-full aspect-[3/4] max-h-[70%] rounded-[100%] border-[3px] transition-colors duration-300 ${!detectionFeedback ? 'border-dashed border-white/30' :
                                                            detectionFeedback.status === 'ok' ? 'border-solid border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)] inset-0' :
                                                                'border-dashed border-yellow-500 opacity-60'
                                                        }`}
                                                >
                                                    {/* Darken area outside oval (using a mask approach) */}
                                                    <div className="absolute inset-[-100%] shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.4)] mix-blend-multiply rounded-[100%] pointer-events-none"></div>
                                                </div>

                                                {/* HUD Feedback */}
                                                <div className="absolute top-8 left-0 right-0 text-center px-4">
                                                    <span className={`inline-block px-3 py-1 text-[11px] font-mono uppercase tracking-widest rounded-full backdrop-blur-md ${!detectionFeedback ? 'bg-black/50 text-white/70' :
                                                            detectionFeedback.status === 'ok' ? 'bg-green-500/20 text-green-400 border border-green-500/50' :
                                                                'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50'
                                                        }`}>
                                                        {detectionFeedback ? detectionFeedback.message : 'Position your face'}
                                                    </span>
                                                </div>

                                                {isRegistering && (
                                                    <div className="absolute bottom-8 left-0 right-0 text-center">
                                                        <div className="inline-flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-white/10">
                                                            <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                                                            <span className="text-white font-mono text-[10px]">
                                                                {captureCount}/30
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
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

                                    {/* Controls */}
                                    <div className="space-y-3">
                                        {!stream && cameras.length > 1 && (
                                            <select
                                                value={selectedCamera}
                                                onChange={e => setSelectedCamera(e.target.value)}
                                                className="w-full bg-background border border-border text-xs font-mono p-2 rounded-none focus:outline-none"
                                            >
                                                {cameras.map(c => (
                                                    <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>
                                                ))}
                                            </select>
                                        )}

                                        {stream ? (
                                            <Button
                                                onClick={startCaptureSequence}
                                                disabled={isRegistering || (detectionFeedback?.status !== 'ok')}
                                                className={`w-full rounded-none font-mono text-xs ${detectionFeedback?.status === 'ok' && !isRegistering ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                                                variant={detectionFeedback?.status === 'ok' && !isRegistering ? 'default' : 'secondary'}
                                            >
                                                {isRegistering ? "CAPTURING..." : detectionFeedback?.status !== 'ok' ? "ALIGN FACE TO START" : "▶ START SCAN"}
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
