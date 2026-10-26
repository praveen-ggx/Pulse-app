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
      padding-left: max(32px, env(safe-area-inset-left), 3vw);
      padding-right: max(32px, env(safe-area-inset-right), 3vw);
    }
    .wide-shell {
      width: 100%;
      max-width: 1680px;
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
    .hero-dot {
      display: inline-block;
      color: var(--gold);
      transform-origin: center bottom;
      animation: heroDotPulse 1.8s ease-in-out infinite;
    }
    @keyframes heroDotPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.45; transform: scale(0.86); }
    }
    .glass-nav {
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--line);
      transition: box-shadow 280ms ease;
    }
    .glass-nav.is-scrolled { box-shadow: 0 10px 28px -20px var(--shadow); }
    .site-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      min-height: 56px;
      gap: 20px;
    }
    .brand-mark { transition: opacity 200ms ease; justify-self: start; }
    .brand-mark:hover { opacity: 0.7; }
    .nav-desktop {
      display: none;
      align-items: center;
      justify-content: center;
      gap: 32px;
    }
    .header-cta { justify-self: end; }
    .hero-title {
      font-size: clamp(40px, 6vw, 80px);
      line-height: 0.94;
      letter-spacing: -0.028em;
      word-spacing: 0.08em;
      max-width: 9.4em;
    }
    .final-title { font-size: clamp(34px, 5.6vw, 72px); line-height: 0.94; letter-spacing: -0.028em; word-spacing: 0.08em; }
    .headline-lg { font-size: clamp(1.6rem, 2.8vw, 2.5rem) !important; line-height: 1.12 !important; letter-spacing: -0.02em !important; word-spacing: 0.06em; }
    .support-copy { font-size: clamp(0.9375rem, 1.05vw, 1.0625rem); line-height: 1.55; }
    .section-copy { font-size: 0.95rem; line-height: 1.5; }
    .nav-link {
      display: inline-flex;
      align-items: center;
      font-size: 11px;
      line-height: 1;
      letter-spacing: 0.08em;
      padding: 8px 0;
      position: relative;
      text-decoration: none;
      white-space: nowrap;
      transition: opacity 200ms ease;
    }
    .nav-link::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: 2px;
      height: 1.5px;
      background: var(--ink);
      transform: scaleX(0);
      transform-origin: left;
      transition: transform 240ms ease;
    }
    .nav-link:hover { opacity: 1; }
    .nav-link:hover::after { transform: scaleX(1); }
    .tight-btn { letter-spacing: 0.12em; font-size: 12px; }
    .section-lead { font-size: 0.95rem !important; line-height: 1.55 !important; }
    .cta-primary, .cta-ghost, .cta-ink {
      display: inline-block;
      transition: background 200ms ease, border-color 200ms ease, transform 200ms ease, box-shadow 200ms ease;
    }
    .cta-primary {
      background: var(--blue);
      color: var(--ink);
      border: 1.5px solid var(--ink);
      border-radius: 999px;
    }
    .cta-primary:hover {
      background: var(--blue-pressed);
      transform: translateY(-1px);
      box-shadow: 0 8px 18px -14px var(--shadow);
    }
    .cta-ghost {
      background: var(--white);
      color: var(--ink);
      border: 1.5px solid var(--line);
      border-radius: 999px;
    }
    .cta-ghost:hover {
      border-color: var(--ink);
      background: var(--blue-soft);
      transform: translateY(-1px);
    }
    .cta-ink {
      background: var(--ink);
      color: var(--white);
      border: 1.5px solid var(--ink);
      border-radius: 999px;
    }
    .cta-ink:hover { background: #3d2a2a; transform: translateY(-1px); }
    .cta-primary:active, .cta-ghost:active, .cta-ink:active { transform: translateY(0); }
    .reveal {
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 520ms cubic-bezier(0.22, 1, 0.36, 1), transform 520ms cubic-bezier(0.22, 1, 0.36, 1);
      transition-delay: var(--reveal-delay, 0ms);
    }
    .reveal.in { opacity: 1; transform: translateY(0); }
    .hover-tile {
      transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease, background 220ms ease;
    }
    .hover-tile:hover {
      transform: translateY(-2px);
      border-color: rgba(77, 54, 54, 0.22);
      box-shadow: 0 14px 28px -22px var(--shadow);
    }
    .hover-tile-dark {
      transition: transform 220ms ease, background 220ms ease, border-color 220ms ease;
    }
    .hover-tile-dark:hover {
      transform: translateY(-2px);
      background: rgba(255,255,255,0.09);
      border-color: rgba(255,255,255,0.16);
    }
    .icon-chip { transition: transform 220ms ease; }
    .hover-tile:hover .icon-chip,
    .hover-tile-dark:hover .icon-chip { transform: scale(1.05); }
    @keyframes pulseSoft { 0%,100% { opacity: .16; transform: scale(1); } 50% { opacity: .28; transform: scale(1.02); } }
    @keyframes floatCard { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
    @keyframes liveGlow { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    @keyframes quotePulse { 0%,100% { opacity: 0.28; } 50% { opacity: 0.7; } }
    .bg-glow { animation: pulseSoft 8s ease-in-out infinite; background: var(--blue); }
    .float-card { animation: floatCard 10s ease-in-out infinite; }
    .float-card:hover { animation-play-state: paused; }
    .live-dot { animation: liveGlow 2.6s ease-in-out infinite; }
    .quote-live { position: relative; }
    .quote-live::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      box-shadow: 0 0 0 1px rgba(255,206,68,0.2);
      animation: quotePulse 3.6s ease-in-out infinite;
    }
    .chart-bar {
      transform-origin: bottom;
      transform: scaleY(0.4);
      opacity: 0.6;
      transition: transform 720ms cubic-bezier(0.22, 1, 0.36, 1), opacity 480ms ease;
    }
    .reveal.in .chart-bar { transform: scaleY(1); opacity: 1; }
    .chart-bar:nth-child(2) { transition-delay: 70ms; }
    .chart-bar:nth-child(3) { transition-delay: 140ms; }
    .chart-bar:nth-child(4) { transition-delay: 210ms; }
    .progress-fill {
      width: 0;
      transition: width 860ms cubic-bezier(0.22, 1, 0.36, 1) 160ms;
    }
    .reveal.in .progress-fill { width: 66%; }
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
    @media (min-width: 1025px) {
      .nav-desktop { display: flex; }
    }
    @media (max-width: 1024px) {
      html { scroll-padding-top: 68px; }
      section[id], div[id] { scroll-margin-top: 68px; }
      .hero-title { font-size: clamp(30px, 8vw, 46px); }
      .final-title { font-size: clamp(28px, 7.5vw, 42px); }
      .headline-lg { font-size: clamp(1.4rem, 5.6vw, 1.85rem) !important; }
      .site-header { min-height: 52px; gap: 12px; }
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
      .reveal, .hover-tile, .hover-tile-dark, .float-card, .bg-glow, .live-dot, .hero-dot,
      .cta-primary, .cta-ghost, .cta-ink, .nav-link::after, .chart-bar, .progress-fill,
      .quote-live::after, .icon-chip, .glass-nav {
        animation: none !important;
        transition: none !important;
      }
      .reveal { opacity: 1; transform: none; }
      .chart-bar { transform: none; opacity: 1; }
      .progress-fill { width: 66%; }
      .cta-primary:hover, .cta-ghost:hover, .cta-ink:hover,
      .hover-tile:hover, .hover-tile-dark:hover { transform: none; }
    }
    @media (max-width: 767px) {
      .hero-section { padding-top: 96px !important; padding-bottom: 48px !important; }
      .hero-actions a { width: 100%; }
      .stat-grid, .trip-feature-grid, .steps-grid, .ledger-grid, .product-grid { grid-template-columns: minmax(0, 1fr) !important; }
      .driver-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      .section-stack { padding-top: 48px !important; padding-bottom: 48px !important; }
      .hero-title { max-width: 8.6em !important; }
      .nav-desktop { display: none !important; }
      .site-header { grid-template-columns: minmax(0, 1fr) auto; }
    }
    .min-h-screen { min-height: 100vh; }
    .bg-white { background: #fff; }
    .font-sans { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .overflow-x-hidden { overflow-x: hidden; }
    .overflow-hidden { overflow: hidden; }
    .fixed { position: fixed; }
    .relative { position: relative; }
    .absolute { position: absolute; }
    .top-0 { top: 0; }
    .left-0 { left: 0; }
    .right-0 { right: 0; }
    .bottom-7 { bottom: 1.75rem; }
    .left-7 { left: 1.75rem; }
    .right-7 { right: 1.75rem; }
    .inset-0 { inset: 0; }
    .-inset-10 { inset: -2.5rem; }
    .left-1\\/2 { left: 50%; }
    .top-8 { top: 2rem; }
    .left-\\[12\\%\\] { left: 12%; }
    .right-\\[12\\%\\] { right: 12%; }
    .z-\\[100\\] { z-index: 100; }
    .z-10 { z-index: 10; }
    .-z-10 { z-index: -10; }
    .min-w-0 { min-width: 0; }
    .w-full { width: 100%; }
    .w-11 { width: 2.75rem; }
    .w-14 { width: 3.5rem; }
    .w-5 { width: 1.25rem; }
    .w-2\\.5 { width: 0.625rem; }
    .w-2 { width: 0.5rem; }
    .w-60 { width: 15rem; }
    .h-11 { height: 2.75rem; }
    .h-14 { height: 3.5rem; }
    .h-5 { height: 1.25rem; }
    .h-6 { height: 1.5rem; }
    .h-2\\.5 { height: 0.625rem; }
    .h-2 { height: 0.5rem; }
    .h-1\\.5 { height: 0.375rem; }
    .h-28 { height: 7rem; }
    .h-px { height: 1px; }
    .h-\\[460px\\] { height: 460px; }
    .max-w-2xl { max-width: 42rem; }
    .max-w-4xl { max-width: 56rem; }
    .max-w-md { max-width: 28rem; }
    .flex { display: flex; }
    .grid { display: grid; }
    .block { display: block; }
    .inline-block { display: inline-block; }
    .hidden { display: none; }
    .flex-col { flex-direction: column; }
    .flex-wrap { flex-wrap: wrap; }
    .items-center { align-items: center; }
    .items-end { align-items: flex-end; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .shrink-0 { flex-shrink: 0; }
    .gap-1\\.5 { gap: 0.375rem; }
    .gap-2 { gap: 0.5rem; }
    .gap-3 { gap: 0.75rem; }
    .gap-4 { gap: 1rem; }
    .gap-8 { gap: 2rem; }
    .gap-10 { gap: 2.5rem; }
    .gap-12 { gap: 3rem; }
    .space-y-3 > * + * { margin-top: 0.75rem; }
    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-5 > * + * { margin-top: 1.25rem; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .p-3 { padding: 0.75rem; }
    .p-4 { padding: 1rem; }
    .p-5 { padding: 1.25rem; }
    .p-6 { padding: 1.5rem; }
    .p-7 { padding: 1.75rem; }
    .px-2\\.5 { padding-left: 0.625rem; padding-right: 0.625rem; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .px-5 { padding-left: 1.25rem; padding-right: 1.25rem; }
    .px-8 { padding-left: 2rem; padding-right: 2rem; }
    .px-10 { padding-left: 2.5rem; padding-right: 2.5rem; }
    .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .py-2\\.5 { padding-top: 0.625rem; padding-bottom: 0.625rem; }
    .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
    .py-3\\.5 { padding-top: 0.875rem; padding-bottom: 0.875rem; }
    .py-4 { padding-top: 1rem; padding-bottom: 1rem; }
    .py-10 { padding-top: 2.5rem; padding-bottom: 2.5rem; }
    .py-16 { padding-top: 4rem; padding-bottom: 4rem; }
    .py-20 { padding-top: 5rem; padding-bottom: 5rem; }
    .pt-28 { padding-top: 7rem; }
    .pb-20 { padding-bottom: 5rem; }
    .mb-1 { margin-bottom: 0.25rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-3 { margin-bottom: 0.75rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-5 { margin-bottom: 1.25rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mb-7 { margin-bottom: 1.75rem; }
    .mb-8 { margin-bottom: 2rem; }
    .mb-10 { margin-bottom: 2.5rem; }
    .mt-1 { margin-top: 0.25rem; }
    .mt-8 { margin-top: 2rem; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    .text-center { text-align: center; }
    .text-white { color: #fff; }
    .text-white\\/85 { color: rgba(255,255,255,0.85); }
    .text-white\\/80 { color: rgba(255,255,255,0.8); }
    .font-black { font-weight: 900; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-medium { font-weight: 500; }
    .italic { font-style: italic; }
    .uppercase { text-transform: uppercase; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .text-\\[8px\\] { font-size: 8px; }
    .text-\\[9px\\] { font-size: 9px; }
    .text-\\[10px\\] { font-size: 10px; }
    .text-\\[11px\\] { font-size: 11px; }
    .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
    .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
    .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
    .text-2xl { font-size: 1.5rem; line-height: 2rem; }
    .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
    .tracking-tight { letter-spacing: -0.025em; }
    .tracking-tighter { letter-spacing: -0.05em; }
    .tracking-wider { letter-spacing: 0.05em; }
    .tracking-widest { letter-spacing: 0.1em; }
    .tracking-\\[0.28em\\] { letter-spacing: 0.28em; }
    .tracking-\\[0.2em\\] { letter-spacing: 0.2em; }
    .tracking-\\[0.16em\\] { letter-spacing: 0.16em; }
    .leading-relaxed { line-height: 1.625; }
    .leading-tight { line-height: 1.25; }
    .leading-none { line-height: 1; }
    .rounded-full { border-radius: 9999px; }
    .rounded-xl { border-radius: 0.75rem; }
    .rounded-2xl { border-radius: 1rem; }
    .rounded-t-lg { border-top-left-radius: 0.5rem; border-top-right-radius: 0.5rem; }
    .rounded-b-xl { border-bottom-left-radius: 0.75rem; border-bottom-right-radius: 0.75rem; }
    .rounded-\\[22px\\] { border-radius: 22px; }
    .rounded-\\[28px\\] { border-radius: 28px; }
    .rounded-\\[2\\.5rem\\] { border-radius: 2.5rem; }
    .opacity-60 { opacity: 0.6; }
    .opacity-70 { opacity: 0.7; }
    .blur-\\[80px\\] { filter: blur(80px); }
    .-translate-x-1\\/2 { transform: translateX(-50%); }
    .order-1 { order: 1; }
    .order-2 { order: 2; }
    .icon-svg { width: 20px; height: 20px; display: block; flex-shrink: 0; }
    @media (min-width: 640px) {
      .sm\\:flex-row { flex-direction: row; }
      .sm\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .sm\\:block { display: block; }
    }
    @media (min-width: 768px) {
      .md\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .md\\:p-8 { padding: 2rem; }
      .md\\:p-6 { padding: 1.5rem; }
      .md\\:text-base { font-size: 1rem; line-height: 1.5rem; }
      .md\\:text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
    }
    @media (min-width: 1024px) {
      .lg\\:grid-cols-2 { grid-template-columns: 1fr 1fr; }
      .lg\\:grid-cols-\\[1fr_1\\.05fr\\] { grid-template-columns: 1fr 1.05fr; }
      .lg\\:order-1 { order: 1; }
      .lg\\:order-2 { order: 2; }
      .lg\\:justify-self-end { justify-self: end; }
    }
    @media (min-width: 1280px) {
      .xl\\:gap-16 { gap: 4rem; }
      .xl\\:gap-14 { gap: 3.5rem; }
    }
  </style>
</head>
<body id="top" class="min-h-screen bg-white font-sans overflow-x-hidden">
  <nav class="fixed top-0 left-0 right-0 z-[100] glass-nav page-pad">
    <div class="wide-shell site-header min-w-0">
      <a href="#top" class="brand-mark">pulse<span class="brand-dot">.</span></a>
      <div class="nav-desktop">
        <a href="#exchange" class="nav-link font-black uppercase" style="color:var(--ink)">Exchange</a>
        <a href="#network" class="nav-link font-black uppercase" style="color:var(--ink)">Network</a>
        <a href="#boost" class="nav-link font-black uppercase" style="color:var(--ink)">Boost</a>
        <a href="#ledger" class="nav-link font-black uppercase" style="color:var(--ink)">Ledger</a>
        <a href="#analytics" class="nav-link font-black uppercase" style="color:var(--ink)">Analytics</a>
      </div>
      <a href="/onboarding" target="_top" class="cta-ink header-cta px-5 py-2.5 text-[10px] font-black uppercase tracking-widest shrink-0">Enter OS</a>
    </div>
  </nav>

  <section class="hero-section relative pt-28 pb-20 page-pad overflow-hidden" style="background:var(--canvas)">
    <div class="wide-shell grid lg:grid-cols-2 gap-12 xl:gap-16 items-center">
      <div class="relative z-10 reveal min-w-0">
        <h1 class="hero-title font-black italic mb-7 uppercase" style="color:var(--ink)">
          MOVE BUSINESS FASTER<span class="hero-dot">.</span>
        </h1>
        <p class="support-copy font-medium max-w-2xl mb-8" style="color:var(--muted)">
          Run loads, bidding, sponsored reach, ledger, and analytics on one workspace — from first quote to settlement.
        </p>
        <div class="hero-actions flex flex-col sm:flex-row gap-3">
          <a href="/onboarding" target="_top" class="cta-primary px-8 py-3.5 font-black uppercase tight-btn text-center">Get Started</a>
          <a href="#exchange" class="cta-ghost px-8 py-3.5 font-black uppercase tight-btn text-center">See Features</a>
        </div>
      </div>
      <div class="relative reveal w-full lg:justify-self-end min-w-0" style="--reveal-delay:90ms">
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
              <svg class="icon-svg shrink-0 live-dot" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--gold)"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
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
        <h2 class="headline-lg font-black uppercase italic mb-4">The marketplace for live loads<span class="dot-gold">.</span></h2>
        <p class="section-copy font-semibold max-w-2xl mb-7" style="color:var(--muted)">
          Post a load to your connected network. Partners bid in the same thread. Award once — trip, ledger, and POD stay linked.
        </p>
        <div class="space-y-3">
          <div class="feature-row hover-tile p-4 rounded-2xl" style="background:var(--canvas);border:1px solid var(--line)">
            <div class="icon-chip w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--white);color:var(--ink)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.07 2.07 0 0 1-2-2V7"/></svg></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Give &amp; get loads</h4><p class="text-sm font-medium" style="color:var(--muted)">Broadcast to connections from Load Center.</p></div>
          </div>
          <div class="feature-row hover-tile p-4 rounded-2xl" style="background:var(--canvas);border:1px solid var(--line)">
            <div class="icon-chip w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--white);color:var(--ink)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 13-7.5 7.5"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/></svg></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Live bidding</h4><p class="text-sm font-medium" style="color:var(--muted)">Quotes land on the story. Award the best rate.</p></div>
          </div>
          <div class="feature-row hover-tile p-4 rounded-2xl" style="background:var(--canvas);border:1px solid var(--line)">
            <div class="icon-chip w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--white);color:var(--ink)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Connected network</h4><p class="text-sm font-medium" style="color:var(--muted)">Only verified partners in your circle see the load.</p></div>
          </div>
        </div>
      </div>
      <div class="reveal min-w-0" style="--reveal-delay:80ms">
        <div class="product-dark rounded-[28px] p-5 md:p-6 relative overflow-hidden" style="background:var(--ink)">
          <div class="relative z-10 space-y-3">
            <div class="hover-tile-dark quote-live p-5 rounded-2xl" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08)">
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
            <div class="hover-tile-dark p-5 rounded-2xl opacity-70" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)">
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
        <h2 class="headline-lg font-black uppercase italic mb-4">Your circle. Your loads<span class="dot-gold">.</span></h2>
        <p class="section-lead font-semibold" style="color:var(--muted)">Pulse Story posts stay inside the connections you trust. Bid from the reel, award from the same indent.</p>
      </div>
      <div class="product-grid grid md:grid-cols-3 gap-4">
        <div class="reveal hover-tile p-6 rounded-[22px]" style="background:var(--white);border:1px solid var(--line);--reveal-delay:40ms">
          <div class="icon-chip w-11 h-11 rounded-xl mb-4 flex items-center justify-center" style="background:var(--blue)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--ink)"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <h4 class="font-black uppercase text-sm mb-2">Invite partners</h4>
          <p class="text-sm font-medium" style="color:var(--muted)">Add suppliers and customers. They only see what you share.</p>
        </div>
        <div class="reveal hover-tile p-6 rounded-[22px]" style="background:var(--white);border:1px solid var(--line);--reveal-delay:110ms">
          <div class="icon-chip w-11 h-11 rounded-xl mb-4 flex items-center justify-center" style="background:var(--blue)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--ink)"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg></div>
          <h4 class="font-black uppercase text-sm mb-2">Story broadcast</h4>
          <p class="text-sm font-medium" style="color:var(--muted)">A load becomes a story bubble — route, vehicle, and bid count.</p>
        </div>
        <div class="reveal hover-tile p-6 rounded-[22px]" style="background:var(--white);border:1px solid var(--line);--reveal-delay:180ms">
          <div class="icon-chip w-11 h-11 rounded-xl mb-4 flex items-center justify-center" style="background:var(--blue)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--ink)"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></svg></div>
          <h4 class="font-black uppercase text-sm mb-2">Award once</h4>
          <p class="text-sm font-medium" style="color:var(--muted)">Accept a bid and the trip is created with both parties attached.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="boost" class="section-stack py-20 page-pad">
    <div class="wide-shell grid lg:grid-cols-2 gap-10 items-center">
      <div class="reveal min-w-0 order-2 lg:order-1">
        <div class="hover-tile rounded-[28px] p-6" style="background:var(--blue-soft);border:1px solid var(--blue)">
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
        <h2 class="headline-lg font-black uppercase italic mb-4">Sponsored loads, not noise<span class="dot-gold">.</span></h2>
        <p class="section-copy font-semibold mb-6" style="color:var(--muted)">
          Put a load in front of the right operators when your own network is thin. You never see your own ad in Get Load — Boost is for other orgs.
        </p>
        <div class="space-y-3">
          <div class="feature-row hover-tile p-4 rounded-2xl" style="background:var(--canvas);border:1px solid var(--line)">
            <div class="icon-chip w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--gold)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Targeted release</h4><p class="text-sm font-medium" style="color:var(--muted)">Credits push the indent to selected workspaces.</p></div>
          </div>
          <div class="feature-row hover-tile p-4 rounded-2xl" style="background:var(--canvas);border:1px solid var(--line)">
            <div class="icon-chip w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--gold)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Real impressions</h4><p class="text-sm font-medium" style="color:var(--muted)">Counted when another org views the sponsored card.</p></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section id="trips" class="section-stack py-20 page-pad text-white reveal" style="background:var(--ink)">
    <div class="wide-shell">
      <h2 class="headline-lg font-black uppercase italic mb-4 text-center">End-to-end trip control<span class="dot-gold">.</span></h2>
      <p class="section-lead font-semibold max-w-2xl leading-relaxed mb-10 mx-auto text-center" style="color:rgba(255,255,255,0.62)">Assign drivers, track the lane, and settle into the ledger when the POD lands.</p>
      <div class="trip-feature-grid grid md:grid-cols-3 gap-4">
        <div class="hover-tile-dark p-6 rounded-2xl text-center" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08)">
          <div class="icon-chip w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4" style="background:var(--blue)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--ink)"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.941l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.941.063z"/></svg></div>
          <h4 class="font-black uppercase text-sm mb-2 italic">Instant assign</h4>
          <p class="text-sm leading-relaxed font-medium" style="color:rgba(255,255,255,0.62)">Push the job to the driver app in one tap.</p>
        </div>
        <div class="hover-tile-dark p-6 rounded-2xl text-center" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08)">
          <div class="icon-chip w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4" style="background:var(--blue)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--ink)"><path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0"/><circle cx="12" cy="8" r="2"/><path d="M8.714 14h-3.71a1 1 0 0 0-.948.684l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6A1 1 0 0 0 18.996 14h-3.712"/></svg></div>
          <h4 class="font-black uppercase text-sm mb-2 italic">Live route</h4>
          <p class="text-sm leading-relaxed font-medium" style="color:rgba(255,255,255,0.62)">GPS and status stay on the same trip card.</p>
        </div>
        <div class="hover-tile-dark p-6 rounded-2xl text-center" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08)">
          <div class="icon-chip w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4" style="background:var(--blue)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--ink)"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></div>
          <h4 class="font-black uppercase text-sm mb-2 italic">Auto-settlement</h4>
          <p class="text-sm leading-relaxed font-medium" style="color:rgba(255,255,255,0.62)">Completion writes the ledger lines — no re-keying.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="ledger" class="section-stack py-20 page-pad">
    <div class="wide-shell">
      <h2 class="headline-lg font-black uppercase italic mb-4 reveal">Know exactly who paid what<span class="dot-gold">.</span></h2>
      <p class="section-lead font-semibold max-w-2xl mb-8 reveal" style="color:var(--muted)">A shared ledger between you and your partners. Receivables, payables, and trip cash in one book.</p>
      <div class="ledger-grid grid lg:grid-cols-2 gap-5">
        <div class="p-7 rounded-[28px] reveal hover-tile" style="background:var(--white);border:1px solid var(--line);box-shadow:0 18px 40px -24px var(--shadow)">
          <div class="flex justify-between items-center p-4 rounded-2xl mb-3" style="background:var(--canvas)">
            <span class="font-black uppercase text-[10px] tracking-widest" style="color:var(--muted)">My ledger</span>
            <span class="font-black text-2xl italic">₹5,839.00</span>
          </div>
          <div class="flex justify-between items-center p-4 rounded-2xl" style="background:var(--blue-soft);border:1px solid var(--blue)">
            <span class="font-black uppercase text-[10px] tracking-widest" style="color:var(--ink)">Partner side</span>
            <span class="font-black text-2xl italic" style="color:var(--ink)">₹5,839.00</span>
          </div>
        </div>
        <div class="p-7 rounded-[28px] reveal hover-tile-dark flex flex-col justify-between" style="background:var(--ink);color:var(--white);--reveal-delay:80ms">
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
        <h2 class="headline-lg font-black uppercase italic mb-4">See the business, not just the trip<span class="dot-gold">.</span></h2>
        <p class="section-copy font-semibold mb-6" style="color:var(--muted)">
          Workspace analytics for lanes, collections, Boost spend, and team activity — the same numbers your ops and finance teams already work from.
        </p>
        <div class="space-y-3">
          <div class="feature-row hover-tile p-4 rounded-2xl" style="background:var(--white);border:1px solid var(--line)">
            <div class="icon-chip w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--blue)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Lane &amp; revenue</h4><p class="text-sm font-medium" style="color:var(--muted)">Volume and settlement by corridor.</p></div>
          </div>
          <div class="feature-row hover-tile p-4 rounded-2xl" style="background:var(--white);border:1px solid var(--line)">
            <div class="icon-chip w-11 h-11 rounded-xl flex items-center justify-center" style="background:var(--blue)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg></div>
            <div class="min-w-0"><h4 class="font-black uppercase text-sm tracking-tight">Credits &amp; Boost</h4><p class="text-sm font-medium" style="color:var(--muted)">Campaign spend next to impressions.</p></div>
          </div>
        </div>
      </div>
      <div class="reveal min-w-0">
        <div class="hover-tile rounded-[28px] p-6" style="background:var(--white);border:1px solid var(--line)">
          <div class="flex justify-between items-end mb-6 gap-3">
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest" style="color:var(--muted)">This week</p>
              <p class="text-3xl font-black italic">₹12.4L</p>
            </div>
            <span class="text-[11px] font-black px-2.5 py-1 rounded-full" style="background:var(--blue);color:var(--ink)">+18%</span>
          </div>
          <div class="grid grid-cols-4 gap-2 items-end h-28 mb-2">
            <div class="chart-bar rounded-t-lg" style="height:46%;background:var(--blue)"></div>
            <div class="chart-bar rounded-t-lg" style="height:70%;background:var(--blue-pressed)"></div>
            <div class="chart-bar rounded-t-lg" style="height:58%;background:var(--blue)"></div>
            <div class="chart-bar rounded-t-lg" style="height:92%;background:var(--gold)"></div>
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
        <h2 class="headline-lg font-black uppercase italic mb-4">Built for drivers too<span class="dot-gold">.</span></h2>
        <p class="section-lead font-semibold max-w-md mb-8" style="color:var(--muted)">Trip updates, digital POD, and expenses on the same phone the office already tracks.</p>
        <div class="driver-feature-grid grid grid-cols-2 gap-3">
          <div class="hover-tile p-4 rounded-xl flex flex-col items-center text-center gap-2" style="background:var(--canvas);border:1px solid var(--line)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg><span class="font-black uppercase text-[10px] tracking-widest">Pilot app</span></div>
          <div class="hover-tile p-4 rounded-xl flex flex-col items-center text-center gap-2" style="background:var(--canvas);border:1px solid var(--line)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg><span class="font-black uppercase text-[10px] tracking-widest">Instant POD</span></div>
          <div class="hover-tile p-4 rounded-xl flex flex-col items-center text-center gap-2" style="background:var(--canvas);border:1px solid var(--line)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/></svg><span class="font-black uppercase text-[10px] tracking-widest">Expense logs</span></div>
          <div class="hover-tile p-4 rounded-xl flex flex-col items-center text-center gap-2" style="background:var(--canvas);border:1px solid var(--line)"><svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg><span class="font-black uppercase text-[10px] tracking-widest">Pay status</span></div>
        </div>
      </div>
      <div class="reveal flex justify-center">
        <div class="w-60 h-[460px] rounded-[2.5rem] p-7 relative overflow-hidden" style="background:var(--ink);border:10px solid #3d2a2a;box-shadow:0 36px 70px -28px var(--shadow)">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-6 rounded-b-xl" style="background:#3d2a2a"></div>
          <div class="mt-8 space-y-5">
            <div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full" style="background:var(--gold)"></div><span class="text-[9px] font-black uppercase tracking-widest" style="color:rgba(255,255,255,0.4)">Active_Trip</span></div>
            <h5 class="text-xl font-black tracking-tighter text-white italic uppercase leading-none">VARANASI HUB</h5>
            <div class="h-1.5 w-full rounded-full overflow-hidden" style="background:rgba(255,255,255,0.08)"><div class="progress-fill h-full" style="background:var(--gold)"></div></div>
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
          <div class="hover-tile w-14 h-14 rounded-full flex items-center justify-center mx-auto text-lg font-black italic" style="background:var(--ink);color:var(--gold);border:3px solid var(--white)">01</div>
          <div><h4 class="font-black uppercase text-sm">Connect your network</h4><p class="font-bold uppercase text-[10px] tracking-widest mt-1" style="color:var(--muted)">Invite partners.</p></div>
        </div>
        <div class="relative z-10 space-y-4">
          <div class="hover-tile w-14 h-14 rounded-full flex items-center justify-center mx-auto text-lg font-black italic" style="background:var(--ink);color:var(--gold);border:3px solid var(--white)">02</div>
          <div><h4 class="font-black uppercase text-sm">Post &amp; bid</h4><p class="font-bold uppercase text-[10px] tracking-widest mt-1" style="color:var(--muted)">Exchange + Boost.</p></div>
        </div>
        <div class="relative z-10 space-y-4">
          <div class="hover-tile w-14 h-14 rounded-full flex items-center justify-center mx-auto text-lg font-black italic" style="background:var(--ink);color:var(--gold);border:3px solid var(--white)">03</div>
          <div><h4 class="font-black uppercase text-sm">Settle &amp; see</h4><p class="font-bold uppercase text-[10px] tracking-widest mt-1" style="color:var(--muted)">Ledger + analytics.</p></div>
        </div>
      </div>
    </div>
  </section>

  <div class="site-dark-tail">
    <section class="final-cta py-20 page-pad text-white text-center relative overflow-hidden">
      <div class="wide-shell relative z-10 reveal max-w-4xl">
        <h2 class="final-title font-black italic mb-8 uppercase">
          CONNECT YOUR BUSINESS<span class="dot-gold">.</span>
        </h2>
        <a href="/onboarding" target="_top" class="cta-primary inline-block px-10 py-4 font-black text-sm uppercase tracking-[0.16em]">Initialize Now</a>
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
    const navEl = document.querySelector('.glass-nav');
    const syncNav = () => { if (navEl) navEl.classList.toggle('is-scrolled', window.scrollY > 8); };
    syncNav();
    window.addEventListener('scroll', syncNav, { passive: true });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('in');
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

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

const IFRAME_STYLE = { width: '100%', height: '100vh', border: 'none' } as const;

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

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    void import('@/features/onboarding/components/OnboardingPersonaHub');
  }, []);

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
      style={IFRAME_STYLE}
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
