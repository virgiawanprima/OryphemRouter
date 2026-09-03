"use client";
import { useRouter } from "next/navigation";
import Navigation from "./components/Navigation";
import HeroSection from "./components/HeroSection";
import FlowAnimation from "./components/FlowAnimation";
import HowItWorks from "./components/HowItWorks";
import Features from "./components/Features";
import GetStarted from "./components/GetStarted";
import Footer from "./components/Footer";
import AnimatedBackground from "./components/AnimatedBackground";

export default function LandingPage() {
  const router = useRouter();
  return (
    <div className="relative text-white overflow-x-hidden antialiased selection:bg-[#38d9c8] selection:text-[#0b1018] font-sans">
      <AnimatedBackground />

      <div className="relative z-10">
        <Navigation />

        <main>
          <div className="relative">
            <HeroSection />
            <div className="flex justify-center pb-20">
              <FlowAnimation />
            </div>
          </div>

          <GetStarted />
          <HowItWorks />
          <Features />

          <section className="py-32 px-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-t from-[#38d9c8]/5 to-transparent pointer-events-none"></div>
            <div className="max-w-4xl mx-auto text-center relative z-10">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">Route every request, AI included</h2>
              <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
                Open source and free to start. Point your tools at one local endpoint.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="w-full sm:w-auto h-14 px-10 rounded-lg bg-[#38d9c8] hover:bg-[#66e3d4] text-[#0b1018] text-lg font-bold transition-all"
                >
                  Get Started
                </button>
                <button
                  onClick={() => window.open("https://github.com/virgiawanprima/OryphemRouter#readme", "_blank")}
                  className="w-full sm:w-auto h-14 px-10 rounded-lg border border-[#2a3947] hover:border-[#38d9c8] hover:bg-[#121a26] text-white text-lg font-bold transition-all"
                >
                  Read Documentation
                </button>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  );
}
