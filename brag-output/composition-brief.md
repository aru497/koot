# Koott Brag Video — Composition Handoff Brief

**Deliverable:** 35.0s app-store-tone launch/explainer, 1920×1080, HyperFrames monolithic standalone composition at `brag-output/composition/index.html`.

**Goal:** Explain what Koott does — for Kerala & Indian students studying in Australia — by SHOWING the real flow (free-text course search → real-government-data match card with salary + 485 visa) then naming the three real tools, the free/no-agents promise, and the outro lockup.

**Structure (9 scenes, sum 35.0s):** Hook 3.5 → What-it-is 4.0 → Search UI 4.5 → Match card 6.0 → Stat strip 3.5 → Three tools 5.0 → Your people 3.0 → Payoff 2.5 → Outro 3.0.

**Recreated real UI:** (a) homepage search pill + popular chips + progress bar; (b) the `.rcard` occupation match card (Registered Nurse — a real OCC/DEMAND record from index.html: shortage, ceiling 13,929, ANZSCO 254499, median A$76K, +16%, 485 visa).

**Brand fidelity:**
- Palette exact from koott.css (paper #fdfcfa, card #fffdfb, ink #1a1714, coral #e8622c / #cc4f1e, green #1c8a4e, amber #b8730a). Warm dot-grain texture on paper scenes. Soft large radii + soft deep shadows.
- Fonts: Inter (sans) + JetBrains Mono (data/mono) — resolvable Google stand-ins for the brand's system stacks. Literal family names only in font-family (lint rule).

**Audio:** music bed `happy-beats-business-moves-vol-1` (vol 0.30, full length, track 10); SFX click_001 / drop_001 / impactSoft_medium_001 / impactBell_heavy_000 on unique track indices 11+ with ffprobe'd durations. Beat-lock card pill (~13.0s), stat lift (~18–19s), outro slam (~32s). 120.19 BPM, beats every 0.4992s from 3.019.

**Hard contract:** root data-duration=35; every scene class="clip" + data-start/duration/track-index, own bg-color, time-adjacent; one paused GSAP timeline at window.__timelines["main"]; tl.set hide later scenes at 0 then reveal; animate transform/opacity only; ticker/overflow elements get data-layout-allow-overflow; audio direct children of #root after scenes, relative paths.

**Lint:** must reach 0 errors (Google-fonts link WARNING acceptable). Static checks only.

**Outro lockup must show:** koott + കൂട്ട് wordmark, tagline "Your Australia plan, built around you.", domain koott.live, CTA "Start the Course Advisor →".
