import { ROUTES } from '@/lib/routes';
import { PulseBrandMark } from '@/components/brand/PulseBrandMark';
import Theme from '@/constants/Theme';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

/** Posted by landing HTML inside iframe so parent can SPA-navigate (avoids full document reload). */
const PULSE_SIGN_IN_NAV = 'pulse-sign-in-nav' as const;

const WEBSITE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>pulse.</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    :root {
      --ink: #4D3636;
      --blue: #CDE9F7;
      --blue-pressed: #B9E2F5;
      --blue-soft: #E5F4FB;
      --gold: #FFCE44;
      --white: #ffffff;
      --canvas: #F7FBFD;
      --muted: #8A7364;
      --line: rgba(77, 54, 54, 0.12);
      --shadow: rgba(77, 54, 54, 0.14);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 76px; }
    body {
      margin: 0;
      background: var(--white);
      color: var(--ink);
      -webkit-font-smoothing: auto;
      text-rendering: geometricPrecision;
    }
    .page-pad {
      padding-left: max(28px, env(safe-area-inset-left), 4vw);
      padding-right: max(28px, env(safe-area-inset-right), 4vw);
    }
    .wide-shell {
      width: 100%;
      max-width: 1480px;
      margin-left: auto;
      margin-right: auto;
    }
    .brand-mark {
      color: var(--ink);
      font-size: 26px;
      line-height: 32px;
      font-weight: 800;
      font-style: italic;
      letter-spacing: -0.8px;
      text-decoration: none;
      -webkit-font-smoothing: auto;
      -webkit-text-stroke: 0.35px var(--ink);
      text-rendering: geometricPrecision;
    }
    .brand-dot { color: var(--gold); }
    .dot-gold { color: var(--gold); }
    .glass-nav {
      background: var(--white);
      border-bottom: 1px solid var(--line);
    }
    .hero-title { font-size: clamp(40px, 6vw, 80px); line-height: 0.88; letter-spacing: -0.05em; }
    .final-title { font-size: clamp(34px, 5.6vw, 72px); line-height: 0.88; letter-spacing: -0.045em; }
    .headline-lg { font-size: clamp(1.6rem, 2.8vw, 2.35rem) !important; line-height: 1.06 !important; letter-spacing: -0.034em !important; }
    .support-copy { font-size: clamp(0.9375rem, 1.05vw, 1.0625rem); line-height: 1.55; }
    .section-copy { font-size: 0.95rem; line-height: 1.5; }
    .nav-link { font-size: 11px; letter-spacing: 0.14em; }
    .tight-btn { letter-spacing: 0.12em; font-size: 12px; }
    .section-lead { font-size: 0.95rem !important; line-height: 1.55 !important; }
    .cta-primary {
      background: var(--blue);
      color: var(--ink);
      border: 1.5px solid var(--ink);
      border-radius: 999px;
    }
    .cta-primary:hover { background: var(--blue-pressed); }
    .cta-ghost {
      background: var(--white);
      color: var(--ink);
      border: 1.5px solid var(--line);
      border-radius: 999px;
    }
    .cta-ghost:hover { border-color: var(--ink); background: var(--blue-soft); }
    .cta-ink {
      background: var(--ink);
      color: var(--white);
      border: 1.5px solid var(--ink);
      border-radius: 999px;
    }
    .cta-ink:hover { background: #3d2a2a; }
    .reveal { opacity: 0; transform: translateY(16px); transition: opacity 600ms ease, transform 600ms ease; }
    .reveal.in { opacity: 1; transform: translateY(0); }
    .hover-float { transition: transform 350ms ease, box-shadow 350ms ease; }
    .hover-float:hover { transform: translateY(-3px); box-shadow: 0 18px 40px -24px var(--shadow); }
    .type-cursor { display: inline-block; border-right: 2px solid var(--gold); margin-left: 4px; animation: blink 1s steps(1) infinite; }
    @keyframes blink { 50% { border-color: transparent; } }
    @keyframes pulseSoft { 0%,100% { opacity: .18; transform: scale(1); } 50% { opacity: .32; transform: scale(1.03); } }
    @keyframes floatCard { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    @keyframes liveGlow { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
    .bg-glow { animation: pulseSoft 7s ease-in-out infinite; background: var(--blue); }
    .float-card { animation: floatCard 8s ease-in-out infinite; }
    .live-dot { animation: liveGlow 2.6s ease-in-out infinite; }
    .site-dark-tail { background: var(--ink); }
    .final-cta { border-radius: 2.5rem 2.5rem 0 0; }
    section[id], div[id] { scroll-margin-top: 76px; }
    .mobile-tabbar { display: none; }
    .feature-row {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .quote-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    @media (max-width: 1024px) {
      html { scroll-padding-top: 68px; }
      section[id], div[id] { scroll-margin-top: 68px; }
      .hero-title { font-size: clamp(30px, 8vw, 46px); }
      .final-title { font-size: clamp(28px, 7.5vw, 42px); }
      .headline-lg { font-size: clamp(1.4rem, 5.6vw, 1.85rem) !important; }
      #trips, .product-dark { border-radius: 1.5rem !important; }
      .final-cta { border-radius: 1.5rem 1.5rem 0 0 !important; }
      body { padding-bottom: 88px; }
      .mobile-tabbar {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 6px;
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: max(10px, env(safe-area-inset-bottom));
        z-index: 120;
        background: var(--ink);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 18px;
        padding: 8px;
      }
      .mobile-tabbar a {
        color: rgba(255,255,255,0.72);
        text-decoration: none;
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-weight: 800;
        font-size: 10px;
        line-height: 1.2;
        padding: 10px 4px;
        border-radius: 12px;
      }
      .mobile-tabbar a:active,
      .mobile-tabbar a:hover {
        background: var(--blue);
        color: var(--ink);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .reveal, .hover-float, .float-card, .bg-glow, .live-dot, .type-cursor { animation: none !important; transition: none !important; }
      .reveal { opacity: 1; transform: none; }
    }
    @media (max-width: 767px) {
      .hero-section { padding-top: 96px !important; padding-bottom: 48px !important; }
      .hero-actions a { width: 100%; }
      .stat-grid, .trip-feature-grid, .steps-grid, .ledger-grid, .product-grid { grid-template-columns: minmax(0, 1fr) !important; }
      .driver-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      .section-stack { padding-top: 48px !important; padding-bottom: 48px !important; }
      .hero-title { max-width: 12ch !important; }
      .nav-desktop { display: none !important; }
    }
  </style>
</head>
<body id="top" class="min-h-screen bg-white font-sans overflow-x-hidden">
  <nav class="fixed top-0 left-0 right-0 z-[100] glass-nav page-pad py-3.5">
    <div class="wide-shell flex items-center justify-between gap-4 min-w-0">
      <a href="#top" class="brand-mark">pulse<span class="brand-dot">.</span></a>
      <div class="nav-desktop hidden lg:flex items-center gap-7">
        <a href="#exchange" class="nav-link font-black uppercase hover:opacity-70" style="color:var(--ink)">Exchange</a>
        <a href="#network" class="nav-link font-black uppercase hover:opacity-70" style="color:var(--ink)">Network</a>
        <a href="#boost" class="nav-link font-black uppercase hover:opacity-70" style="color:var(--ink)">Boost</a>
        <a href="#ledger" class="nav-link font-black uppercase hover:opacity-70" style="color:var(--ink)">Ledger</a>
        <a href="#analytics" class="nav-link font-black uppercase hover:opacity-70" style="color:var(--ink)">Analytics</a>
      </div>
      <a href="/onboarding" target="_top" class="cta-ink px-5 py-2.5 text-[10px] font-black uppercase tracking-widest shrink-0">Enter OS</a>
    </div>
  </nav>

  <section class="hero-section relative pt-28 pb-20 page-pad overflow-hidden" style="background:var(--canvas)">
    <div class="wide-shell grid lg:grid-cols-2 gap-12 xl:gap-16 items-center">
      <div class="relative z-10 reveal min-w-0">
        <h1 class="hero-title font-black italic mb-7 uppercase max-w-[12ch]" style="color:var(--ink)">
          <span id="typewriter" data-text="MOVE BUSINESS FASTER"></span><span class="dot-gold">.</span><span class="type-cursor"></span>
        </h1>
        <p class="support-copy font-medium max-w-xl mb-8" style="color:var(--muted)">
          Run loads, bidding, sponsored reach, ledger, and analytics on one workspace — from first quote to settlement.
        </p>
        <div class="hero-actions flex flex-col sm:flex-row gap-3">
          <a href="/onboarding" target="_top" class="cta-primary px-8 py-3.5 font-black uppercase tight-btn text-center hover-float">Get Started</a>
          <a href="#exchange" class="cta-ghost px-8 py-3.5 font-black uppercase tight-btn text-center hover-float">See Features</a>
        </div>
      </div>
      <div class="relative reveal w-full lg:justify-self-end min-w-0">
        <div class="relative z-10 float-card rounded-[28px] p-6 md:p-8" style="background:var(--ink);box-shadow:0 32px 64px -20px var(--shadow)">
          <div class="flex justify-between items-center mb-6">
            <div class="flex gap-1.5">
              <div class="w-2.5 h-2.5 rounded-full" style="background:#E8A0A0"></div>
              <div class="w-2.5 h-2.5 rounded-full" style="background:var(--gold)"></div>
              <div class="w-2.5 h-2.5 rounded-full" style="background:var(--blue)"></div>
            </div>
            <span class="text-[9px] font-black uppercase tracking-[0.28em] italic" style="color:var(--gold)">Live</span>
          </div>
          <div class="space-y-4">
            <div class="p-4 rounded-2xl flex justify-between items-center gap-3" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08)">
              <div class="min-w-0">
                <p class="text-[9px] font-black uppercase tracking-widest mb-1" style="color:rgba(255,255,255,0.45)">Active trip</p>
                <p class="text-white text-sm md:text-base font-black truncate">DARJEELING → KOLKATA</p>
              </div>
              <i data-lucide="activity" class="w-5 h-5 shrink-0 live-dot" style="color:var(--gold)"></i>
            </div>
            <div class="p-4 rounded-2xl" style="background:var(--blue);color:var(--ink)">
              <p class="text-[9px] uppercase font-black mb-1 opacity-60">Workspace ledger</p>
              <p class="text-2xl md:text-3xl font-black italic">₹47,555.00</p>
            </div>
          </div>
        </div>
        <div class="absolute -inset-10 rounded-full bg-glow blur-[80px] -z-10"></div>
      </div>
    </div>
  </section>

  <section id="exchange" class="section-stack py-20 page-pad">
    <div class="wide-shell grid lg:grid-cols-[1fr_1.05fr] gap-10 xl:gap-14 items-center">
      <div class="reveal min-w-0">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] mb-3" style="color:var(--muted)">Exchange</p>
        <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4">The marketplace for live loads<span class="dot-gold">.</span></h2>
        <p class="section-copy font-semibold max-w-lg mb-7" style="color:var(--muted)">
          Post a load to your connected network. Partners bid in the same thread. Award once — trip, ledger, and POD stay linked.
        </p>
        <div class="space-y-3">
          <div class="feature-row p-4 rounded-2xl" style="background:var(--canvas);border:1px solid var(--line)">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--white);color:var(--ink)"><i data-lucide="store" class="w-5 h-5"></i></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Give &amp; get loads</h4><p class="text-sm font-medium" style="color:var(--muted)">Broadcast to connections from Load Center.</p></div>
          </div>
          <div class="feature-row p-4 rounded-2xl" style="background:var(--canvas);border:1px solid var(--line)">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--white);color:var(--ink)"><i data-lucide="gavel" class="w-5 h-5"></i></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Live bidding</h4><p class="text-sm font-medium" style="color:var(--muted)">Quotes land on the story. Award the best rate.</p></div>
          </div>
          <div class="feature-row p-4 rounded-2xl" style="background:var(--canvas);border:1px solid var(--line)">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--white);color:var(--ink)"><i data-lucide="badge-check" class="w-5 h-5"></i></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Connected network</h4><p class="text-sm font-medium" style="color:var(--muted)">Only verified partners in your circle see the load.</p></div>
          </div>
        </div>
      </div>
      <div class="reveal min-w-0">
        <div class="product-dark rounded-[28px] p-5 md:p-6 relative overflow-hidden" style="background:var(--ink)">
          <div class="relative z-10 space-y-3">
            <div class="p-5 rounded-2xl" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex justify-between items-center gap-3 mb-3">
                <span class="text-[9px] font-black uppercase tracking-widest" style="color:var(--gold)">@gogovan · Exchange</span>
                <span class="text-[9px] font-bold italic" style="color:rgba(255,255,255,0.35)">12m ago</span>
              </div>
              <p class="text-white/85 text-sm leading-relaxed mb-4">20ft container · Chennai dispatch · ready 6 AM. Connected partners only.</p>
              <div class="quote-foot">
                <span class="text-lg font-black text-white">₹22,000</span>
                <a href="/onboarding" target="_top" class="cta-primary px-4 py-2 text-[10px] font-black uppercase">Submit quote</a>
              </div>
            </div>
            <div class="p-5 rounded-2xl opacity-70" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)">
              <div class="flex justify-between items-center gap-3 mb-3">
                <span class="text-[9px] font-black uppercase tracking-widest" style="color:var(--blue)">@vendhan · Open truck</span>
                <span class="text-[9px] font-bold italic" style="color:rgba(255,255,255,0.35)">45m ago</span>
              </div>
              <p class="text-white/80 text-sm leading-relaxed mb-4">14ft available Delhi → Jaipur. Looking for a return load.</p>
              <div class="quote-foot">
                <span class="text-lg font-black text-white">Market rate</span>
                <a href="/onboarding" target="_top" class="cta-primary px-4 py-2 text-[10px] font-black uppercase">Submit quote</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section id="network" class="section-stack py-16 page-pad" style="background:var(--canvas)">
    <div class="wide-shell">
      <div class="reveal max-w-2xl mb-10">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] mb-3" style="color:var(--muted)">Connected network</p>
        <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4">Your circle. Your loads<span class="dot-gold">.</span></h2>
        <p class="section-lead font-semibold" style="color:var(--muted)">Pulse Story posts stay inside the connections you trust. Bid from the reel, award from the same indent.</p>
      </div>
      <div class="product-grid grid md:grid-cols-3 gap-4">
        <div class="p-6 rounded-[22px] hover-float" style="background:var(--white);border:1px solid var(--line)">
          <div class="w-11 h-11 rounded-xl mb-4 flex items-center justify-center" style="background:var(--blue)"><i data-lucide="users" class="w-5 h-5" style="color:var(--ink)"></i></div>
          <h4 class="font-black uppercase text-sm mb-2">Invite partners</h4>
          <p class="text-sm font-medium" style="color:var(--muted)">Add suppliers and customers. They only see what you share.</p>
        </div>
        <div class="p-6 rounded-[22px] hover-float" style="background:var(--white);border:1px solid var(--line)">
          <div class="w-11 h-11 rounded-xl mb-4 flex items-center justify-center" style="background:var(--blue)"><i data-lucide="radio" class="w-5 h-5" style="color:var(--ink)"></i></div>
          <h4 class="font-black uppercase text-sm mb-2">Story broadcast</h4>
          <p class="text-sm font-medium" style="color:var(--muted)">A load becomes a story bubble — route, vehicle, and bid count.</p>
        </div>
        <div class="p-6 rounded-[22px] hover-float" style="background:var(--white);border:1px solid var(--line)">
          <div class="w-11 h-11 rounded-xl mb-4 flex items-center justify-center" style="background:var(--blue)"><i data-lucide="handshake" class="w-5 h-5" style="color:var(--ink)"></i></div>
          <h4 class="font-black uppercase text-sm mb-2">Award once</h4>
          <p class="text-sm font-medium" style="color:var(--muted)">Accept a bid and the trip is created with both parties attached.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="boost" class="section-stack py-20 page-pad">
    <div class="wide-shell grid lg:grid-cols-2 gap-10 items-center">
      <div class="reveal min-w-0 order-2 lg:order-1">
        <div class="rounded-[28px] p-6" style="background:var(--blue-soft);border:1px solid var(--blue)">
          <div class="flex items-center justify-between gap-3 mb-5">
            <span class="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full" style="background:var(--gold);color:var(--ink)">Ad</span>
            <span class="text-[10px] font-bold" style="color:var(--muted)">Sponsored reach</span>
          </div>
          <h3 class="text-xl font-black italic uppercase mb-2">Chennai → Coimbatore</h3>
          <p class="text-sm font-medium mb-5" style="color:var(--muted)">Shown to 10 targeted orgs outside your circle. Impressions only count on their Get Load feed.</p>
          <div class="stat-grid">
            <div class="p-3 rounded-2xl" style="background:var(--white)"><p class="text-[10px] font-black uppercase" style="color:var(--muted)">Released</p><p class="text-lg font-black">10 orgs</p></div>
            <div class="p-3 rounded-2xl" style="background:var(--white)"><p class="text-[10px] font-black uppercase" style="color:var(--muted)">Credits</p><p class="text-lg font-black">Boost</p></div>
            <div class="p-3 rounded-2xl" style="background:var(--white)"><p class="text-[10px] font-black uppercase" style="color:var(--muted)">Lane</p><p class="text-lg font-black">FTL</p></div>
          </div>
        </div>
      </div>
      <div class="reveal min-w-0 order-1 lg:order-2">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] mb-3" style="color:var(--muted)">Boost</p>
        <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4">Sponsored loads, not noise<span class="dot-gold">.</span></h2>
        <p class="section-copy font-semibold mb-6" style="color:var(--muted)">
          Put a load in front of the right operators when your own network is thin. You never see your own ad in Get Load — Boost is for other orgs.
        </p>
        <div class="space-y-3">
          <div class="feature-row p-4 rounded-2xl" style="background:var(--canvas);border:1px solid var(--line)">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--gold)"><i data-lucide="megaphone" class="w-5 h-5"></i></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Targeted release</h4><p class="text-sm font-medium" style="color:var(--muted)">Credits push the indent to selected workspaces.</p></div>
          </div>
          <div class="feature-row p-4 rounded-2xl" style="background:var(--canvas);border:1px solid var(--line)">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--gold)"><i data-lucide="eye" class="w-5 h-5"></i></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Real impressions</h4><p class="text-sm font-medium" style="color:var(--muted)">Counted when another org views the sponsored card.</p></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section id="trips" class="section-stack py-20 page-pad text-white reveal" style="background:var(--ink)">
    <div class="wide-shell">
      <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4 text-center">End-to-end trip control<span class="dot-gold">.</span></h2>
      <p class="section-lead font-semibold max-w-2xl leading-relaxed mb-10 mx-auto text-center" style="color:rgba(255,255,255,0.62)">Assign drivers, track the lane, and settle into the ledger when the POD lands.</p>
      <div class="trip-feature-grid grid md:grid-cols-3 gap-4">
        <div class="p-6 rounded-2xl text-center" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08)">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4" style="background:var(--blue)"><i data-lucide="mouse-pointer-2" class="w-5 h-5" style="color:var(--ink)"></i></div>
          <h4 class="font-black uppercase text-sm mb-2 italic">Instant assign</h4>
          <p class="text-sm leading-relaxed font-medium" style="color:rgba(255,255,255,0.62)">Push the job to the driver app in one tap.</p>
        </div>
        <div class="p-6 rounded-2xl text-center" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08)">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4" style="background:var(--blue)"><i data-lucide="map-pinned" class="w-5 h-5" style="color:var(--ink)"></i></div>
          <h4 class="font-black uppercase text-sm mb-2 italic">Live route</h4>
          <p class="text-sm leading-relaxed font-medium" style="color:rgba(255,255,255,0.62)">GPS and status stay on the same trip card.</p>
        </div>
        <div class="p-6 rounded-2xl text-center" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08)">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4" style="background:var(--blue)"><i data-lucide="check-circle-2" class="w-5 h-5" style="color:var(--ink)"></i></div>
          <h4 class="font-black uppercase text-sm mb-2 italic">Auto-settlement</h4>
          <p class="text-sm leading-relaxed font-medium" style="color:rgba(255,255,255,0.62)">Completion writes the ledger lines — no re-keying.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="ledger" class="section-stack py-20 page-pad">
    <div class="wide-shell">
      <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4 reveal">Know exactly who paid what<span class="dot-gold">.</span></h2>
      <p class="section-lead font-semibold max-w-lg mb-8 reveal" style="color:var(--muted)">A shared ledger between you and your partners. Receivables, payables, and trip cash in one book.</p>
      <div class="ledger-grid grid lg:grid-cols-2 gap-5">
        <div class="p-7 rounded-[28px] reveal hover-float" style="background:var(--white);border:1px solid var(--line);box-shadow:0 18px 40px -24px var(--shadow)">
          <div class="flex justify-between items-center p-4 rounded-2xl mb-3" style="background:var(--canvas)">
            <span class="font-black uppercase text-[10px] tracking-widest" style="color:var(--muted)">My ledger</span>
            <span class="font-black text-2xl italic">₹5,839.00</span>
          </div>
          <div class="flex justify-between items-center p-4 rounded-2xl" style="background:var(--blue-soft);border:1px solid var(--blue)">
            <span class="font-black uppercase text-[10px] tracking-widest" style="color:var(--ink)">Partner side</span>
            <span class="font-black text-2xl italic" style="color:var(--ink)">₹5,839.00</span>
          </div>
        </div>
        <div class="p-7 rounded-[28px] reveal hover-float flex flex-col justify-between" style="background:var(--ink);color:var(--white)">
          <div>
            <h4 class="text-2xl font-black italic uppercase mb-3 leading-tight">No payment confusion<span class="dot-gold">.</span></h4>
            <p class="text-sm font-medium leading-relaxed" style="color:rgba(255,255,255,0.7)">Price is locked before the manifest moves. Finance stays double-entry.</p>
          </div>
          <a href="/onboarding" target="_top" class="cta-primary block w-full py-4 font-black text-[11px] uppercase tracking-[0.2em] mt-8 text-center">Open ledger</a>
        </div>
      </div>
    </div>
  </section>

  <section id="analytics" class="section-stack py-16 page-pad" style="background:var(--canvas)">
    <div class="wide-shell grid lg:grid-cols-2 gap-10 items-center">
      <div class="reveal min-w-0">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] mb-3" style="color:var(--muted)">Analytics</p>
        <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4">See the business, not just the trip<span class="dot-gold">.</span></h2>
        <p class="section-copy font-semibold mb-6" style="color:var(--muted)">
          Workspace analytics for lanes, collections, Boost spend, and team activity — the same numbers your ops and finance teams already work from.
        </p>
        <div class="space-y-3">
          <div class="feature-row p-4 rounded-2xl" style="background:var(--white);border:1px solid var(--line)">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--blue)"><i data-lucide="chart-column" class="w-5 h-5"></i></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Lane &amp; revenue</h4><p class="text-sm font-medium" style="color:var(--muted)">Volume and settlement by corridor.</p></div>
          </div>
          <div class="feature-row p-4 rounded-2xl" style="background:var(--white);border:1px solid var(--line)">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--blue)"><i data-lucide="coins" class="w-5 h-5"></i></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Credits &amp; Boost</h4><p class="text-sm font-medium" style="color:var(--muted)">Campaign spend next to impressions.</p></div>
          </div>
        </div>
      </div>
      <div class="reveal min-w-0">
        <div class="rounded-[28px] p-6" style="background:var(--white);border:1px solid var(--line)">
          <div class="flex justify-between items-end mb-6 gap-3">
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest" style="color:var(--muted)">This week</p>
              <p class="text-3xl font-black italic">₹12.4L</p>
            </div>
            <span class="text-[11px] font-black px-2.5 py-1 rounded-full" style="background:var(--blue);color:var(--ink)">+18%</span>
          </div>
          <div class="grid grid-cols-4 gap-2 items-end h-28 mb-2">
            <div class="rounded-t-lg" style="height:46%;background:var(--blue)"></div>
            <div class="rounded-t-lg" style="height:70%;background:var(--blue-pressed)"></div>
            <div class="rounded-t-lg" style="height:58%;background:var(--blue)"></div>
            <div class="rounded-t-lg" style="height:92%;background:var(--gold)"></div>
          </div>
          <div class="grid grid-cols-4 text-[10px] font-bold uppercase tracking-wider" style="color:var(--muted)">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section id="drivers" class="section-stack py-20 page-pad">
    <div class="wide-shell grid lg:grid-cols-2 gap-10 items-center">
      <div class="reveal min-w-0">
        <h2 class="headline-lg font-black tracking-tighter uppercase italic leading-none mb-4">Built for drivers too<span class="dot-gold">.</span></h2>
        <p class="section-lead font-semibold max-w-md mb-8" style="color:var(--muted)">Trip updates, digital POD, and expenses on the same phone the office already tracks.</p>
        <div class="driver-feature-grid grid grid-cols-2 gap-3">
          <div class="p-4 rounded-xl flex flex-col items-center text-center gap-2" style="background:var(--canvas);border:1px solid var(--line)"><i data-lucide="smartphone" class="w-5 h-5"></i><span class="font-black uppercase text-[10px] tracking-widest">Pilot app</span></div>
          <div class="p-4 rounded-xl flex flex-col items-center text-center gap-2" style="background:var(--canvas);border:1px solid var(--line)"><i data-lucide="camera" class="w-5 h-5"></i><span class="font-black uppercase text-[10px] tracking-widest">Instant POD</span></div>
          <div class="p-4 rounded-xl flex flex-col items-center text-center gap-2" style="background:var(--canvas);border:1px solid var(--line)"><i data-lucide="fuel" class="w-5 h-5"></i><span class="font-black uppercase text-[10px] tracking-widest">Expense logs</span></div>
          <div class="p-4 rounded-xl flex flex-col items-center text-center gap-2" style="background:var(--canvas);border:1px solid var(--line)"><i data-lucide="wallet" class="w-5 h-5"></i><span class="font-black uppercase text-[10px] tracking-widest">Pay status</span></div>
        </div>
      </div>
      <div class="reveal flex justify-center">
        <div class="w-60 h-[460px] rounded-[2.5rem] p-7 relative overflow-hidden" style="background:var(--ink);border:10px solid #3d2a2a;box-shadow:0 36px 70px -28px var(--shadow)">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-6 rounded-b-xl" style="background:#3d2a2a"></div>
          <div class="mt-8 space-y-5">
            <div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full" style="background:var(--gold)"></div><span class="text-[9px] font-black uppercase tracking-widest" style="color:rgba(255,255,255,0.4)">Active_Trip</span></div>
            <h5 class="text-xl font-black tracking-tighter text-white italic uppercase leading-none">VARANASI HUB</h5>
            <div class="h-1.5 w-full rounded-full overflow-hidden" style="background:rgba(255,255,255,0.08)"><div class="h-full w-2/3" style="background:var(--gold)"></div></div>
            <div class="p-4 rounded-xl" style="background:rgba(255,255,255,0.06)">
              <p class="text-[8px] font-black uppercase mb-1" style="color:rgba(255,255,255,0.4)">Assigned manifest</p>
              <p class="text-[11px] font-bold text-white uppercase italic">20ft_Cont_TRP092</p>
            </div>
          </div>
          <a href="/onboarding" target="_top" class="cta-primary absolute bottom-7 left-7 right-7 py-3 font-black text-[10px] uppercase text-center">Upload POD</a>
        </div>
      </div>
    </div>
  </section>

  <section id="steps" class="section-stack py-16 page-pad text-center" style="background:var(--canvas)">
    <div class="wide-shell reveal">
      <h2 class="headline-lg font-black italic uppercase mb-10">3 steps to start<span class="dot-gold">.</span></h2>
      <div class="steps-grid grid sm:grid-cols-3 gap-8 relative">
        <div class="absolute top-8 left-[12%] right-[12%] h-px hidden sm:block" style="background:var(--line)"></div>
        <div class="relative z-10 space-y-4">
          <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto text-lg font-black italic" style="background:var(--ink);color:var(--gold);border:3px solid var(--white)">01</div>
          <div><h4 class="font-black uppercase text-sm">Connect your network</h4><p class="font-bold uppercase text-[10px] tracking-widest mt-1" style="color:var(--muted)">Invite partners.</p></div>
        </div>
        <div class="relative z-10 space-y-4">
          <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto text-lg font-black italic" style="background:var(--ink);color:var(--gold);border:3px solid var(--white)">02</div>
          <div><h4 class="font-black uppercase text-sm">Post &amp; bid</h4><p class="font-bold uppercase text-[10px] tracking-widest mt-1" style="color:var(--muted)">Exchange + Boost.</p></div>
        </div>
        <div class="relative z-10 space-y-4">
          <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto text-lg font-black italic" style="background:var(--ink);color:var(--gold);border:3px solid var(--white)">03</div>
          <div><h4 class="font-black uppercase text-sm">Settle &amp; see</h4><p class="font-bold uppercase text-[10px] tracking-widest mt-1" style="color:var(--muted)">Ledger + analytics.</p></div>
        </div>
      </div>
    </div>
  </section>

  <div class="site-dark-tail">
    <section class="final-cta py-20 page-pad text-white text-center relative overflow-hidden">
      <div class="wide-shell relative z-10 reveal max-w-4xl">
        <h2 class="final-title font-black italic mb-8 uppercase">
          <span id="final-typewriter" data-text="CONNECT YOUR BUSINESS"></span><span class="dot-gold">.</span>
        </h2>
        <a href="/onboarding" target="_top" class="cta-primary inline-block px-10 py-4 font-black text-sm uppercase tracking-[0.16em] hover-float">Initialize Now</a>
      </div>
    </section>
    <footer class="py-10 page-pad text-center">
      <p class="text-[10px] font-black uppercase tracking-widest italic" style="color:rgba(255,255,255,0.38)">gogopulse by Vayzen Technologies Pvt Ltd</p>
    </footer>
  </div>
  <div class="mobile-tabbar">
    <a href="#exchange">Exchange</a>
    <a href="#boost">Boost</a>
    <a href="#ledger">Ledger</a>
    <a href="#analytics">Analytics</a>
    <a href="/onboarding" target="_top">Enter</a>
  </div>
  <script>
    lucide.createIcons();
    const typeEl = document.getElementById('typewriter');
    if (typeEl) {
      const text = typeEl.getAttribute('data-text') || '';
      const TYPE_SPEED_MS = 90;
      const REPLAY_EVERY_MS = 5 * 60 * 1000;
      const runTypewriter = () => {
        let idx = 0;
        typeEl.textContent = '';
        const t = setInterval(() => {
          idx += 1;
          typeEl.textContent = text.slice(0, idx);
          if (idx >= text.length) clearInterval(t);
        }, TYPE_SPEED_MS);
      };
      runTypewriter();
      setInterval(runTypewriter, REPLAY_EVERY_MS);
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('in');
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

    const finalTypeEl = document.getElementById('final-typewriter');
    if (finalTypeEl) {
      const finalText = finalTypeEl.getAttribute('data-text') || '';
      let finalAnimated = false;
      const runFinalTypewriter = () => {
        if (finalAnimated) return;
        finalAnimated = true;
        let idx = 0;
        finalTypeEl.textContent = '';
        const t = setInterval(() => {
          idx += 1;
          finalTypeEl.textContent = finalText.slice(0, idx);
          if (idx >= finalText.length) clearInterval(t);
        }, 80);
      };
      const finalObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) runFinalTypewriter();
        });
      }, { threshold: 0.35 });
      finalObserver.observe(finalTypeEl);
    }

    const HEADER_OFFSET = 76;
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (event) => {
        const href = anchor.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        event.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    });

    document.body.addEventListener(
      'click',
      function (event) {
        const el = event.target;
        if (!el || typeof el.closest !== 'function') return;
        const anchor = el.closest('a[href^="/onboarding"], a[href^="/sign-in"], a[href^="/welcome"]');
        if (!anchor) return;
        event.preventDefault();
        event.stopPropagation();
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: '${PULSE_SIGN_IN_NAV}', v: 1 }, '*');
          }
        } catch (_) {}
      },
      true
    );
  </script>
</body>
</html>`;

export default function TerminalWebsitePage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== PULSE_SIGN_IN_NAV || event.data?.v !== 1) return;
      if (iframeRef.current?.contentWindow !== event.source) return;
      router.push(ROUTES.ONBOARDING.HUB);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [router]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.nativeWrap}>
        <View style={styles.nativeTitleRow}>
          <PulseBrandMark size="lg" />
        </View>
        <Text style={styles.nativeBody}>This page is designed for web. Continue to pulse.</Text>
        <Pressable onPress={() => router.push(ROUTES.ONBOARDING.HUB)} style={styles.nativeBtn}>
          <Text style={styles.nativeBtnText}>Enter OS</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      title="pulse."
      srcDoc={WEBSITE_HTML}
      style={{ width: '100%', height: '100vh', border: 'none' }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation allow-top-navigation-by-user-activation"
    />
  );
}

const styles = StyleSheet.create({
  nativeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 24,
  },
  nativeTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  nativeBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  nativeBtn: {
    marginTop: 14,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  nativeBtnText: {
    color: Theme.buttonPrimaryText,
    fontWeight: '900',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
