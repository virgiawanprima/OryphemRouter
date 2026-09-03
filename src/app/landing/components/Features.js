"use client";

const FEATURES = [
  { icon: "link", title: "Unified Endpoint", desc: "All providers behind one standard API URL." },
  { icon: "bolt", title: "Instant Setup", desc: "Running in minutes with a single npx command." },
  { icon: "shield_with_heart", title: "Model Fallback", desc: "Switch provider on failure or high latency." },
  { icon: "monitoring", title: "Usage Tracking", desc: "Cost and latency analytics across every model." },
  { icon: "key", title: "OAuth & API Keys", desc: "Every credential, one secure vault." },
  { icon: "cloud_sync", title: "Cloud Sync", desc: "Config that follows you across devices." },
  { icon: "terminal", title: "CLI Support", desc: "Claude Code, Codex, Cline, Cursor and more." },
  { icon: "dashboard", title: "Dashboard", desc: "Real-time traffic, one glance." },
];

export default function Features() {
  return (
    <section className="py-24 px-6" id="features">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16">
          <p className="font-mono uppercase tracking-[0.22em] text-[11px] text-[#38d9c8] mb-4">Capabilities</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">One gateway, every provider</h2>
          <p className="text-gray-400 max-w-xl text-lg">
            The routing layer keeps orchestration out of your code, so you stay on one API.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.concat([]).map((feature, i) => (
            <div
              key={feature.title}
              className={`p-6 rounded-xl border border-[#2a3947] bg-[#121a26] ${i === 7 ? "bg-teal-400/5 border-teal-400/25" : ""} group transition-all duration-300`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-teal-400/10 flex items-center justify-center mb-0 text-teal-400 group-hover:scale-110 transition-transform duration-300">
                  <span className="material-symbols-outlined">{feature.icon}</span>
                </div>
              </div>
              <h3 className="text-lg font-bold mb-2 text-white group-hover:text-teal-300 transition-colors">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
