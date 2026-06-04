"""
Edge detection + contour counting pipeline on input.jpg.
A typical first pass when you want to know "how busy" an image is.
"""
import cv2
import numpy as np

img = cv2.imread("input.jpg")
if img is None:
    raise FileNotFoundError("input.jpg not found in cwd")

h, w = img.shape[:2]
print("loaded input.jpg shape:", img.shape)
print("dimensions: {}x{}".format(w, h))

# Grayscale then a light blur to kill sensor noise before Canny.
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
blurred = cv2.GaussianBlur(gray, (5, 5), 0)

# Deterministic fixed thresholds so the output is reproducible.
edges = cv2.Canny(blurred, 50, 150)
edge_pixels = int(np.count_nonzero(edges))
edge_ratio = edge_pixels / float(h * w)
print("edge pixels:", edge_pixels)
print("edge ratio: {:.4f}".format(edge_ratio))

# Count external contours from the edge map.
contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
print("external contours found:", len(contours))

areas = [cv2.contourArea(c) for c in contours]
significant = [a for a in areas if a >= 10.0]
print("significant contours (area>=10):", len(significant))
if significant:
    print("largest contour area: {:.1f}".format(max(significant)))
else:
    print("largest contour area: 0.0")

cv2.imwrite("cv0_edges.png", edges)
print("wrote cv0_edges.png")
