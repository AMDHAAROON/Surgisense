import { useState, useEffect, useRef } from "react";

const TEAM = [
  { name: "Dr. Aisha Rajan", role: "Chief Medical Officer", dept: "Surgical Sciences", avatar: "👩‍⚕️", bio: "15+ years in robotic-assisted surgery. Pioneer in AI-guided tool recognition.", color: "#00d4ff" },
  { name: "Karan Mehta", role: "Lead AI Engineer", dept: "Deep Learning", avatar: "🧑‍💻", bio: "Former Google Brain researcher. Architected SurgiNet-v4 model.", color: "#7c3aed" },
  { name: "Dr. Priya Nair", role: "Clinical Researcher", dept: "Patient Safety", avatar: "👩‍🔬", bio: "Specialist in surgical error prevention. 200+ peer-reviewed publications.", color: "#06ffa5" },
  { name: "Arjun Sivakumar", role: "Computer Vision Lead", dept: "Systems & Infra", avatar: "🧑‍🔬", bio: "Ex-NVIDIA. Built real-time inference engine powering sub-3s detection.", color: "#f59e0b" },
];

const MILESTONES = [
  { year: "2019", title: "Founded", desc: "Born in a Chennai hospital — a scalpel left inside a patient sparked the idea." },
  { year: "2020", title: "First Prototype", desc: "SurgiNet-v1 achieved 87% accuracy on 200 surgical tools." },
  { year: "2021", title: "Clinical Trials", desc: "Partnered with 12 hospitals across India for live OR testing." },
  { year: "2022", title: "FDA Clearance", desc: "Received 510(k) clearance for AI-assisted surgical tool detection." },
  { year: "2023", title: "Global Launch", desc: "Deployed in 400+ hospitals across 38 countries." },
  { year: "2024", title: "SurgiNet-v4", desc: "99.2% accuracy. Real-time detection. 2,400+ tools recognized." },
];

const VALUES = [
  { icon: "🛡️", title: "Patient Safety First", desc: "Every algorithm decision is validated against patient outcome data.", color: "#ef4444" },
  { icon: "🔬", title: "Precision Science", desc: "Sub-millimeter detection powered by multi-scale neural networks.", color: "#00d4ff" },
  { icon: "⚡", title: "Real-Time Response", desc: "Detection in under 3 seconds — because seconds matter in the OR.", color: "#06ffa5" },
  { icon: "🌍", title: "Global Accessibility", desc: "Affordable tiers for hospitals in developing healthcare systems.", color: "#f59e0b" },
];

function useInView(threshold = 0.15) {
  const ref = useRef();
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, inView];
}

function FadeIn({ children, delay = 0, direction = "up" }) {
  const [ref, inView] = useInView();
  const transforms = { up: "translateY(30px)", left: "translateX(-30px)", right: "translateX(30px)", none: "none" };
  return (
    <div ref={ref} style={{ opacity: inView ? 1 : 0, transform: inView ? "none" : transforms[direction], transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms` }}>
      {children}
    </div>
  );
}

function StatCounter({ target, suffix = "", duration = 2000 }) {
  const [count, setCount] = useState(0);
  const [ref, inView] = useInView();
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

function TeamCard({ member, index }) {
  const [hovered, setHovered] = useState(false);
  return (
    <FadeIn delay={index * 120} direction="up">
      <div
        style={{
          position: "relative", borderRadius: 16, padding: 20, cursor: "pointer",
          background: hovered ? `linear-gradient(135deg, rgba(13,21,48,0.95), ${member.color}18)` : "rgba(13,21,48,0.85)",
          border: `1px solid ${hovered ? member.color + "60" : "rgba(0,212,255,0.1)"}`,
          boxShadow: hovered ? `0 0 30px ${member.color}22, 0 8px 32px rgba(0,0,0,0.4)` : "none",
          transform: hovered ? "translateY(-4px)" : "none", transition: "all 0.4s",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, background: member.color + "18", border: `1px solid ${member.color}40`, boxShadow: hovered ? `0 0 20px ${member.color}44` : "none", transition: "all 0.4s" }}>
            {member.avatar}
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, color: "white" }}>{member.name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: member.color }}>{member.role}</div>
            <div style={{ fontSize: 12, marginTop: 2, color: "#64748b" }}>{member.dept}</div>
          </div>
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.7, color: "#64748b", margin: 0 }}>{member.bio}</p>
        <div style={{ position: "absolute", top: 16, right: 16, width: 6, height: 6, borderRadius: "50%", background: member.color, boxShadow: `0 0 8px ${member.color}`, opacity: hovered ? 1 : 0.4, transition: "opacity 0.3s" }} />
      </div>
    </FadeIn>
  );
}

function TimelineDot({ active }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${active ? "#00d4ff" : "rgba(0,212,255,0.2)"}`, background: active ? "#00d4ff" : "transparent", boxShadow: active ? "0 0 12px #00d4ff" : "none", transition: "all 0.5s", position: "relative", zIndex: 10 }} />
    </div>
  );
}

export default function AboutPage() {
  const [activeMilestone, setActiveMilestone] = useState(5);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setDots(d => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <style>{`
        :root {
          --bg: #060c1a;
          --surface: #0d1530;
          --surface2: #111b3a;
          --accent: #00d4ff;
          --accent2: #7c3aed;
          --accent3: #06ffa5;
          --text: #e2e8f0;
          --muted: #64748b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); font-family: 'Courier New', monospace; }

        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes spin-slow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glitch {
          0%,100%{text-shadow:-2px 0 var(--accent2),2px 0 var(--accent3)}
          33%{text-shadow:2px 0 var(--accent2),-2px 0 var(--accent3)}
          66%{text-shadow:-1px 0 var(--accent),1px 0 var(--accent2)}
        }
        @keyframes gridMove { 0%{background-position:0 0} 100%{background-position:40px 40px} }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:0.15} 50%{transform:scale(1.04);opacity:0.35} }
        @keyframes shimmer {
          0%{background-position:-200% center}
          100%{background-position:200% center}
        }

        .grid-bg {
          background-image:
            linear-gradient(rgba(0,212,255,0.04) 1px,transparent 1px),
            linear-gradient(90deg,rgba(0,212,255,0.04) 1px,transparent 1px);
          background-size:40px 40px;
          animation:gridMove 8s linear infinite;
        }
        .glow-text { text-shadow:0 0 30px var(--accent),0 0 60px var(--accent2); }
        .shimmer-text {
          background: linear-gradient(90deg, var(--text) 30%, var(--accent) 50%, var(--text) 70%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
        .nav-link { transition:color 0.2s; }
        .nav-link:hover { color:var(--accent); }
        .value-card { transition:all 0.35s; }
        .value-card:hover { transform:translateY(-6px); }
      `}</style>

      <div className="min-h-screen relative" style={{ background: "var(--bg)", color: "var(--text)" }}>

        {/* Background layers */}
        <div className="fixed inset-0 grid-bg opacity-50 pointer-events-none" />
        <div className="fixed top-0 left-0 w-96 h-96 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle,rgba(0,212,255,0.08),transparent)", filter: "blur(60px)", animation: "float 7s ease-in-out infinite" }} />
        <div className="fixed bottom-0 right-0 w-96 h-96 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle,rgba(124,58,237,0.1),transparent)", filter: "blur(80px)", animation: "float 9s ease-in-out infinite reverse" }} />

        {/* NAV */}
        <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4" style={{ background: "rgba(6,12,26,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,212,255,0.08)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: "linear-gradient(135deg,var(--accent2),var(--accent))" }}>🔬</div>
            <span className="font-black text-lg tracking-widest glow-text" style={{ fontFamily: "'Courier New',monospace" }}>
              SURGI<span style={{ color: "var(--accent)" }}>SCAN</span>
            </span>
          </div>
          <div className="flex gap-6 text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            {["Home", "Scanner", "About", "Contact"].map((l) => (
              <span key={l} className="nav-link cursor-pointer" style={{ color: l === "About" ? "var(--accent)" : "var(--muted)" }}>{l}</span>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--accent3)" }}>
            <span style={{ animation: "blink 1.5s infinite", width: 6, height: 6, borderRadius: "50%", background: "var(--accent3)", display: "inline-block", boxShadow: "0 0 6px var(--accent3)" }} />
            System Online
          </div>
        </nav>

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-28 pb-20">

          {/* HERO */}
          <section className="text-center mb-24" style={{ animation: "fadeUp 0.9s ease both" }}>
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase" style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "var(--accent)" }}>
              About SurgiScan · Our Story
            </div>
            <h1 className="text-6xl font-black mb-6 leading-tight" style={{ fontFamily: "'Courier New',monospace", animation: "glitch 5s ease-in-out infinite" }}>
              Saving Lives Through<br />
              <span className="shimmer-text">Intelligent Vision</span>
            </h1>
            <p className="text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: "var(--muted)" }}>
              We're on a mission to eliminate surgical tool errors using the world's most advanced AI-powered detection system — because every instrument counts.
            </p>
            <div className="relative inline-flex items-center justify-center mt-12 mb-4" style={{ width: 180, height: 180 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="absolute rounded-full" style={{ inset: i * 14, border: `1px solid rgba(0,212,255,${0.3 - i * 0.07})`, animation: `pulse ${2 + i * 0.5}s ease-in-out infinite`, animationDelay: `${i * 0.3}s` }} />
              ))}
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl z-10 relative" style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.15),rgba(124,58,237,0.15))", border: "1px solid rgba(0,212,255,0.3)", boxShadow: "0 0 40px rgba(0,212,255,0.2)", animation: "float 4s ease-in-out infinite" }}>
                🏥
              </div>
              <div className="absolute inset-0" style={{ animation: "spin-slow 4s linear infinite" }}>
                <div className="absolute top-2 left-1/2 w-3 h-3 rounded-full -ml-1.5" style={{ background: "var(--accent)", boxShadow: "0 0 12px var(--accent)" }} />
              </div>
            </div>
          </section>

          {/* STATS */}
          <section className="mb-24">
            <FadeIn>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Tools in Library", value: 2400, suffix: "+", color: "var(--accent)" },
                  { label: "Hospitals Worldwide", value: 400, suffix: "+", color: "var(--accent2)" },
                  { label: "Scans Performed", value: 50000, suffix: "+", color: "var(--accent3)" },
                  { label: "Detection Accuracy", value: 99, suffix: ".2%", color: "#f59e0b" },
                ].map((s, i) => (
                  <div key={i} className="rounded-2xl p-6 text-center" style={{ background: "rgba(13,21,48,0.9)", border: "1px solid rgba(0,212,255,0.1)" }}>
                    <div className="text-4xl font-black mb-1" style={{ color: s.color, fontFamily: "'Courier New',monospace", textShadow: `0 0 20px ${s.color}` }}>
                      <StatCounter target={s.value} suffix={s.suffix} />
                    </div>
                    <div className="text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </section>

          {/* MISSION */}
          <section className="mb-24 grid grid-cols-2 gap-10 items-center">
            <FadeIn direction="left">
              <div>
                <div className="text-xs uppercase tracking-widest mb-3 font-bold" style={{ color: "var(--accent)" }}>Our Mission</div>
                <h2 className="text-4xl font-black mb-5 leading-tight" style={{ fontFamily: "'Courier New',monospace" }}>
                  Zero Retained<br />
                  <span style={{ color: "var(--accent)" }}>Surgical Instruments</span>
                </h2>
                <p className="leading-relaxed mb-4" style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
                  Retained surgical instruments (RSI) affect over 4,000 patients per year in the US alone. These preventable events cause severe complications, lawsuits, and — worst of all — preventable deaths.
                </p>
                <p className="leading-relaxed" style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
                  SurgiScan uses deep learning models trained on millions of annotated OR images to detect, count, and verify every instrument — before, during, and after surgery.
                </p>
                <div className="mt-6 flex gap-3">
                  <div className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "var(--accent)" }}>ISO 13485 Certified</div>
                  <div className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: "rgba(6,255,165,0.1)", border: "1px solid rgba(6,255,165,0.3)", color: "var(--accent3)" }}>FDA 510(k) Cleared</div>
                </div>
              </div>
            </FadeIn>

            <FadeIn direction="right" delay={100}>
              <div className="relative rounded-2xl p-6" style={{ background: "rgba(13,21,48,0.9)", border: "1px solid rgba(0,212,255,0.15)" }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--muted)" }}>
                  LIVE SYSTEM STATUS <span style={{ color: "var(--accent3)", animation: "blink 1.5s infinite", display: "inline" }}>{".".repeat(dots + 1)}</span>
                </div>
                {[
                  { label: "AI Model Uptime", value: "99.98%", color: "var(--accent3)" },
                  { label: "Avg Scan Latency", value: "2.8s", color: "var(--accent)" },
                  { label: "Active OR Connections", value: "1,247", color: "#f59e0b" },
                  { label: "Tools Detected Today", value: "83,412", color: "var(--accent2)" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(0,212,255,0.07)" }}>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{item.label}</span>
                    <span className="text-sm font-black" style={{ color: item.color, fontFamily: "'Courier New',monospace" }}>{item.value}</span>
                  </div>
                ))}
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full" style={{ background: "var(--accent3)", boxShadow: "0 0 8px var(--accent3)", animation: "blink 2s infinite" }} />
              </div>
            </FadeIn>
          </section>

          {/* VALUES */}
          <section className="mb-24">
            <FadeIn>
              <div className="text-center mb-10">
                <div className="text-xs uppercase tracking-widest mb-2 font-bold" style={{ color: "var(--accent)" }}>What Drives Us</div>
                <h2 className="text-4xl font-black" style={{ fontFamily: "'Courier New',monospace" }}>Core Values</h2>
              </div>
            </FadeIn>
            <div className="grid grid-cols-4 gap-4">
              {VALUES.map((v, i) => (
                <FadeIn key={i} delay={i * 100} direction="up">
                  <div className="value-card rounded-2xl p-5 h-full" style={{ background: "rgba(13,21,48,0.9)", border: `1px solid ${v.color}25` }}>
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-4" style={{ background: v.color + "18", border: `1px solid ${v.color}35` }}>{v.icon}</div>
                    <div className="font-black text-sm mb-2 text-white">{v.title}</div>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--muted)", lineHeight: 1.7 }}>{v.desc}</p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </section>

          {/* TIMELINE */}
          <section className="mb-24">
            <FadeIn>
              <div className="text-center mb-10">
                <div className="text-xs uppercase tracking-widest mb-2 font-bold" style={{ color: "var(--accent)" }}>Our Journey</div>
                <h2 className="text-4xl font-black" style={{ fontFamily: "'Courier New',monospace" }}>Milestones</h2>
              </div>
            </FadeIn>
            <div className="relative">
              <div className="absolute left-8 top-0 bottom-0 w-px" style={{ background: "linear-gradient(to bottom, transparent, rgba(0,212,255,0.3), transparent)" }} />
              <div className="space-y-4">
                {MILESTONES.map((m, i) => (
                  <FadeIn key={i} delay={i * 80} direction="left">
                    <div
                      className="relative flex gap-6 pl-16 cursor-pointer rounded-xl p-4 transition-all duration-300"
                      style={{ background: activeMilestone === i ? "rgba(0,212,255,0.06)" : "transparent", border: `1px solid ${activeMilestone === i ? "rgba(0,212,255,0.2)" : "transparent"}` }}
                      onClick={() => setActiveMilestone(i)}
                    >
                      <div className="absolute left-6 top-1/2 -translate-y-1/2">
                        <TimelineDot active={activeMilestone === i} />
                      </div>
                      <div className="text-sm font-black w-10 flex-shrink-0" style={{ color: "var(--accent)", fontFamily: "'Courier New',monospace" }}>{m.year}</div>
                      <div>
                        <div className="font-black text-sm text-white mb-1">{m.title}</div>
                        <p className="text-xs" style={{ color: "var(--muted)", lineHeight: 1.7 }}>{m.desc}</p>
                      </div>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </div>
          </section>

          {/* TEAM */}
          <section className="mb-24">
            <FadeIn>
              <div className="text-center mb-10">
                <div className="text-xs uppercase tracking-widest mb-2 font-bold" style={{ color: "var(--accent)" }}>The Minds Behind</div>
                <h2 className="text-4xl font-black" style={{ fontFamily: "'Courier New',monospace" }}>Our Team</h2>
              </div>
            </FadeIn>
            <div className="grid grid-cols-2 gap-4">
              {TEAM.map((member, i) => <TeamCard key={i} member={member} index={i} />)}
            </div>
          </section>

          {/* CTA */}
          <FadeIn>
            <section className="relative rounded-3xl overflow-hidden p-12 text-center" style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.08),rgba(124,58,237,0.12),rgba(6,255,165,0.06))", border: "1px solid rgba(0,212,255,0.2)" }}>
              {[1, 2].map(i => (
                <div key={i} className="absolute rounded-full pointer-events-none" style={{ inset: i * -30, border: `1px solid rgba(0,212,255,${0.06 - i * 0.02})`, animation: `spin-slow ${20 + i * 10}s linear infinite` }} />
              ))}
              <div className="relative z-10">
                <h2 className="text-4xl font-black mb-4" style={{ fontFamily: "'Courier New',monospace" }}>
                  Ready to Make the<br /><span style={{ color: "var(--accent)" }}>OR Safer?</span>
                </h2>
                <p className="mb-8 text-sm" style={{ color: "var(--muted)" }}>Join 400+ hospitals already using SurgiScan to protect patients every day.</p>
                <div className="flex gap-4 justify-center">
                  <button className="px-8 py-3 rounded-xl font-black text-sm tracking-widest uppercase text-white transition-all duration-300 hover:scale-105" style={{ background: "linear-gradient(135deg,var(--accent2),var(--accent))", boxShadow: "0 0 30px rgba(0,212,255,0.3)", fontFamily: "'Courier New',monospace" }}>
                    ⚡ Start Free Trial
                  </button>
                  <button className="px-8 py-3 rounded-xl font-black text-sm tracking-widest uppercase transition-all duration-300 hover:scale-105" style={{ background: "transparent", border: "1px solid rgba(0,212,255,0.4)", color: "var(--accent)", fontFamily: "'Courier New',monospace" }}>
                    📋 Request Demo
                  </button>
                </div>
              </div>
            </section>
          </FadeIn>

        </div>

        {/* FOOTER */}
        <div className="relative z-10 border-t text-center py-8" style={{ borderColor: "rgba(0,212,255,0.08)" }}>
          <p className="text-xs" style={{ color: "var(--muted)", opacity: 0.5, fontFamily: "'Courier New',monospace" }}>
            SurgiScan · AI-Powered Surgical Detection · © 2026 · For professional medical use only
          </p>
        </div>
      </div>
    </>
  );
}