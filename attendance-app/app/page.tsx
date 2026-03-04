import Link from "next/link";
import { Terminal } from "lucide-react";

export default function Home() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative h-full">
            <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay pointer-events-none"></div>

            <div className="max-w-md w-full border border-primary/20 bg-card p-8 shadow-[0_0_30px_rgba(20,180,180,0.1)] relative z-10 backdrop-blur-sm">
                <div className="flex items-center gap-3 mb-6 text-primary border-b border-primary/20 pb-4">
                    <Terminal className="w-8 h-8" />
                    <h1 className="text-2xl font-bold tracking-wider font-mono">A.I.R.S INIT</h1>
                </div>

                <div className="space-y-4 font-mono text-sm text-foreground/80 mb-8">
                    <p>{`> Loading security protocols... OK`}</p>
                    <p>{`> Initializing facial recognition models... OK`}</p>
                    <p>{`> Connecting to RTSP streams [12/12]... OK`}</p>
                    <p className="text-primary animate-pulse">{`> System ready. Awaiting user authentication.`}</p>
                </div>

                <Link
                    href="/login"
                    className="block w-full text-center bg-primary text-primary-foreground py-3 font-bold tracking-widest hover:bg-primary/80 transition-all border border-transparent hover:border-primary/50 shadow-[0_0_15px_rgba(20,180,180,0.4)] uppercase"
                >
                    ENTER SYSTEM
                </Link>
            </div>
        </div>
    );
}