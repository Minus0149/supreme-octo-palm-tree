"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, CheckCircle2, AlertCircle, Users, Clock, Zap, Timer, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    startClassSession,
    endClassSession,
    getActiveClassSession,
    getSessionStudents,
    classAttendanceSession
} from "@/lib/api";
import { getAuthUser } from "@/app/actions";

const SUBJECTS = [
    { code: "21CS71", name: "Machine Learning" },
    { code: "21CS72", name: "Big Data Analytics" },
    { code: "21CS73", name: "Computer Networks" },
    { code: "21CS74", name: "Cloud Computing" },
];

type StudentTrackingInfo = {
    usn: string;
    name: string;
    status: string;
    confidence: number | null;
    method: string;
};

type SessionState = "loading" | "idle" | "active" | "capturing" | "ended" | "error";

export default function TakeAttendancePage() {
    // Session State
    const [facultyId, setFacultyId] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<number | null>(null);
    const [currentState, setCurrentState] = useState<SessionState>("loading");
    const [selectedSubject, setSelectedSubject] = useState(SUBJECTS[0].code);
    const [students, setStudents] = useState<StudentTrackingInfo[]>([]);

    // Capture State
    const [fullMode, setFullMode] = useState(false);
    const [capturedCount, setCapturedCount] = useState(0);
    const [totalCaptures, setTotalCaptures] = useState(3);
    const [countdown, setCountdown] = useState(0);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Camera Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Initial Load - Check for active sessions
    useEffect(() => {
        async function fetchInitialState() {
            try {
                const user = await getAuthUser();
                if (!user.id || user.role !== "faculty") {
                    setErrorMsg("Invalid faculty access");
                    setCurrentState("error");
                    return;
                }
                setFacultyId(user.id);

                const activeRes = await getActiveClassSession(user.id);
                if (activeRes.session) {
                    setSessionId(activeRes.session.id);
                    setSelectedSubject(activeRes.session.subject_code);
                    setCurrentState("active");
                    await fetchStudentList(activeRes.session.id);
                    enableCamera();
                } else {
                    setCurrentState("idle");
                }
            } catch (err) {
                console.error(err);
                setErrorMsg("Failed to load session state");
                setCurrentState("error");
            }
        }
        fetchInitialState();

        return () => {
            // Cleanup camera on unmount
            streamRef.current?.getTracks().forEach(t => t.stop());
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Student Polling if Active
    useEffect(() => {
        let pollTimer: NodeJS.Timeout;
        if ((currentState === "active" || currentState === "capturing") && sessionId) {
            pollTimer = setInterval(() => {
                fetchStudentList(sessionId);
            }, 5000); // refresh list every 5s
        }
        return () => clearInterval(pollTimer);
    }, [currentState, sessionId]);

    const fetchStudentList = async (sId: number) => {
        try {
            const res = await getSessionStudents(sId);
            setStudents(res.students);
        } catch (e) {
            console.error(e);
        }
    };

    // Camera Functions
    const enableCamera = async () => {
        try {
            if (streamRef.current) return;
            const ms = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: 1280, height: 720 },
            });
            streamRef.current = ms;
            if (videoRef.current) videoRef.current.srcObject = ms;
        } catch {
            setErrorMsg("Could not access camera. Check permissions.");
        }
    };

    const disableCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
    };

    const captureFrame = useCallback((): string | null => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return null;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    }, []);

    // Session Control Functions
    const handleStartSession = async () => {
        if (!facultyId) return;
        setCurrentState("loading");
        try {
            const res = await startClassSession(selectedSubject, facultyId);
            setSessionId(res.session_id);
            setCurrentState("active");
            await fetchStudentList(res.session_id);
            await enableCamera();
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "Failed to start session");
            setCurrentState("idle");
        }
    };

    const handleEndSession = async () => {
        if (!sessionId) return;
        setCurrentState("loading");
        try {
            disableCamera();
            if (intervalRef.current) clearInterval(intervalRef.current);
            await endClassSession(sessionId);
            setCurrentState("ended");
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "Failed to end session");
            setCurrentState("active");
        }
    };

    const runCaptureSequence = useCallback(async () => {
        if (!sessionId) return;
        const numPhotos = fullMode ? 60 : 3;
        const intervalMs = fullMode ? 60000 : 8000;
        setTotalCaptures(numPhotos);
        setCapturedCount(0);
        setCurrentState("capturing");
        setErrorMsg(null);

        const photos: string[] = [];

        // Immediate First Photo
        const first = captureFrame();
        if (first) photos.push(first);
        setCapturedCount(1);

        let count = 1;
        const secTotal = Math.round(intervalMs / 1000);
        setCountdown(secTotal);

        const countdownInterval = setInterval(() => {
            setCountdown(prev => prev <= 1 ? secTotal : prev - 1);
        }, 1000);

        intervalRef.current = setInterval(() => {
            count++;
            const frame = captureFrame();
            if (frame) photos.push(frame);
            setCapturedCount(count);

            if (count >= numPhotos) {
                clearInterval(intervalRef.current!);
                clearInterval(countdownInterval);
                intervalRef.current = null;
                setCountdown(0);
                submitPhotos(sessionId, photos);
            }
        }, intervalMs);

        // Return a cleaner in case we want to stop early
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            clearInterval(countdownInterval);
        };
    }, [fullMode, captureFrame, sessionId]);

    const submitPhotos = async (sId: number, photos: string[]) => {
        setCurrentState("loading");
        try {
            await classAttendanceSession(sId, photos);
            await fetchStudentList(sId);
            setCurrentState("active"); // Go back to active live view
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "Capture processing failed");
            setCurrentState("active");
        }
    };

    const stopCaptureEarly = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setCurrentState("active");
        setCapturedCount(0);
    };

    const resetToIdle = () => {
        setSessionId(null);
        setStudents([]);
        setCurrentState("idle");
    };

    // Derived Student Stats
    const totalStudents = students.length;
    const presentStudents = students.filter(s => s.status === "present");
    const absentStudents = students.filter(s => s.status === "absent");

    return (
        <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-overlay pointer-events-none"></div>

            <header className="mb-8 flex justify-between items-end border-b border-border pb-4 relative z-10">
                <div>
                    <h1 className="text-3xl font-mono font-bold tracking-tight uppercase text-primary flex items-center gap-3">
                        <Camera className="w-8 h-8" /> Live Attendance
                    </h1>
                    <p className="text-muted-foreground font-mono text-sm tracking-widest mt-1">
                        Session-based classroom tracking
                    </p>
                </div>
                {(currentState === "active" || currentState === "capturing") && (
                    <div className="text-right flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-4xl font-mono font-bold text-primary">{presentStudents.length} / {totalStudents}</div>
                            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Total Present</div>
                        </div>
                        <Button variant="destructive" onClick={handleEndSession} className="h-12 rounded-none uppercase font-mono tracking-wider ml-4">
                            END CLASS
                        </Button>
                    </div>
                )}
            </header>

            <div className="relative z-10 space-y-6">

                {/* IDLE STATE */}
                {currentState === "idle" && (
                    <div className="max-w-xl mx-auto mt-24">
                        <Card className="rounded-none border-primary/20 bg-card/80 backdrop-blur">
                            <CardHeader className="pb-3 border-b border-border/50">
                                <CardTitle className="text-sm font-mono uppercase tracking-widest text-primary/80">
                                    Start New Class Session
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-6">
                                <div>
                                    <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2 block">Select Subject</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {SUBJECTS.map(s => (
                                            <button
                                                key={s.code}
                                                onClick={() => setSelectedSubject(s.code)}
                                                className={`px-3 py-4 flex flex-col items-start gap-1 text-xs font-mono border transition-colors ${selectedSubject === s.code
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border text-muted-foreground hover:border-primary/50"
                                                    }`}
                                            >
                                                <span className="font-bold text-sm tracking-wider">{s.code}</span>
                                                <span className="opacity-70">{s.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <Button onClick={handleStartSession} className="w-full h-14 rounded-none uppercase font-mono tracking-widest text-lg">
                                    Start Class
                                </Button>
                                {errorMsg && <p className="text-destructive font-mono text-xs text-center">{errorMsg}</p>}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* LOADING STATE */}
                {currentState === "loading" && (
                    <div className="flex flex-col items-center justify-center py-32">
                        <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="font-mono text-primary uppercase tracking-widest">Processing...</p>
                    </div>
                )}

                {/* ACTIVE STAGES */}
                {(currentState === "active" || currentState === "capturing") && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* LEFT COLUMN: CAMERA & CONTROLS */}
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="rounded-none border-primary/20 bg-card/80 backdrop-blur overflow-hidden">
                                <div className="relative aspect-video bg-black">
                                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                    <canvas ref={canvasRef} className="hidden" />

                                    {currentState === "capturing" && (
                                        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                                                    <span className="text-white font-mono text-sm uppercase tracking-widest">
                                                        Recording · {selectedSubject}
                                                    </span>
                                                </div>
                                                <div className="text-white font-mono text-sm">
                                                    {capturedCount}/{totalCaptures} captured
                                                </div>
                                            </div>
                                            <div className="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
                                                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(capturedCount / totalCaptures) * 100}%` }} />
                                            </div>
                                            {countdown > 0 && (
                                                <div className="mt-2 text-center text-white/70 font-mono text-xs">
                                                    Next capture in {countdown}s
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {errorMsg && (
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-destructive/90 text-destructive-foreground px-4 py-2 font-mono text-xs border border-destructive">
                                            {errorMsg}
                                        </div>
                                    )}
                                </div>
                            </Card>

                            {/* CAMERA CONTROLS */}
                            <div className="grid grid-cols-2 gap-4">
                                {currentState === "active" ? (
                                    <>
                                        <Button onClick={() => { setFullMode(false); runCaptureSequence(); }} disabled={currentState !== "active"} className="h-16 rounded-none flex items-center justify-start px-6 bg-primary/10 border border-primary/50 text-primary hover:bg-primary/20">
                                            <Zap className="mr-4 w-6 h-6" />
                                            <div className="text-left">
                                                <div className="uppercase font-mono tracking-widest text-sm">Quick Scan</div>
                                                <div className="text-[10px] font-sans opacity-70">3 frames · 24s</div>
                                            </div>
                                        </Button>
                                        <Button onClick={() => { setFullMode(true); runCaptureSequence(); }} disabled={currentState !== "active"} className="h-16 rounded-none flex items-center justify-start px-6 bg-primary/10 border border-primary/50 text-primary hover:bg-primary/20">
                                            <Timer className="mr-4 w-6 h-6" />
                                            <div className="text-left">
                                                <div className="uppercase font-mono tracking-widest text-sm">Continuous Scan</div>
                                                <div className="text-[10px] font-sans opacity-70">60 frames · 60m</div>
                                            </div>
                                        </Button>
                                    </>
                                ) : (
                                    <Button onClick={stopCaptureEarly} variant="destructive" className="h-16 col-span-2 rounded-none font-mono uppercase tracking-widest text-lg">
                                        Stop Capture Sequence
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: LIVE ROSTER */}
                        <div className="lg:col-span-1 border border-primary/20 bg-background/50 h-[calc(100vh-12rem)] flex flex-col">
                            <div className="p-4 border-b border-primary/20 bg-card">
                                <h2 className="font-mono text-sm uppercase tracking-widest text-primary flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Live Roster
                                </h2>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                {/* Present List */}
                                <div>
                                    <h3 className="font-mono text-xs text-primary/70 mb-3 border-b border-primary/10 pb-1">PRESENT ({presentStudents.length})</h3>
                                    <div className="space-y-2">
                                        {presentStudents.map(s => (
                                            <div key={s.usn} className="flex justify-between items-center bg-primary/5 border border-primary/10 p-2">
                                                <div>
                                                    <div className="font-mono text-sm text-primary">{s.name}</div>
                                                    <div className="text-[10px] text-muted-foreground">{s.usn}</div>
                                                </div>
                                                <CheckCircle2 className="w-4 h-4 text-primary" />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Absent List */}
                                <div>
                                    <h3 className="font-mono text-xs text-destructive/70 mb-3 border-b border-destructive/10 pb-1">ABSENT / PENDING ({absentStudents.length})</h3>
                                    <div className="space-y-2">
                                        {absentStudents.map(s => (
                                            <div key={s.usn} className="flex justify-between items-center bg-destructive/5 border border-destructive/10 p-2 opacity-60 hover:opacity-100 transition-opacity">
                                                <div>
                                                    <div className="font-mono text-sm">{s.name}</div>
                                                    <div className="text-[10px] text-muted-foreground">{s.usn}</div>
                                                </div>
                                                <XCircle className="w-4 h-4 text-destructive" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                )}

                {/* ENDED STATE */}
                {currentState === "ended" && (
                    <div className="max-w-2xl mx-auto mt-24">
                        <Card className="rounded-none border-primary/20 bg-card/80 backdrop-blur text-center">
                            <CardContent className="pt-12 pb-12 space-y-6">
                                <CheckCircle2 className="w-16 h-16 text-primary mx-auto mb-4" />
                                <h2 className="text-2xl font-mono uppercase tracking-widest text-primary">Session Completed</h2>
                                <p className="text-muted-foreground font-mono">
                                    Final Attendance: {presentStudents.length} / {totalStudents} Present
                                </p>
                                <Button onClick={resetToIdle} className="mt-8 rounded-none uppercase font-mono tracking-widest px-8">
                                    Start Another Class
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
