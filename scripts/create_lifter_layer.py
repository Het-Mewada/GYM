import os
from PIL import Image, ImageFilter, ImageEnhance

BRAIN_DIR = r"C:\Users\Mewada Het\.gemini\antigravity\brain\c11fbf95-1e21-4087-8313-a95bb20f8126"
OUTPUT_DIR = r"c:\Users\Mewada Het\Desktop\GYM\apps\web\public\assets\home"

src_path = os.path.join(BRAIN_DIR, "gym_hero_deadlift_v2_1794222559203.jpg")
img = Image.open(src_path).convert("RGBA")
w, h = img.size

# Upscale to high-res
target_w = 2560
target_h = int(target_w * h / w)
img = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
w, h = img.size

# Create a smooth, organic alpha mask that isolates the muscular athlete
# The athlete is centered in the frame
mask = Image.new("L", (w, h), 0)
from PIL import ImageDraw
draw = ImageDraw.Draw(mask)

# Center of athlete is around (w*0.5, h*0.52)
center_x = w * 0.5
center_y = h * 0.52
radius_x = w * 0.38
radius_y = h * 0.44

# Draw gradient feathered ellipse mask
for r in range(100, 0, -1):
    alpha = int(255 * (1.0 - (r / 100.0) ** 1.8))
    rx = int(radius_x * (r / 100.0))
    ry = int(radius_y * (r / 100.0))
    draw.ellipse([center_x - rx, center_y - ry, center_x + rx, center_y + ry], fill=alpha)

# Heavy Gaussian blur on mask for seamless feathering
mask = mask.filter(ImageFilter.GaussianBlur(radius=65))

# Apply alpha mask
img.putalpha(mask)

# Save as WebP with transparency
out_webp = os.path.join(OUTPUT_DIR, "real-human-lifter.webp")
img.save(out_webp, format="WEBP", quality=92)

# Save as PNG
out_png = os.path.join(OUTPUT_DIR, "real-human-lifter.png")
img.save(out_png, format="PNG")

print("Created real-human-lifter.webp and png at", out_webp)
