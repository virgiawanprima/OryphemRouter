"use client";

// Oryphem reference design — global UI effects for the dashboard:
// custom cursor (dot + ring), scroll progress bar, back-to-top button,
// reveal-on-scroll and a UI customizer (font size, accent color, radius,
// layout width, animations).

import { useEffect, useRef, useState } from "react";

const ACCENT_OPTIONS = [
  { id: "dracula", label: "Dracula", color: "#bd93f9", colors: { "500": "#bd93f9", "700": "#7c54d6", "800": "#5c3ea8", "600": "#9a6ff0" } },
  { id: "pink", label: "Pink", color: "#ff79c6", colors: { "500": "#ff79c6", "700": "#e060a0", "800": "#c04080", "600": "#ff95d5" } },
  { id: "cyan", label: "Cyan", color: "#8be9fd", colors: { "500": "#8be9fd", "700": "#5ec8e0", "800": "#3da0c0", "600": "#a0f0ff" } },
  { id: "green", label: "Green", color: "#50fa7b", colors: { "500": "#50fa7b", "700": "#3ad060", "800": "#28a048", "600": "#6aff95" } },
  { id: "amber", label: "Amber", color: "#ffb86c", colors: { "500": "#ffb86c", "700": "#e09840", "800": "#c07820", "600": "#ffc888" } },
];

export default function UIFx() {
  const [showBackTop, setShowBackTop] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const initializedRef = useRef(false);

  // Custom cursor
  useEffect(() => {
    const dot = document.getElementById("cursor-dot");
    const ring = document.getElementById("cursor-ring");
    if (!dot || !ring) return;
    if (!window.matchMedia || !window.matchMedia("(hover: hover)").matches) return;

    let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;
    let rafId = null;
    const onMove = (e) => {
      mouseX = e.clientX; mouseY = e.clientY;
      dot.style.left = `${mouseX}px`;
      dot.style.top = `${mouseY}px`;
    };
    const animate = () => {
      ringX += (mouseX - ringX) * 0.12;
      ringY += (mouseY - ringY) * 0.12;
      ring.style.left = `${ringX}px`;
      ring.style.top = `${ringY}px`;
      rafId = requestAnimationFrame(animate);
    };
    document.addEventListener("mousemove", onMove);
    rafId = requestAnimationFrame(animate);

    const onEnter = () => document.body.classList.add("cursor-link");
    const onLeave = () => document.body.classList.remove("cursor-link");
    document.querySelectorAll("a, button, [role='button'], select, input[type='checkbox']").forEach((el) => {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
    });

    return () => {
      document.removeEventListener("mousemove", onMove);
      if (rafId) cancelAnimationFrame(rafId);
      document.querySelectorAll("a, button, [role='button'], select, input[type='checkbox']").forEach((el) => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
      });
    };
  }, []);

  // Scroll progress + back-to-top + reveal
  useEffect(() => {
    const progress = document.getElementById("scroll-progress");
    const backTop = document.getElementById("back-top");

    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (progress) progress.style.width = (docHeight > 0 ? (scrollTop / docHeight) * 100 : 0) + "%";
      setShowBackTop(scrollTop > 400);
    };
    // The dashboard scrolls inside <main>, so also observe the main container.
    const main = document.querySelector("main");
    const onMainScroll = () => {
      if (!main) return;
      const scrollTop = main.scrollTop;
      const docHeight = main.scrollHeight - main.clientHeight;
      if (progress) progress.style.width = (docHeight > 0 ? (scrollTop / docHeight) * 100 : 0) + "%";
      setShowBackTop(scrollTop > 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (main) main.addEventListener("scroll", onMainScroll, { passive: true });
    onScroll(); onMainScroll();

    // Reveal on scroll — observe elements inside main as well as window.
    const revealEls = document.querySelectorAll(".reveal");
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    revealEls.forEach((el) => revealObserver.observe(el));

    const mainObserver = main ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          mainObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 }) : null;
    if (mainObserver) revealEls.forEach((el) => mainObserver.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (main) main.removeEventListener("scroll", onMainScroll);
      revealObserver.disconnect();
      if (mainObserver) mainObserver.disconnect();
    };
  }, []);

  // Restore customizer prefs (font size, accent, radius, layout, animations)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    try {
      const root = document.documentElement;
      const fs = localStorage.getItem("oryphem:fontSize");
      if (fs) { root.style.fontSize = `${fs}%`; }
      const accent = localStorage.getItem("oryphem:accent");
      if (accent) {
        const opt = ACCENT_OPTIONS.find((a) => a.id === accent);
        if (opt) {
          Object.entries(opt.colors).forEach(([shade, color]) => {
            root.style.setProperty(`--color-brand-${shade}`, color);
          });
        }
      }
      const radius = localStorage.getItem("oryphem:radius");
      if (radius === "sharp") {
        root.style.setProperty("--radius-brand", "0px");
        root.style.setProperty("--radius-brand-lg", "0px");
      } else if (radius === "round") {
        root.style.setProperty("--radius-brand", "20px");
        root.style.setProperty("--radius-brand-lg", "28px");
      }
      const layout = localStorage.getItem("oryphem:layout");
      if (layout === "wide") document.body.classList.add("layout-wide");
      if (layout === "compact") document.body.classList.add("layout-compact");
      const anim = localStorage.getItem("oryphem:animations");
      if (anim === "off") document.body.classList.add("no-anim");
    } catch { /* ignore */ }
  }, []);

  const setFontSize = (delta) => {
    const root = document.documentElement;
    const current = parseInt(root.style.fontSize || "100", 10);
    const next = Math.max(80, Math.min(130, current + delta));
    root.style.fontSize = `${next}%`;
    localStorage.setItem("oryphem:fontSize", String(next));
  };

  const setAccent = (id) => {
    const opt = ACCENT_OPTIONS.find((a) => a.id === id);
    if (!opt) return;
    const root = document.documentElement;
    Object.entries(opt.colors).forEach(([shade, color]) => {
      root.style.setProperty(`--color-brand-${shade}`, color);
    });
    localStorage.setItem("oryphem:accent", id);
  };

  const setRadius = (type) => {
    const root = document.documentElement;
    if (type === "sharp") {
      root.style.setProperty("--radius-brand", "0px");
      root.style.setProperty("--radius-brand-lg", "0px");
    } else if (type === "round") {
      root.style.setProperty("--radius-brand", "20px");
      root.style.setProperty("--radius-brand-lg", "28px");
    } else {
      root.style.setProperty("--radius-brand", "12px");
      root.style.setProperty("--radius-brand-lg", "20px");
    }
    localStorage.setItem("oryphem:radius", type);
  };

  const setLayout = (type) => {
    document.body.classList.toggle("layout-wide", type === "wide");
    document.body.classList.toggle("layout-compact", type === "compact");
    localStorage.setItem("oryphem:layout", type);
  };

  const setAnimations = (on) => {
    document.body.classList.toggle("no-anim", !on);
    localStorage.setItem("oryphem:animations", on ? "on" : "off");
  };

  return (
    <>
      {/* Cursor */}
      <div id="cursor-dot" aria-hidden="true" />
      <div id="cursor-ring" aria-hidden="true" />

      {/* Scroll progress */}
      <div id="scroll-progress" aria-hidden="true" />

      {/* Back to top */}
      <button
        id="back-top"
        type="button"
        onClick={() => {
          const main = document.querySelector("main");
          if (main && main.scrollTop > 0) main.scrollTo({ top: 0, behavior: "smooth" });
          else window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        className={showBackTop ? "visible" : ""}
        aria-label="Back to top"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
      </button>

      {/* Customizer */}
      <div id="customizer" className={`oryphem-customizer ${customizerOpen ? "open" : ""}`} role="complementary" aria-label="UI Customizer">
        <button
          type="button"
          className="customizer-toggle"
          onClick={() => setCustomizerOpen((v) => !v)}
          aria-label="Open customizer"
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
        </button>
        <div className="px-5 py-6">
          <h4>Kustomisasi UI</h4>

          <div className="customizer-section">
            <label>Ukuran Font</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setFontSize(-5)} className="customizer-btn" aria-label="Decrease font size">
                <span className="material-symbols-outlined text-[16px]">remove</span>
              </button>
              <span className="customizer-value" id="font-size-display">
                {typeof document !== "undefined" ? parseInt(document.documentElement.style.fontSize || "100", 10) : 100}%
              </span>
              <button type="button" onClick={() => setFontSize(5)} className="customizer-btn" aria-label="Increase font size">
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
            </div>
          </div>

          <div className="customizer-section">
            <label>Warna Aksen</label>
            <div className="flex gap-2 flex-wrap">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="color-swatch"
                  style={{ background: opt.color }}
                  onClick={() => setAccent(opt.id)}
                  aria-label={`${opt.label} accent`}
                />
              ))}
            </div>
          </div>

          <div className="customizer-section">
            <label>Border Radius</label>
            <div className="flex gap-1.5">
              {[
                { id: "sharp", label: "Tajam" },
                { id: "default", label: "Default" },
                { id: "round", label: "Bulat" },
              ].map((r) => (
                <button key={r.id} type="button" onClick={() => setRadius(r.id)} className="customizer-chip">
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="customizer-section">
            <label>Layout</label>
            <div className="flex gap-1.5">
              {[
                { id: "default", label: "Default" },
                { id: "compact", label: "Padat" },
                { id: "wide", label: "Lebar" },
              ].map((l) => (
                <button key={l.id} type="button" onClick={() => setLayout(l.id)} className="customizer-chip">
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="customizer-section">
            <label>Animasi</label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                onChange={(e) => setAnimations(e.target.checked)}
                className="oryphem-toggle"
              />
              <span className="text-xs text-text-muted">Aktif</span>
            </label>
          </div>
        </div>
      </div>
    </>
  );
}
