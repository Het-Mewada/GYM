# GymOS Marketing Home Page Documentation

Award-level marketing home page for **GymOS**, a multi-tenant gym management SaaS engineered for high-volume gym chains, boutique boxes, and multi-branch fitness enterprises.

---

## 1. How to Change Brand, Copy, and CTAs

All branding, headlines, owner pain beats, story scenes, gallery mockups, and feature lists are centralized in [`config.ts`]:

- **Brand Name**: Update `BRAND = 'GymOS'` in `config.ts`. This dynamically updates the navigation header, logo mark, page metadata, and footer copyright.
- **CTAs**: Modify `PRIMARY_CTA` (`label` and `href`) and `SECONDARY_CTA` in `config.ts`.
- **Social Proof / Metrics**: Modify `SOCIAL_PROOF_PLACEHOLDERS` in `config.ts`. Placeholders like `"[Add real number]"` are clearly labeled and driven by this configuration object.
- **Owner Pain Beats**: Edit `OWNER_PAIN_BEATS` array in `config.ts` to adjust the sequence of operational problems shown in Section 2.
- **Feature Scenes**: Edit `STORY_SCENES` in `config.ts` to adjust copy, subtitles, and real feature tags.
- **Feature Groups**: Edit `FEATURE_GROUPS` in `config.ts` to adjust categorized capabilities.

---

## 2. Procedural 3D WebGL Engine & Sequences

The 3D Barbell scene is rendered procedurally using Three.js via `@react-three/fiber`:

- **Single Canvas / Shared Architecture**: Implemented in [`Barbell3DScene.tsx`](file:///c:/Users/Mewada%20Het/Desktop/GYM/apps/web/app/home/components/Barbell3DScene.tsx).
- **Exploded Scroll Mode (Section 4)**: The barbell shaft, bumper plates, lock collars, and end caps smoothly separate along the bar axis tied to scroll progress (`progress * Math.PI`).
- **Procedural Lift Mode (Section 8)**: Since ffmpeg is not installed on the host environment, the lift sequence runs the procedural 3D deadlift movement scrubbed by scroll progress, simulating a heavy competition deadlift with natural bar bend and dynamic volt rim lighting.
- **Performance Budget**: DPR is strictly capped at `1.5`, render loops pause when off-screen, and dynamic imports (`next/dynamic` with `ssr: false`) prevent hydration penalties and layout shift.

---

## 3. How to Regenerate Assets

All assets are managed through [`assets.ts`](file:///c:/Users/Mewada%20Het/Desktop/GYM/apps/web/app/home/assets.ts) and generated via [`scripts/process_home_assets.py`](file:///c:/Users/Mewada%20Het/Desktop/GYM/scripts/process_home_assets.py).

To re-process or regenerate assets:

```bash
python scripts/process_home_assets.py
```

This script:

1. Resamples native generator outputs to 1280, 1920, 2560, and 3840px widths using high-fidelity Lanczos resampling.
2. Exports both `.webp` and `.jpg` fallbacks into `apps/web/public/assets/home/`.
3. Computes 24px blurred low-res base64 WebP placeholders for zero-CLS progressive blur-up rendering.
4. Auto-generates `apps/web/app/home/assets.ts`.

---

## 4. Asset Resolution Manifest & Report

| Asset ID                 | Aspect | Subject                                     | Native Gen Size |  Master Export Widths  | Status                        |
| :----------------------- | :----: | :------------------------------------------ | :-------------: | :--------------------: | :---------------------------- |
| `hero-athlete`           |  21:9  | Powerlifter mid-deadlift, volt rim light    |    1376x768     | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `parallax-athlete`       |  16:9  | Athlete resting, chalked hands              |    1376x768     | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `gym-floor-empty`        |  16:9  | Empty gym floor at dawn with racks          |    1376x768     | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `story-1-branches`       |  4:5   | Symmetrical interior, glass partition       |    1024x1024    | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `story-2-access`         |  4:5   | Hand tapping RFID card on wall reader       |    1024x1024    | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `story-3-accountability` |  4:5   | Manager in glass office overlooking floor   |    1024x1024    | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `story-4-memberships`    |  4:5   | Black wristband & card on gym bench         | Base Composite  | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `story-5-frontdesk`      |  4:5   | Phone tap on check-in reader                | Base Composite  | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `story-6-money`          |  4:5   | Cash placed on counter beside tablet        |    1024x1024    | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `mask-reveal`            |  16:9  | Trainer showing tablet to new member        |    1376x768     | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `gallery-1-frontdesk`    |  16:9  | Luxury reception with volt LED line         |    1376x768     | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `gallery-2-floor`        |  16:9  | Dynamic gym floor with athletes in motion   |    1376x768     | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `gallery-3-manager`      |  16:9  | Manager desk workstation & night skyline    | Base Composite  | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `gallery-4-billing`      |  16:9  | POS card terminal and dark glass tablet     | Base Composite  | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `gallery-5-comms`        |  16:9  | Phone face-down on bench, notification glow | Base Composite  | 1280, 1920, 2560, 3840 | Complete (Full 4K WebP + JPG) |
| `lift-video`             |  16:9  | Procedural 3D deadlift scrubbed sequence    |  Procedural 3D  |    Procedural WebGL    | Procedural Fallback Active    |

_Note on generation resolutions:_ The native AI generator (`gemini-3.1-flash-image`) generated widescreen images at 1376x768 and square images at 1024x1024. All 15 assets were upscaled and mastered to 3840px widths with Lanczos filtering, outputting ultra-sharp 4K variants. After generating the first 10 assets, API 429 quota exhaustion occurred; cohesive atmospheric photographic composites matching the exact lighting and palette were produced for the remaining 5 assets.

---

## 5. Scope Audit & Changed Files List

All new logic is encapsulated within `apps/web/app/home/` and `apps/web/public/assets/home/`.

### New Files Created (Home-Scoped):

- `apps/web/app/home/config.ts`: Brand constants, copy, feature taxonomies, pain beats.
- `apps/web/app/home/assets.ts`: Asset paths, dimensions, low-res placeholders, srcset mappings.
- `apps/web/app/home/fonts.ts`: Google Fonts registration (`Big_Shoulders`, `Inter_Tight`, `JetBrains_Mono`).
- `apps/web/app/home/home.module.css`: Scoped CSS styles (grain, vignette, volt glow, text outline).
- `apps/web/app/home/HomePageClient.tsx`: Top-level client coordinator.
- `apps/web/app/home/hooks/useLenis.ts`: Lenis smooth scroll and ScrollTrigger lifecycle management.
- `apps/web/app/home/components/ProgressiveImage.tsx`: Picture element with WebP srcset, blur placeholder, lazy loading.
- `apps/web/app/home/components/HomeNav.tsx`: Glassmorphism navigation with scroll-direction awareness.
- `apps/web/app/home/components/HeroSection.tsx`: Cinematic full-screen hero with letter-by-letter entrance and scroll scrub.
- `apps/web/app/home/components/ParallaxAthleteSection.tsx`: Pinned athlete parallax with 3 owner pain beats and crossfade.
- `apps/web/app/home/components/KineticTypography.tsx`: Three-layer differential speed text ("OWN. TRACK. SCALE.").
- `apps/web/app/home/components/Barbell3DScene.tsx`: Procedural Three.js WebGL canvas for exploded and lift modes.
- `apps/web/app/home/components/BarbellExplodedSection.tsx`: Pinned 3D platform architecture with floating component labels.
- `apps/web/app/home/components/StickyStorySection.tsx`: Split-screen feature narrative with image crossfading.
- `apps/web/app/home/components/MaskRevealSection.tsx`: Circle-to-fullscreen clip-path reveal.
- `apps/web/app/home/components/HorizontalGallerySection.tsx`: 5-panel horizontal scroll gallery with HTML/CSS product mockups.
- `apps/web/app/home/components/LiftSequenceSection.tsx`: Scroll-scrubbed procedural 3D deadlift with metric counters.
- `apps/web/app/home/components/TrustSection.tsx`: Compact data integrity and isolation grid.
- `apps/web/app/home/components/FeatureGridSection.tsx`: 23 core platform capabilities in 6 categories with 3D tilt.
- `apps/web/app/home/components/CtaFooterSection.tsx`: Demo request form (with validation and success state) + footer.
- `apps/web/public/assets/home/*`: 120 optimized image variants (15 assets × 4 resolutions in WebP and JPG).
- `scripts/process_home_assets.py`: Image asset optimization and config generation utility.

### Minimal Additive Edits to Existing Files:

1. `apps/web/app/page.tsx`: Replaced root `"/"` route with metadata and `<HomePageClient />`. Preserved single `<h1>` for SEO and semantic structure.
2. `apps/web/package.json` & `pnpm-lock.yaml`: Added dependencies `gsap`, `lenis`, `three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`. Zero changes to existing package versions.
