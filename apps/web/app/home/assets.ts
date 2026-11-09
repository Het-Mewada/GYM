export interface HomeAssetMeta {
  id: string;
  alt: string;
  aspect: string;
  blurDataURL: string;
  src: string;
  srcJpg: string;
  src3840: string;
  srcsetWebp: string;
  originalResolution: string;
  masterResolution: string;
}

export const HOME_ASSETS: Record<string, HomeAssetMeta> = {
  "hero-athlete": {
    "id": "hero-athlete",
    "alt": "Powerlifter mid-deadlift in a dark boutique gym with atmospheric chalk dust and volt-green rim lighting",
    "aspect": "21:9",
    "blurDataURL": "data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAADwAwCdASoYAA4APtFWo0uoJKMhsAgBABoJQBOgA9I03TZ0Ey043GUAAP6JKiVzLUUCWkyGtdDWp+RhH3S3J7dKOiEc+gIeV+OM6rRhAxY8DjhMKZwAAA==",
    "src": "/assets/home/hero-athlete_1920.webp",
    "srcJpg": "/assets/home/hero-athlete_1920.jpg",
    "src3840": "/assets/home/hero-athlete_3840.webp",
    "srcsetWebp": "/assets/home/hero-athlete_1280.webp 1280w, /assets/home/hero-athlete_1920.webp 1920w, /assets/home/hero-athlete_2560.webp 2560w, /assets/home/hero-athlete_3840.webp 3840w",
    "originalResolution": "1376x768",
    "masterResolution": "3840x2143"
  },
  "parallax-athlete": {
    "id": "parallax-athlete",
    "alt": "Athlete resting between heavy sets with chalked hands and volt lighting across shoulders",
    "aspect": "16:9",
    "blurDataURL": "data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAADQAwCdASoYAA4ALplotFoiqCgoCACYSxgFh2IeBQnl6twrvV/9kMAA/vnCWa/sFfQvL24A9HxYAU5KiyPe7cUhSFnYohRpBOpdumTgh15RQYCUIlYAAA==",
    "src": "/assets/home/parallax-athlete_1920.webp",
    "srcJpg": "/assets/home/parallax-athlete_1920.jpg",
    "src3840": "/assets/home/parallax-athlete_3840.webp",
    "srcsetWebp": "/assets/home/parallax-athlete_1280.webp 1280w, /assets/home/parallax-athlete_1920.webp 1920w, /assets/home/parallax-athlete_2560.webp 2560w, /assets/home/parallax-athlete_3840.webp 3840w",
    "originalResolution": "1376x768",
    "masterResolution": "3840x2143"
  },
  "gym-floor-empty": {
    "id": "gym-floor-empty",
    "alt": "Wide shot of empty boutique gym training floor at dawn with rows of matte black racks and volt neon line",
    "aspect": "16:9",
    "blurDataURL": "data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAACQAwCdASoYAA4APtFWpEuoJKOhsAgBABoJYwCo9BKZM05XsaQAAP6JjnPYn1J6ShuaXulnJAtGA4pNPJvEyD0WtzlT6windvxodiMJbi/krnPxYbBgAA==",
    "src": "/assets/home/gym-floor-empty_1920.webp",
    "srcJpg": "/assets/home/gym-floor-empty_1920.jpg",
    "src3840": "/assets/home/gym-floor-empty_3840.webp",
    "srcsetWebp": "/assets/home/gym-floor-empty_1280.webp 1280w, /assets/home/gym-floor-empty_1920.webp 1920w, /assets/home/gym-floor-empty_2560.webp 2560w, /assets/home/gym-floor-empty_3840.webp 3840w",
    "originalResolution": "1376x768",
    "masterResolution": "3840x2143"
  },
  "story-1-branches": {
    "id": "story-1-branches",
    "alt": "Symmetrical gym interior perspective with glass partition into adjacent training studios",
    "aspect": "4:5",
    "blurDataURL": "data:image/webp;base64,UklGRnYAAABXRUJQVlA4IGoAAAAQBQCdASoYABgAPtFWo0woJKMiMAgBABoJZQC7ACHcqCO/y3cLYFegbrV79i7Q8NKAAP7po6bYB8xIxcRYUl71DnoPiQQ7+uDxpqw0E8Wbi9zPmjvQ4o7dzv+nmpKfI9ZDKFCI9WCXyoAA",
    "src": "/assets/home/story-1-branches_1920.webp",
    "srcJpg": "/assets/home/story-1-branches_1920.jpg",
    "src3840": "/assets/home/story-1-branches_3840.webp",
    "srcsetWebp": "/assets/home/story-1-branches_1280.webp 1280w, /assets/home/story-1-branches_1920.webp 1920w, /assets/home/story-1-branches_2560.webp 2560w, /assets/home/story-1-branches_3840.webp 3840w",
    "originalResolution": "1024x1024",
    "masterResolution": "3840x3840"
  },
  "story-2-access": {
    "id": "story-2-access",
    "alt": "Close-up of staff member tapping RFID access card on wall door reader with glowing volt ring",
    "aspect": "4:5",
    "blurDataURL": "data:image/webp;base64,UklGRngAAABXRUJQVlA4IGwAAACwBACdASoYABgAPtFWo0uoJKMhsAgBABoJZQAAW/E3acUdFFt+nYuq1xOaiqQAAP7r6rbxKEw3BffQWqPzBYlxx9uPtkvznjFd0/vwrqhmrm7xNBRTLEYjQw3l5d4jVPO5MeLtlpzn0bKAAAA=",
    "src": "/assets/home/story-2-access_1920.webp",
    "srcJpg": "/assets/home/story-2-access_1920.jpg",
    "src3840": "/assets/home/story-2-access_3840.webp",
    "srcsetWebp": "/assets/home/story-2-access_1280.webp 1280w, /assets/home/story-2-access_1920.webp 1920w, /assets/home/story-2-access_2560.webp 2560w, /assets/home/story-2-access_3840.webp 3840w",
    "originalResolution": "1024x1024",
    "masterResolution": "3840x3840"
  },
  "story-3-accountability": {
    "id": "story-3-accountability",
    "alt": "Gym branch manager at standing desk in glass-walled office overlooking gym floor",
    "aspect": "4:5",
    "blurDataURL": "data:image/webp;base64,UklGRnQAAABXRUJQVlA4IGgAAAAwBQCdASoYABgAPtFWokyoJKMiMBgMAQAaCWUAwrMvwXpFdzgizwX8rfbHuzIKcEX3kAD+7FlZ2VmhJ1o/1JYrneHXoyIgu9BxzQt7cpFotm8pi7EuYhARs83eQMDJ61in7+C2swAAAA==",
    "src": "/assets/home/story-3-accountability_1920.webp",
    "srcJpg": "/assets/home/story-3-accountability_1920.jpg",
    "src3840": "/assets/home/story-3-accountability_3840.webp",
    "srcsetWebp": "/assets/home/story-3-accountability_1280.webp 1280w, /assets/home/story-3-accountability_1920.webp 1920w, /assets/home/story-3-accountability_2560.webp 2560w, /assets/home/story-3-accountability_3840.webp 3840w",
    "originalResolution": "1024x1024",
    "masterResolution": "3840x3840"
  },
  "story-4-memberships": {
    "id": "story-4-memberships",
    "alt": "Minimalist black membership card and wristband on dark bench with chalk dust",
    "aspect": "4:5",
    "blurDataURL": "data:image/webp;base64,UklGRogAAABXRUJQVlA4IHwAAADwBACdASoYAB4APtFUpkyoJKOiMBgMAQAaCUAXyQHpXPQWpZHPPZttwxI+uEtXKOAA/ujw3+FkSQJIP8qGKw2mt2rEYUq5gNVHShPMuxH/BNFlB6l0CVWskXVGx3johr/15zW6ze0VuaFNXP4KneMKmjI8dMfFAzNf7gAA",
    "src": "/assets/home/story-4-memberships_1920.webp",
    "srcJpg": "/assets/home/story-4-memberships_1920.jpg",
    "src3840": "/assets/home/story-4-memberships_3840.webp",
    "srcsetWebp": "/assets/home/story-4-memberships_1280.webp 1280w, /assets/home/story-4-memberships_1920.webp 1920w, /assets/home/story-4-memberships_2560.webp 2560w, /assets/home/story-4-memberships_3840.webp 3840w",
    "originalResolution": "819x1024",
    "masterResolution": "3840x4801"
  },
  "story-5-frontdesk": {
    "id": "story-5-frontdesk",
    "alt": "Member checking in via contactless smartphone tap on dark reception counter",
    "aspect": "4:5",
    "blurDataURL": "data:image/webp;base64,UklGRq4AAABXRUJQVlA4IKIAAADQBQCdASoYAB4APs1aoEunpaMhsBgMAPAZiUAWcG+AJs2OvovSpoOCTaI3QgJdHQqNeJpduJJgAP73xigzDjklMhLQ9me3ihbdA8ACtJ8FUAVJDSk8peV4n8yuvKFhawwXTH24rCNxog9n/4hylRUMf+sYjN2MEP0C7PueXuJHtbI4FCHrir+qW/GEmeBGg7fjSKhoeHtnnJSw+/cK925/gAA=",
    "src": "/assets/home/story-5-frontdesk_1920.webp",
    "srcJpg": "/assets/home/story-5-frontdesk_1920.jpg",
    "src3840": "/assets/home/story-5-frontdesk_3840.webp",
    "srcsetWebp": "/assets/home/story-5-frontdesk_1280.webp 1280w, /assets/home/story-5-frontdesk_1920.webp 1920w, /assets/home/story-5-frontdesk_2560.webp 2560w, /assets/home/story-5-frontdesk_3840.webp 3840w",
    "originalResolution": "614x768",
    "masterResolution": "3840x4803"
  },
  "story-6-money": {
    "id": "story-6-money",
    "alt": "Cash payment handed across counter beside dark digital POS tablet",
    "aspect": "4:5",
    "blurDataURL": "data:image/webp;base64,UklGRnwAAABXRUJQVlA4IHAAAAAQBQCdASoYABgAPrlKnUunJKKht+gA4BcJZQDDNDJRQ9qC6tX5FRv7/1ioLUc/p3FwAP7zM5aKoPxYxD7/yW4GE5Btg3G15h/eZDSJpq7SCMLPQ4bKJ4Vdj2BVIEF0DkoGtkSLTyvZ+HZSxu07agAA",
    "src": "/assets/home/story-6-money_1920.webp",
    "srcJpg": "/assets/home/story-6-money_1920.jpg",
    "src3840": "/assets/home/story-6-money_3840.webp",
    "srcsetWebp": "/assets/home/story-6-money_1280.webp 1280w, /assets/home/story-6-money_1920.webp 1920w, /assets/home/story-6-money_2560.webp 2560w, /assets/home/story-6-money_3840.webp 3840w",
    "originalResolution": "1024x1024",
    "masterResolution": "3840x3840"
  },
  "mask-reveal": {
    "id": "mask-reveal",
    "alt": "Personal trainer presenting management app on tablet to new gym member on training floor",
    "aspect": "16:9",
    "blurDataURL": "data:image/webp;base64,UklGRlgAAABXRUJQVlA4IEwAAACwAwCdASoYAA4APtFapkyoJSOiMAgBABoJZQAAUqa6nVw+8mhYwAD+8rTSm9nrM9dxM6dDhOLzvCPoM8aWz2mmANyRpRPbos4vgAAA",
    "src": "/assets/home/mask-reveal_1920.webp",
    "srcJpg": "/assets/home/mask-reveal_1920.jpg",
    "src3840": "/assets/home/mask-reveal_3840.webp",
    "srcsetWebp": "/assets/home/mask-reveal_1280.webp 1280w, /assets/home/mask-reveal_1920.webp 1920w, /assets/home/mask-reveal_2560.webp 2560w, /assets/home/mask-reveal_3840.webp 3840w",
    "originalResolution": "1376x768",
    "masterResolution": "3840x2143"
  },
  "gallery-1-frontdesk": {
    "id": "gallery-1-frontdesk",
    "alt": "Luxury boutique gym reception area with raw concrete counter and sharp volt LED stripe",
    "aspect": "16:9",
    "blurDataURL": "data:image/webp;base64,UklGRmgAAABXRUJQVlA4IFwAAAAQBACdASoYAA4APtFUo0uoJKMhsAgBABoJYwAAXKO8CGCN/btgzKnmgAD+7Fgh5bFOyItVUlI6A8WcPS1exo/QXm4e4vk6+gPgXjC4FvVQ0lxgMNC3jgtMqAAAAA==",
    "src": "/assets/home/gallery-1-frontdesk_1920.webp",
    "srcJpg": "/assets/home/gallery-1-frontdesk_1920.jpg",
    "src3840": "/assets/home/gallery-1-frontdesk_3840.webp",
    "srcsetWebp": "/assets/home/gallery-1-frontdesk_1280.webp 1280w, /assets/home/gallery-1-frontdesk_1920.webp 1920w, /assets/home/gallery-1-frontdesk_2560.webp 2560w, /assets/home/gallery-1-frontdesk_3840.webp 3840w",
    "originalResolution": "1376x768",
    "masterResolution": "3840x2143"
  },
  "gallery-2-floor": {
    "id": "gallery-2-floor",
    "alt": "Lively gym training floor with athletes lifting in moody spotlights and atmospheric chalk haze",
    "aspect": "16:9",
    "blurDataURL": "data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAABQBACdASoYAA4APtFWpkuoJKOhsAgBABoJYwC7AGttxWZuqDsUt/uflZpQAP779zYafn/VTBE77BnQmS1jfUPW20tO16zqvvKbbmNqqArJm+wS7tm4GsG0AAA=",
    "src": "/assets/home/gallery-2-floor_1920.webp",
    "srcJpg": "/assets/home/gallery-2-floor_1920.jpg",
    "src3840": "/assets/home/gallery-2-floor_3840.webp",
    "srcsetWebp": "/assets/home/gallery-2-floor_1280.webp 1280w, /assets/home/gallery-2-floor_1920.webp 1920w, /assets/home/gallery-2-floor_2560.webp 2560w, /assets/home/gallery-2-floor_3840.webp 3840w",
    "originalResolution": "1376x768",
    "masterResolution": "3840x2143"
  },
  "gallery-3-manager": {
    "id": "gallery-3-manager",
    "alt": "Branch manager executive desk with dark workstation display and evening city skyline",
    "aspect": "16:9",
    "blurDataURL": "data:image/webp;base64,UklGRlYAAABXRUJQVlA4IEoAAADQAwCdASoYAA4APtFWpEuoJKOhsAgBABoJYwCw7CHv043jH/wC6AAA/vQs3pLTzd938mXJz5CN7zD8Ang3dOD0HyXG8QvHnBNAAA==",
    "src": "/assets/home/gallery-3-manager_1920.webp",
    "srcJpg": "/assets/home/gallery-3-manager_1920.jpg",
    "src3840": "/assets/home/gallery-3-manager_3840.webp",
    "srcsetWebp": "/assets/home/gallery-3-manager_1280.webp 1280w, /assets/home/gallery-3-manager_1920.webp 1920w, /assets/home/gallery-3-manager_2560.webp 2560w, /assets/home/gallery-3-manager_3840.webp 3840w",
    "originalResolution": "1024x576",
    "masterResolution": "3840x2160"
  },
  "gallery-4-billing": {
    "id": "gallery-4-billing",
    "alt": "High-angle close up of front-desk billing counter with POS terminal and dark tablet",
    "aspect": "16:9",
    "blurDataURL": "data:image/webp;base64,UklGRmoAAABXRUJQVlA4IF4AAACwAwCdASoYAA4APtFUo0uoJKMhsAgBABoJZQAAUfVf+yZ9+GzmAAD+72OiYFKY1Mz0ujQHzsrqVM034L0y4v0Z23TwNOO9lNzfEuH6Gux0bCVE0XmbyNBSAgZuoAAA",
    "src": "/assets/home/gallery-4-billing_1920.webp",
    "srcJpg": "/assets/home/gallery-4-billing_1920.jpg",
    "src3840": "/assets/home/gallery-4-billing_3840.webp",
    "srcsetWebp": "/assets/home/gallery-4-billing_1280.webp 1280w, /assets/home/gallery-4-billing_1920.webp 1920w, /assets/home/gallery-4-billing_2560.webp 2560w, /assets/home/gallery-4-billing_3840.webp 3840w",
    "originalResolution": "1024x576",
    "masterResolution": "3840x2160"
  },
  "gallery-5-comms": {
    "id": "gallery-5-comms",
    "alt": "Smartphone face down on dark gym bench beside water bottle with edge notification glow",
    "aspect": "16:9",
    "blurDataURL": "data:image/webp;base64,UklGRmQAAABXRUJQVlA4IFgAAADQAwCdASoYAA4ALplotFoiqCgoCACYSxgF2AIeH4h6TWEDdn5KeAAA/vphrIqKqZEzhZ4TPvPIA5nX+OSSEUqXNNKObhOq2myxvGni+Byt5H2AdgxCnEAA",
    "src": "/assets/home/gallery-5-comms_1920.webp",
    "srcJpg": "/assets/home/gallery-5-comms_1920.jpg",
    "src3840": "/assets/home/gallery-5-comms_3840.webp",
    "srcsetWebp": "/assets/home/gallery-5-comms_1280.webp 1280w, /assets/home/gallery-5-comms_1920.webp 1920w, /assets/home/gallery-5-comms_2560.webp 2560w, /assets/home/gallery-5-comms_3840.webp 3840w",
    "originalResolution": "1365x768",
    "masterResolution": "3840x2160"
  }
};
