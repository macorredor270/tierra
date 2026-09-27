export function Loader({ status, progress, done, error }: { status: string; progress: number; done: boolean; error: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center bg-[radial-gradient(ellipse_at_center,#0b1330_0%,#02030a_70%)] transition-opacity duration-1000 ${done ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <div className="w-[min(320px,80vw)] text-center">
        <div className="relative mx-auto size-16 animate-spin rounded-full border border-white/10 [animation-duration:2.4s]">
          <span className="absolute inset-[26px] rounded-full bg-amber-300 shadow-[0_0_18px_#ffb347]" />
          <span className="absolute -top-1 left-7 size-2 rounded-full bg-accent" />
        </div>
        <h1 className="mt-5 mb-1.5 indent-[0.5em] text-lg font-light tracking-[0.5em]">SISTEMA SOLAR</h1>
        <p className={`mb-3.5 min-h-5 text-sm ${error ? 'text-live' : 'text-muted'}`}>{status}</p>
        <div className="h-0.5 overflow-hidden rounded bg-white/10">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
