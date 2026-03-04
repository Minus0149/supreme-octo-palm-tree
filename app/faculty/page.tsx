"use client";

import { useState, useEffect, useRef } from "react";
import { Camera, AlertTriangle, Play, Pause, Settings, Maximize, AlertCircle, Users, CheckCircle, Eye, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDefaulters, getPendingRegistrations, reviewFaceSamples, getStudentFrames, getFrameUrl } from "@/lib/api";

const mockCameras = [
    { id: "CAM-101", room: "CS Lab 1", status: "online", activeFaces: 42, live: true },
    { id: "CAM-102", room: "CS Lab 2", status: "online", activeFaces: 38, live: false },
    { id: "CAM-201", room: "LH 1", status: "offline", activeFaces: 0, live: false },
    { id: "CAM-205", room: "LH 5", status: "online", activeFaces: 55, live: false },
];

type Defaulter = { student_id: number; usn: string; name: string; attendance_percentage: number; shortage: number };
type PendingReg = { student_id: number; usn: string; name: string; dept: string; sample_count: number; uploaded_at: string };

export default function FacultyDashboard() {
    const [isPlaying, setIsPlaying] = useState(true);
    const [defaultersList, setDefaultersList] = useState<Defaulter[]>([]);
    const [pendingRegs, setPendingRegs] = useState<PendingReg[]>([]);
    const [reviewingId, setReviewingId] = useState<number | null>(null);
    const [previewUsn, setPreviewUsn] = useState<string | null>(null);
    const [previewFrames, setPreviewFrames] = useState<string[]>([]);
    const [loadingFrames, setLoadingFrames] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Start/stop live camera when isPlaying toggles
    useEffect(() => {
        if (isPlaying) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 640, height: 480 } })
                .then(ms => {
                    streamRef.current = ms;
                    if (videoRef.current) videoRef.current.srcObject = ms;
                })
                .catch(() => { /* camera denied */ });
        } else {
            streamRef.current?.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, [isPlaying]);

    useEffect(() => {
        getDefaulters().then(setDefaultersList).catch(() => { });
        getPendingRegistrations().then(setPendingRegs).catch(() => { });
    }, []);

    const handleReview = async (studentId: number, action: "approve" | "reject") => {
        setReviewingId(studentId);
        try {
            await reviewFaceSamples(studentId, action);
            setPendingRegs(prev => prev.filter(r => r.student_id !== studentId));
            setPreviewUsn(null);
            setPreviewFrames([]);
        } catch {
            // handle silently
        } finally {
            setReviewingId(null);
        }
    };

    const handleViewFrames = async (usn: string) => {
        if (previewUsn === usn) {
            setPreviewUsn(null);
            setPreviewFrames([]);
            return;
        }
        setLoadingFrames(true);
        setPreviewUsn(usn);
        try {
            const data = await getStudentFrames(usn);
            setPreviewFrames(data.frames);
        } catch {
            setPreviewFrames([]);
        }
        setLoadingFrames(false);
    };

    return (
        <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-[0.03] mix-blend-overlay pointer-events-none"></div>

            <header className="mb-8 flex justify-between items-end border-b border-border pb-4 relative z-10">
                <div>
                    <h1 className="text-3xl font-mono font-bold tracking-tight uppercase text-primary">Faculty Monitor</h1>
                    <p className="text-muted-foreground font-mono text-sm tracking-widest mt-1">ID: FAC-205 | ROLE: ADMIN | DEPT: CS</p>
                </div>
                <div className="flex gap-4">
                    <div className="text-right border-r border-border pr-4">
                        <div className="text-2xl font-mono font-bold text-primary">3/4</div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Active Feeds</div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-mono font-bold text-destructive">{defaultersList.length}</div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Defaulters</div>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 relative z-10">
                {/* Left: CCTV Grid */}
                <div className="lg:col-span-3 space-y-4">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="font-mono text-sm tracking-widest uppercase flex items-center gap-2 text-primary">
                            <Camera className="w-4 h-4" /> Live Surveillance Node
                        </h2>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="rounded-none h-8 font-mono text-xs text-muted-foreground border-border" onClick={() => setIsPlaying(!isPlaying)}>
                                {isPlaying ? <Pause className="w-3 h-3 mr-2" /> : <Play className="w-3 h-3 mr-2" />}
                                {isPlaying ? 'SUSPEND' : 'RESUME'}
                            </Button>
                            <Button variant="outline" size="icon" className="rounded-none h-8 w-8 text-muted-foreground border-border">
                                <Settings className="w-3 h-3" />
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {mockCameras.map((cam) => (
                            <div key={cam.id} className="relative aspect-video border border-border bg-black/80 overflow-hidden group">
                                <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                                    <div className="bg-black/80 text-white font-mono text-[10px] px-2 py-0.5 uppercase border border-white/20">
                                        {cam.id} - {cam.room}
                                    </div>
                                    <div className="flex items-center gap-1 bg-black/80 px-2 py-0.5 w-fit border border-white/20">
                                        <span className={`w-1.5 h-1.5 rounded-full ${cam.status === 'online' ? 'bg-primary animate-pulse' : 'bg-destructive'}`}></span>
                                        <span className="text-[9px] font-mono uppercase text-white/80">{cam.status}</span>
                                    </div>
                                </div>

                                {cam.status === 'online' ? (
                                    <>
                                        {/* Live camera feed for CAM-101, simulated for others */}
                                        {cam.live ? (
                                            <video
                                                ref={videoRef}
                                                autoPlay playsInline muted
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className={`w-full h-full bg-[linear-gradient(rgba(20,180,180,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(20,180,180,0.05)_1px,transparent_1px)] bg-[size:10px_10px] ${isPlaying ? 'animate-[pulse_4s_infinite]' : ''}`}>
                                                {isPlaying && (
                                                    <div className="absolute inset-0 pointer-events-none flex justify-center items-center">
                                                        <div className="relative w-1/4 h-1/3 border border-primary/50 shadow-[0_0_10px_rgba(20,180,180,0.2)]">
                                                            <div className="absolute -top-4 left-0 text-[8px] font-mono text-primary bg-black/80 px-1 border border-primary/50">99.2%</div>
                                                            <div className="w-full h-[1px] bg-primary/30 absolute top-1/2 -translate-y-1/2 animate-[scan_2s_ease-in-out_infinite]"></div>
                                                        </div>
                                                        <div className="relative w-1/5 h-1/4 border border-primary/30 ml-8 mt-12 shadow-[0_0_10px_rgba(20,180,180,0.1)]">
                                                            <div className="absolute -top-4 left-0 text-[8px] font-mono text-primary bg-black/80 px-1 border border-primary/30">94.5%</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {/* Face detection overlay for live feed */}
                                        {cam.live && isPlaying && (
                                            <div className="absolute inset-0 pointer-events-none">
                                                <div className="absolute top-[25%] left-[35%] w-[18%] h-[35%] border border-primary/60 shadow-[0_0_10px_rgba(20,180,180,0.3)]">
                                                    <div className="absolute -top-4 left-0 text-[8px] font-mono text-primary bg-black/80 px-1 border border-primary/50">SCANNING</div>
                                                    <div className="w-full h-[1px] bg-primary/40 absolute top-1/2 -translate-y-1/2 animate-[scan_2s_ease-in-out_infinite]"></div>
                                                </div>
                                            </div>
                                        )}
                                        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-primary/20 text-primary font-mono text-[10px] px-2 py-0.5 border border-primary/30 backdrop-blur-sm">
                                            <Users className="w-3 h-3" /> {cam.activeFaces} Detected
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                                        <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                                        <span className="font-mono text-[10px] uppercase tracking-widest">Signal Lost</span>
                                    </div>
                                )}

                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="outline" size="icon" className="h-6 w-6 rounded-none bg-black/50 border-white/20 text-white hover:text-primary">
                                        <Maximize className="w-3 h-3" />
                                    </Button>
                                </div>

                                {/* CRT Scanline effect */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] pointer-events-none opacity-50 mix-blend-overlay"></div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Actions & Defaulters */}
                <div className="space-y-6">
                    <Card className="rounded-none border-border bg-card/50">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="font-mono text-sm tracking-widest uppercase flex items-center gap-2 text-destructive">
                                <AlertCircle className="w-4 h-4" /> Attention Required
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 p-0">
                            <div className="divide-y divide-border/50">
                                {defaultersList.map((d, i) => (
                                    <div key={i} className="p-4 hover:bg-destructive/5 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="font-mono text-sm font-bold">{d.name}</p>
                                                <p className="font-mono text-[10px] text-muted-foreground">{d.usn}</p>
                                            </div>
                                            <span className="font-mono text-xs font-bold text-destructive bg-destructive/10 px-2 border border-destructive/20">{d.attendance_percentage}%</span>
                                        </div>
                                        <div className="flex gap-2 mt-3">
                                            <Button className="flex-1 h-7 rounded-none text-[10px] font-mono tracking-widest hover:bg-destructive hover:text-destructive-foreground" variant="outline">
                                                Notify
                                            </Button>
                                            <Button className="flex-1 h-7 rounded-none text-[10px] font-mono tracking-widest" variant="outline">
                                                Override
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-none border-primary/20 border bg-primary/5">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="font-mono text-sm tracking-widest uppercase flex items-center gap-2 text-primary">
                                <Users className="w-4 h-4" /> Registration Review
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 p-0">
                            <div className="divide-y divide-border/50">
                                {pendingRegs.length === 0 && (
                                    <p className="p-4 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">No pending registrations.</p>
                                )}
                                {pendingRegs.map((s) => (
                                    <div key={s.student_id} className="p-4 hover:bg-primary/10 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="font-mono text-sm font-bold">{s.name}</p>
                                                <p className="font-mono text-[10px] text-muted-foreground">{s.usn} — {s.sample_count} frames</p>
                                            </div>
                                            <span className="font-mono text-[10px] uppercase text-primary border border-primary/30 px-1">Pending</span>
                                        </div>

                                        {/* View Frames Button */}
                                        <Button
                                            onClick={() => handleViewFrames(s.usn)}
                                            variant="outline"
                                            className="w-full h-7 rounded-none text-[10px] font-mono tracking-widest mb-2 text-primary border-primary/30"
                                        >
                                            {previewUsn === s.usn ? <X className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                                            {previewUsn === s.usn ? "Hide Frames" : "View Frames"}
                                        </Button>

                                        {/* Frame Gallery */}
                                        {previewUsn === s.usn && (
                                            <div className="mb-3">
                                                {loadingFrames ? (
                                                    <div className="text-center py-3">
                                                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                                                    </div>
                                                ) : previewFrames.length > 0 ? (
                                                    <div className="grid grid-cols-5 gap-1 max-h-[200px] overflow-y-auto border border-border p-1 bg-black/50">
                                                        {previewFrames.map((frame, i) => (
                                                            <img
                                                                key={i}
                                                                src={getFrameUrl(s.usn, frame)}
                                                                alt={`Frame ${i + 1}`}
                                                                className="w-full aspect-square object-cover border border-primary/20 hover:border-primary/60 transition-colors cursor-pointer"
                                                                title={`Frame ${i + 1}: ${frame}`}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-[9px] font-mono text-muted-foreground text-center py-2">No frames uploaded yet</p>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            <Button
                                                onClick={() => handleReview(s.student_id, "approve")}
                                                disabled={reviewingId === s.student_id}
                                                className="flex-1 h-7 rounded-none text-[10px] font-mono tracking-widest hover:bg-primary hover:text-primary-foreground text-primary"
                                                variant="outline"
                                            >
                                                {reviewingId === s.student_id ? "..." : "Approve"}
                                            </Button>
                                            <Button
                                                onClick={() => handleReview(s.student_id, "reject")}
                                                disabled={reviewingId === s.student_id}
                                                className="flex-1 h-7 rounded-none text-[10px] font-mono tracking-widest text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/50"
                                                variant="outline"
                                            >
                                                Reject
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
