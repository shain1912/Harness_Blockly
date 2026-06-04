"""
Per-channel statistics + thumbnail resize for photo.png.
The kind of quick QA script I run to sanity-check a batch of images.
"""
import cv2
import numpy as np

img = cv2.imread("photo.png")
if img is None:
    raise FileNotFoundError("photo.png not found in cwd")

print("photo.png shape:", img.shape)

# Split BGR and report mean per channel (OpenCV order is B,G,R).
b, g, r = cv2.split(img)
print("mean B: {:.2f}".format(float(np.mean(b))))
print("mean G: {:.2f}".format(float(np.mean(g))))
print("mean R: {:.2f}".format(float(np.mean(r))))

# Overall brightness via grayscale.
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
print("overall brightness (gray mean): {:.2f}".format(float(np.mean(gray))))
print("gray min/max: {} / {}".format(int(gray.min()), int(gray.max())))

# Make a fixed-size thumbnail (deterministic interpolation).
thumb = cv2.resize(img, (64, 64), interpolation=cv2.INTER_AREA)
print("thumbnail shape:", thumb.shape)

cv2.imwrite("cv1_thumb.png", thumb)
print("wrote cv1_thumb.png")
