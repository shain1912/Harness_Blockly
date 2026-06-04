"""
Otsu binarization + foreground coverage on input.jpg.
Standard preprocessing step before any blob / OCR work.
"""
import cv2
import numpy as np

img = cv2.imread("input.jpg")
if img is None:
    raise FileNotFoundError("input.jpg not found in cwd")

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
h, w = gray.shape
total = h * w
print("gray shape:", gray.shape)

# Otsu picks the threshold automatically -> still deterministic per image.
thresh_val, binary = cv2.threshold(
    gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
)
print("otsu threshold value: {:.1f}".format(thresh_val))

white = int(np.count_nonzero(binary))
black = total - white
print("foreground (white) pixels:", white)
print("background (black) pixels:", black)
print("foreground coverage: {:.2f}%".format(100.0 * white / total))

# Also report a simple fixed-threshold result for comparison.
_, fixed = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
fixed_white = int(np.count_nonzero(fixed))
print("fixed@127 foreground pixels:", fixed_white)

cv2.imwrite("cv2_otsu.png", binary)
print("wrote cv2_otsu.png")
