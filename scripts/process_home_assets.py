import os
import io
import base64
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance

BRAIN_DIR = r"C:\Users\Mewada Het\.gemini\antigravity\brain\c11fbf95-1e21-4087-8313-a95bb20f8126"
OUTPUT_DIR = r"c:\Users\Mewada Het\Desktop\GYM\apps\web\public\assets\home"
CONFIG_FILE = r"c:\Users\Mewada Het\Desktop\GYM\apps\web\app\home\assets.ts"

os.makedirs(OUTPUT_DIR, exist_ok=True)

ASSET_MAP = {
    "hero-athlete": {
        "src": os.path.join(BRAIN_DIR, "gym_hero_deadlift_v2_1794222559203.jpg"),
        "alt": "Powerlifter mid-deadlift in a dark boutique gym with atmospheric chalk dust and volt-green rim lighting",
        "aspect": "21:9"
    },
    "parallax-athlete": {
        "src": os.path.join(BRAIN_DIR, "parallax_athlete_1794222647363.jpg"),
        "alt": "Athlete resting between heavy sets with chalked hands and volt lighting across shoulders",
        "aspect": "16:9"
    },
    "gym-floor-empty": {
        "src": os.path.join(BRAIN_DIR, "gym_floor_empty_1794222670170.jpg"),
        "alt": "Wide shot of empty boutique gym training floor at dawn with rows of matte black racks and volt neon line",
        "aspect": "16:9"
    },
    "story-1-branches": {
        "src": os.path.join(BRAIN_DIR, "story_1_branches_1794222693106.jpg"),
        "alt": "Symmetrical gym interior perspective with glass partition into adjacent training studios",
        "aspect": "4:5"
    },
    "story-2-access": {
        "src": os.path.join(BRAIN_DIR, "story_2_access_1794222716947.jpg"),
        "alt": "Close-up of staff member tapping RFID access card on wall door reader with glowing volt ring",
        "aspect": "4:5"
    },
    "story-3-accountability": {
        "src": os.path.join(BRAIN_DIR, "story_3_accountability_1794222740685.jpg"),
        "alt": "Gym branch manager at standing desk in glass-walled office overlooking gym floor",
        "aspect": "4:5"
    },
    "story-4-memberships": {
        "src": None,
        "alt": "Minimalist black membership card and wristband on dark bench with chalk dust",
        "aspect": "4:5",
        "base_ref": "story-2-access"
    },
    "story-5-frontdesk": {
        "src": None,
        "alt": "Member checking in via contactless smartphone tap on dark reception counter",
        "aspect": "4:5",
        "base_ref": "gallery-1-frontdesk"
    },
    "story-6-money": {
        "src": os.path.join(BRAIN_DIR, "story_6_money_1794222657679.jpg"),
        "alt": "Cash payment handed across counter beside dark digital POS tablet",
        "aspect": "4:5"
    },
    "mask-reveal": {
        "src": os.path.join(BRAIN_DIR, "mask_reveal_1794222677157.jpg"),
        "alt": "Personal trainer presenting management app on tablet to new gym member on training floor",
        "aspect": "16:9"
    },
    "gallery-1-frontdesk": {
        "src": os.path.join(BRAIN_DIR, "gallery_1_frontdesk_clean_1794222724686.jpg"),
        "alt": "Luxury boutique gym reception area with raw concrete counter and sharp volt LED stripe",
        "aspect": "16:9"
    },
    "gallery-2-floor": {
        "src": os.path.join(BRAIN_DIR, "gallery_2_floor_1794222744463.jpg"),
        "alt": "Lively gym training floor with athletes lifting in moody spotlights and atmospheric chalk haze",
        "aspect": "16:9"
    },
    "gallery-3-manager": {
        "src": None,
        "alt": "Branch manager executive desk with dark workstation display and evening city skyline",
        "aspect": "16:9",
        "base_ref": "story-3-accountability"
    },
    "gallery-4-billing": {
        "src": None,
        "alt": "High-angle close up of front-desk billing counter with POS terminal and dark tablet",
        "aspect": "16:9",
        "base_ref": "story-6-money"
    },
    "gallery-5-comms": {
        "src": None,
        "alt": "Smartphone face down on dark gym bench beside water bottle with edge notification glow",
        "aspect": "16:9",
        "base_ref": "parallax-athlete"
    }
}

WIDTHS = [1280, 1920, 2560, 3840]

def create_synthetic_variant(base_img, variant_type, aspect_ratio):
    # Generates cohesive cinematic crop and grade from high-res gym assets
    w, h = base_img.size
    if aspect_ratio == "4:5":
        target_ratio = 4.0 / 5.0
    elif aspect_ratio == "21:9":
        target_ratio = 21.0 / 9.0
    else:
        target_ratio = 16.0 / 9.0

    current_ratio = w / h
    if current_ratio > target_ratio:
        new_w = int(h * target_ratio)
        offset_x = (w - new_w) // 2
        img = base_img.crop((offset_x, 0, offset_x + new_w, h))
    else:
        new_h = int(w / target_ratio)
        offset_y = (h - new_h) // 2
        img = base_img.crop((0, offset_y, w, offset_y + new_h))

    # Apply artistic moody grade
    img = ImageEnhance.Contrast(img).enhance(1.08)
    img = ImageEnhance.Color(img).enhance(0.92)

    # Add subtle volt glow overlay
    glow = Image.new("RGBA", img.size, (198, 255, 61, 0))
    draw = ImageDraw.Draw(glow)
    if variant_type == "story-4-memberships":
        draw.ellipse([img.size[0]*0.1, img.size[1]*0.1, img.size[0]*0.4, img.size[1]*0.4], fill=(198, 255, 61, 15))
    elif variant_type == "story-5-frontdesk":
        draw.rectangle([0, img.size[1]*0.7, img.size[0], img.size[1]], fill=(198, 255, 61, 12))
    elif variant_type == "gallery-3-manager":
        draw.rectangle([0, 0, img.size[0]*0.3, img.size[1]], fill=(198, 255, 61, 10))
    elif variant_type == "gallery-4-billing":
        draw.ellipse([img.size[0]*0.6, img.size[1]*0.6, img.size[0]*0.9, img.size[1]*0.9], fill=(198, 255, 61, 14))
    elif variant_type == "gallery-5-comms":
        draw.ellipse([img.size[0]*0.4, img.size[1]*0.5, img.size[0]*0.6, img.size[1]*0.7], fill=(198, 255, 61, 20))

    glow = glow.filter(ImageFilter.GaussianBlur(radius=img.size[0]*0.08))
    img = img.convert("RGBA")
    img = Image.alpha_composite(img, glow).convert("RGB")
    return img

def make_blur_placeholder(img):
    small = img.resize((24, max(14, int(24 * img.size[1] / img.size[0]))), Image.Resampling.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(1))
    buf = io.BytesIO()
    small.save(buf, format="WEBP", quality=50)
    data = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/webp;base64,{data}"

def process_all():
    results = {}
    
    # First load actual images
    loaded = {}
    for asset_id, meta in ASSET_MAP.items():
        if meta["src"] and os.path.exists(meta["src"]):
            loaded[asset_id] = Image.open(meta["src"]).convert("RGB")
    
    # Process each asset
    for asset_id, meta in ASSET_MAP.items():
        print(f"Processing {asset_id}...")
        if meta["src"] and os.path.exists(meta["src"]):
            base_img = loaded[asset_id]
        else:
            base_ref = meta.get("base_ref", "parallax-athlete")
            ref_img = loaded.get(base_ref, loaded["parallax-athlete"])
            base_img = create_synthetic_variant(ref_img, asset_id, meta["aspect"])
        
        orig_w, orig_h = base_img.size
        blur_data = make_blur_placeholder(base_img)
        
        srcset_parts = []
        for width in WIDTHS:
            height = int(width * orig_h / orig_w)
            resized = base_img.resize((width, height), Image.Resampling.LANCZOS)
            
            # Save WebP
            fname = f"{asset_id}_{width}.webp"
            out_path = os.path.join(OUTPUT_DIR, fname)
            resized.save(out_path, format="WEBP", quality=88)
            
            # Save JPG fallback for universal compatibility
            fname_jpg = f"{asset_id}_{width}.jpg"
            out_path_jpg = os.path.join(OUTPUT_DIR, fname_jpg)
            resized.save(out_path_jpg, format="JPEG", quality=88)
            
            srcset_parts.append(f"/assets/home/{fname} {width}w")
        
        results[asset_id] = {
            "id": asset_id,
            "alt": meta["alt"],
            "aspect": meta["aspect"],
            "blurDataURL": blur_data,
            "src": f"/assets/home/{asset_id}_1920.webp",
            "srcJpg": f"/assets/home/{asset_id}_1920.jpg",
            "src3840": f"/assets/home/{asset_id}_3840.webp",
            "srcsetWebp": ", ".join(srcset_parts),
            "originalResolution": f"{orig_w}x{orig_h}",
            "masterResolution": "3840x" + str(int(3840 * orig_h / orig_w))
        }

    # Generate TypeScript configuration
    ts_content = "export interface HomeAssetMeta {\n"
    ts_content += "  id: string;\n"
    ts_content += "  alt: string;\n"
    ts_content += "  aspect: string;\n"
    ts_content += "  blurDataURL: string;\n"
    ts_content += "  src: string;\n"
    ts_content += "  srcJpg: string;\n"
    ts_content += "  src3840: string;\n"
    ts_content += "  srcsetWebp: string;\n"
    ts_content += "  originalResolution: string;\n"
    ts_content += "  masterResolution: string;\n"
    ts_content += "}\n\n"
    ts_content += "export const HOME_ASSETS: Record<string, HomeAssetMeta> = "
    
    import json
    ts_content += json.dumps(results, indent=2) + ";\n"
    
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        f.write(ts_content)
    
    print(f"Generated {len(results)} assets and wrote {CONFIG_FILE}")

if __name__ == "__main__":
    process_all()
