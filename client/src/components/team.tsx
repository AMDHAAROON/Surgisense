import { useState, useEffect, useRef } from "react";
import { Github, Linkedin } from "lucide-react";

const TEAM = [
  {
    name: "Satagopan",
    role: "Full Stack Developer",
    dept: "Systems & Architecture",
    initials: "ST",
    bio: "Architecting scalable backend systems and seamless frontend experiences for SurgiScan's core platform.",
    color: "#00d4ff",
    github: "https://github.com/satagopan",
    linkedin: "https://linkedin.com/in/satagopan",
  },
  {
    name: "Subash Chandra Bose",
    role: "AI/ML Engineer",
    dept: "Deep Learning",
    initials: "SCB",
    bio: "Building and fine-tuning SurgiNet models for surgical tool detection with near-perfect accuracy.",
    color: "#7c3aed",
    github: "https://github.com/subash",
    linkedin: "https://linkedin.com/in/subash",
  },
  {
    name: "Haaroon",
    role: "Computer Vision Lead",
    dept: "Image Processing",
    initials: "MH",
    bio: "Pioneering real-time inference pipelines that power sub-3s surgical instrument recognition.",
    color: "#06ffa5",
    github: "https://github.com/AMDHAAROON",
    linkedin: "https://linkedin.com/in/haaroon",
  },
  {
    name: "Vishal",
    role: "Frontend Engineer",
    dept: "UI/UX & Design",
    initials: "VS",
    bio: "Crafting intuitive, high-performance interfaces that bring AI insights to surgeons in the OR.",
    color: "#f59e0b",
    github: "https://github.com/vishal",
    linkedin: "https://linkedin.com/in/vishal",
  },
];

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, inView] as const;
}

function FadeIn({ children, delay = 0, direction = "up" }: { children: React.ReactNode; delay?: number; direction?: "up" | "left" | "right" | "none" }) {
  const [ref, inView] = useInView();
  const transforms: Record<string, string> = {
    up: "translateY(30px)", left: "translateX(-30px)", right: "translateX(30px)", none: "none",
  };
  return (
    <div ref={ref} style={{ opacity: inView ? 1 : 0, transform: inView ? "none" : transforms[direction], transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms` }}>
      {children}
    </div>
  );
}

function TeamCard({ member, index }: { member: typeof TEAM[0]; index: number }) {
  const [hovered, setHovered] = useState(false);

  return (
    <FadeIn delay={index * 150} direction="up">
      <div className=""
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          borderRadius: 20,
          padding: 28,
          cursor: "pointer",
          background: hovered
            ? `linear-gradient(135deg, rgba(13,21,48,0.98), ${member.color}15)`
            : "rgba(13,21,48,0.85)",
          border: `1px solid ${hovered ? member.color + "55" : "rgba(0,212,255,0.1)"}`,
          boxShadow: hovered ? `0 0 40px ${member.color}18, 0 12px 40px rgba(0,0,0,0.5)` : "none",
          transform: hovered ? "translateY(-6px)" : "none",
          transition: "all 0.4s ease",
        }}
      >
        {/* Top row: avatar + name */}
        <div className="team-card-top">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 900,
              fontFamily: "'Courier New', monospace",
              color: member.color,
              background: member.color + "15",
              border: `2px solid ${member.color}40`,
              boxShadow: hovered ? `0 0 24px ${member.color}40` : "none",
              transition: "all 0.4s",
              letterSpacing: "0.05em",
            }}
          >
            {member.initials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: "white", marginBottom: 3, fontFamily: "'Courier New', monospace" }}>
              {member.name}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: member.color, marginBottom: 2 }}>
              {member.role}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {member.dept}
            </div>
          </div>

          {/* Social icons */}
          <div className="team-social" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <a
              href={member.github}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#94a3b8",
                transition: "all 0.2s ease",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "#ffffff";
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.12)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.2)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "#94a3b8";
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.05)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.08)";
              }}
              aria-label={`${member.name} GitHub`}
            >
              <Github size={14} />
            </a>
            <a
              href={member.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#94a3b8",
                transition: "all 0.2s ease",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "#0a66c2";
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(10,102,194,0.15)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(10,102,194,0.3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "#94a3b8";
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.05)";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.08)";
              }}
              aria-label={`${member.name} LinkedIn`}
            >
              <Linkedin size={14} />
            </a>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: `linear-gradient(to right, ${member.color}30, transparent)`, marginBottom: 14 }} />

        {/* Bio */}
        <p style={{ fontSize: 12, lineHeight: 1.75, color: "#94a3b8", margin: 0 }}>
          {member.bio}
        </p>

        {/* Corner pulse dot */}
        <div
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: member.color,
            boxShadow: `0 0 10px ${member.color}`,
            opacity: hovered ? 1 : 0.3,
            transition: "opacity 0.3s",
          }}
        />

        {/* Bottom color bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 24,
            right: 24,
            height: 2,
            borderRadius: "0 0 2px 2px",
            background: `linear-gradient(to right, transparent, ${member.color}60, transparent)`,
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.4s",
          }}
        />
      </div>
    </FadeIn>
  );
}

export default function TeamSection() {
  return (
    <>
      <style>{`
        @keyframes float-slow { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .team-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; max-width: 900px; margin: 0 auto; }
        @media (max-width: 600px) { .team-grid { grid-template-columns: 1fr; } }
        .team-card-top { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
        @media (max-width: 400px) {
          .team-card-top { flex-wrap: wrap; }
          .team-social { margin-left: auto; }
        }
      `}</style>

      <section style={{ position: "relative", padding: "5px 0" }}>

        {/* Section header */}
        <FadeIn direction="up">
          <div   style={{ textAlign: "center", marginBottom: 56 }}>
            <div  style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 18px", borderRadius: 9999, marginBottom: 16,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
              background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00d4ff",
            }}>
              The Minds Behind SurgiScan
            </div>

                    <h1 className="text-[40px] sm:text-4xl md:text-6xl lg:text-7xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/60 leading-[1.1] animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-100">

              <span className="text-black dark:text-[#e2e8f0]">
                Meet Our{" "}
              </span>
              <span style={{ color: "#10B981", textShadow: "0 0 30px rgba(0,212,255,0.4)" }}>
                Team
              </span>
            </h1>

            <p style={{ fontSize: 14, color: "#64748b", maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
              A passionate group of engineers building the future of AI-assisted surgical safety.
            </p>
          </div>
        </FadeIn>

        {/* Cards grid */}
        <div className="team-grid">
          {TEAM.map((member, i) => (
            <TeamCard key={member.name} member={member} index={i} />
          ))}
        </div>

      </section>
    </>
  );
} 