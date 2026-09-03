"use client";

export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-[#0b1018]">
      {/* Route-map hairline grid (very faint teal) */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #38d9c8 1px, transparent 1px), linear-gradient(to bottom, #38d9c8 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)",
        }}
      />

      {/* Soft signal glow at the top (teal) */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[900px] h-[480px] bg-teal-500/8 rounded-full blur-[140px]" />

      {/* Faint rising trace line */}
      <div className="absolute inset-x-0 top-1/3" style={{ opacity: 0.18 }}>
        <svg className="w-full h-[2px]" preserveAspectRatio="none" viewBox="0 0 1440 2">
          <path d="M0 1 H1440" stroke="#38d9c8" strokeOpacity="0.35" />
        </svg>
      </div>
    </div>
  );
}
