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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Powerful Features</h2>
          <p className="text-gray-400 max-w-xl text-lg">
            Everything you need to manage your AI infrastructure in one place, built for scale.
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((feature) => (
            <div 
              key={feature.title}
              className={`p-6 rounded-xl bg-[#22242f] border border-[#3a3d4f] ${feature.colors.border} ${feature.colors.bg} transition-all duration-300 group`}
            >
              <div className={`w-10 h-10 rounded-lg ${feature.colors.iconBg} flex items-center justify-center mb-4 ${feature.colors.iconText} group-hover:scale-110 transition-transform duration-300`}>
                <span className="material-symbols-outlined">{feature.icon}</span>
              </div>
              <h3 className={`text-lg font-bold mb-2 ${feature.colors.titleHover} transition-colors`}>
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

