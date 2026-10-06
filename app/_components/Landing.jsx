"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 네비게이션 = 스크롤 섹션 = 3D 타임라인의 키프레임 (순서가 같아야 한다)
const SECTIONS = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "science", label: "Our Science" },
  { id: "pricing", label: "Pricing" },
  { id: "contact", label: "Contact" },
];
const SECTION_IDS = SECTIONS.map((s) => s.id);

const PLANS = [
  {
    name: "Aura Visor",
    price: "$499",
    note: "Spatial glass, 38 g",
    perks: ["120° edge-to-edge field of view", "4K micro-OLED per eye", "All-day, featherlight fit"],
  },
  {
    name: "Visor + Band",
    price: "$699",
    note: "Save $99 — best value",
    perks: ["Aura Visor and Pulse Band, paired", "Shared biometrics, zero setup", "Travel case in the box"],
    featured: true,
  },
  {
    name: "Pulse Band",
    price: "$299",
    note: "Chrome smart band",
    perks: ["ECG, SpO₂ and skin temperature", "7-day battery, wireless charging", "Sapphire glass, polished steel"],
  },
];

function Logo() {
  return (
    <a className="logo" href="#home" aria-label="TECHBODY home">
      <span className="logo-a">TECH</span>
      <span className="logo-bar" aria-hidden="true" />
      <span className="logo-b">BODY</span>
    </a>
  );
}

export default function Landing({ build }) {
  const stageRef = useRef(null);
  const reducedRef = useRef(false);
  // boot: 서버 렌더 직후 / ready: 3D 준비 완료 / fallback: WebGL 불가
  const [phase, setPhase] = useState("boot");
  const [active, setActive] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const go = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reducedRef.current ? "auto" : "smooth", block: "start" });
    setMenuOpen(false);
  }, []);

  const onNavClick = (id) => (e) => {
    e.preventDefault();
    go(id);
  };

  // 3D 씬 (three.js 청크는 하이드레이션 이후에 따로 내려받는다)
  useEffect(() => {
    let disposed = false;
    let exp = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedRef.current = reduced;

    (async () => {
      const { createExperience } = await import("./scene");
      if (disposed) return;
      exp = await createExperience({
        container: stageRef.current,
        sectionIds: SECTION_IDS,
        onActive: setActive,
        onNavigate: go,
        reducedMotion: reduced,
      });
      if (disposed) {
        exp.dispose();
        return;
      }
      setPhase("ready");
    })().catch((err) => {
      console.warn("[3D] 씬을 시작하지 못해 정적 화면으로 대체합니다:", err);
      if (disposed) return;
      stageRef.current?.replaceChildren(); // 반쯤 만들어진 canvas 가 남아 배경을 가리지 않도록
      setPhase("fallback");
    });

    return () => {
      disposed = true;
      exp?.dispose();
    };
  }, [go]);

  // 3D 씬이 없으면(폴백) 씬이 알려 주던 현재 섹션을 스크롤 위치로 직접 계산한다
  useEffect(() => {
    if (phase !== "fallback") return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const probe = window.scrollY + window.innerHeight * 0.4;
      let idx = 0;
      SECTION_IDS.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top + window.scrollY <= probe) idx = i;
      });
      setActive(idx);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [phase]);

  // 스크롤에 맞춰 텍스트 블록이 차례로 나타나게
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -6% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // 모바일 메뉴: ESC 로 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [menuOpen]);

  const deployed = build.deployedAt ? build.deployedAt.replace("T", " ").replace("Z", " UTC") : "";

  return (
    <div className="landing" data-phase={phase} lang="en">
      <div className="stage-fallback" aria-hidden="true" />
      <div className="stage" ref={stageRef} aria-hidden="true" />

      <header className="nav">
        <div className="nav-inner">
          <Logo />
          <nav className="nav-links" aria-label="Primary">
            {SECTIONS.map((s, i) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={active === i ? "is-active" : ""}
                aria-current={active === i ? "true" : undefined}
                onClick={onNavClick(s.id)}
              >
                {s.label}
              </a>
            ))}
          </nav>
          <div className="nav-cta">
            <a className="nav-login" href="#contact" onClick={onNavClick("contact")}>
              Log In
            </a>
            <a className="btn btn-primary btn-sm" href="#pricing" onClick={onNavClick("pricing")}>
              Pre-Order
            </a>
            <button
              type="button"
              className="nav-toggle"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <div id="mobile-menu" className="mobile-menu" data-open={menuOpen} hidden={!menuOpen}>
        {SECTIONS.map((s, i) => (
          <a key={s.id} href={`#${s.id}`} onClick={onNavClick(s.id)} style={{ "--i": i }}>
            <small>{String(i).padStart(2, "0")}</small>
            {s.label}
          </a>
        ))}
      </div>

      <nav className="rail" aria-label="Section progress">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={active === i ? "is-active" : ""}
            aria-label={`Go to ${s.label}`}
            aria-current={active === i ? "true" : undefined}
            onClick={() => go(s.id)}
          >
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      <main>
        {/* 01 HOME — 타이틀은 3D 로 그려지고, 이 h1 은 스크린리더/SEO/폴백용 */}
        <section id="home" className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="hero-title">
            Future
            <br />
            Interfaces.
          </h1>
          <p className="hero-tagline" data-reveal>
            Wearable computing, redesigned around the human body.
          </p>
          <div className="scroll-cue" aria-hidden="true">
            <span>Scroll</span>
            <i />
          </div>
          <p className="hero-meta" data-reveal>
            Spring 2027 · Pre-orders open
          </p>
        </section>

        {/* 02 ABOUT — 고글 */}
        <section id="about" className="panel panel--right" aria-labelledby="about-title">
          <div className="panel-inner">
            <p className="eyebrow" data-reveal>
              01 — Explore
            </p>
            <h2 id="about-title" data-reveal style={{ "--d": "80ms" }}>
              See the world, <em>upgraded.</em>
            </h2>
            <p className="lead" data-reveal style={{ "--d": "160ms" }}>
              Aura Visor is a featherlight spatial display. A single sheet of curved glass layers
              information onto reality — without ever getting in the way of it.
            </p>
            <ul className="stats" data-reveal style={{ "--d": "240ms" }}>
              <li>
                <b>120°</b>
                <span>field of view</span>
              </li>
              <li>
                <b>38 g</b>
                <span>total weight</span>
              </li>
              <li>
                <b>4K</b>
                <span>micro-OLED / eye</span>
              </li>
            </ul>
            <a
              className="link-arrow"
              href="#pricing"
              data-reveal
              style={{ "--d": "320ms" }}
              onClick={onNavClick("pricing")}
            >
              Pre-order the Visor <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>

        {/* 03 OUR SCIENCE — 스마트 밴드 */}
        <section id="science" className="panel panel--left" aria-labelledby="science-title">
          <div className="panel-inner">
            <p className="eyebrow" data-reveal>
              02 — Our Science
            </p>
            <h2 id="science-title" data-reveal style={{ "--d": "80ms" }}>
              Built on <em>real biology.</em>
            </h2>
            <p className="lead" data-reveal style={{ "--d": "160ms" }}>
              Pulse Band reads heart rhythm, skin temperature and motion a thousand times a second,
              then turns the signal into quiet, glanceable interface.
            </p>
            <ol className="steps" data-reveal style={{ "--d": "240ms" }}>
              <li>
                <b>Sense</b>
                <span>12 biosensors under sapphire glass</span>
              </li>
              <li>
                <b>Think</b>
                <span>On-device neural engine — your data stays on you</span>
              </li>
              <li>
                <b>Respond</b>
                <span>Haptics and light, only when it matters</span>
              </li>
            </ol>
          </div>
        </section>

        {/* 04 PRICING */}
        <section id="pricing" className="pricing" aria-labelledby="pricing-title">
          <div className="pricing-inner">
            <header className="pricing-head">
              <p className="eyebrow" data-reveal>
                03 — Pre-Order
              </p>
              <h2 id="pricing-title" data-reveal style={{ "--d": "80ms" }}>
                Reserve <em>yours.</em>
              </h2>
            </header>
            <div className="cards">
              {PLANS.map((p, i) => (
                <article
                  key={p.name}
                  className={`card${p.featured ? " card--featured" : ""}`}
                  data-reveal
                  style={{ "--d": `${120 + i * 90}ms` }}
                >
                  {p.featured && <span className="badge">Best value</span>}
                  <h3>{p.name}</h3>
                  <p className="price">{p.price}</p>
                  <p className="note">{p.note}</p>
                  <ul>
                    {p.perks.map((perk) => (
                      <li key={perk}>{perk}</li>
                    ))}
                  </ul>
                  <a
                    className={`btn ${p.featured ? "btn-primary" : "btn-ghost"}`}
                    href="#contact"
                    onClick={onNavClick("contact")}
                  >
                    Pre-order
                  </a>
                </article>
              ))}
            </div>
            <p className="fine" data-reveal>
              $50 fully refundable deposit · ships Spring 2027 · prices in USD
            </p>
          </div>
        </section>

        {/* 05 CONTACT */}
        <section id="contact" className="contact" aria-labelledby="contact-title">
          <div className="contact-inner">
            <p className="eyebrow" data-reveal>
              04 — Contact
            </p>
            <h2 id="contact-title" data-reveal style={{ "--d": "80ms" }}>
              Let&apos;s build the future <em>of the body.</em>
            </h2>
            <p className="lead" data-reveal style={{ "--d": "160ms" }}>
              Press, partnerships or early access — write to us and a human replies within a day.
            </p>
            <div className="contact-actions" data-reveal style={{ "--d": "240ms" }}>
              <a className="btn btn-primary" href="mailto:hello@techbody.example">
                hello@techbody.example
              </a>
              <a className="btn btn-ghost" href="#home" onClick={onNavClick("home")}>
                Back to top ↑
              </a>
            </div>
          </div>
          <footer className="footer">
            <span>© 2026 TECHBODY</span>
            <span className="build">
              build {build.commit}
              {deployed ? ` · deployed ${deployed}` : ""}
            </span>
          </footer>
        </section>
      </main>

      <div className="loader" aria-hidden="true">
        <div className="loader-logo">
          <span>TECH</span>
          <i />
          <span>BODY</span>
        </div>
        <div className="loader-bar">
          <i />
        </div>
      </div>

      <noscript>
        <style>{`.loader{display:none!important}[data-reveal]{opacity:1!important;transform:none!important}.hero-title{opacity:1!important;clip-path:none!important;position:static!important}`}</style>
      </noscript>
    </div>
  );
}
