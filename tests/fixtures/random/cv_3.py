"""
Histogram + dominant-bin analysis and a sharpening filter on photo.png.
Useful when tuning exposure / contrast for a pipeline.
"""
import cv2
import numpy as np

img = cv2.imread("photo.png")
if img is None:
    raise FileNotFoundError("photo.png not found in cwd")

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
print("photo.png gray shape:", gray.shape)

# 256-bin intensity histogram.
hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
dominant = int(np.argmax(hist))
print("dominant intensity bin:", dominant)
print("pixels in dominant bin:", int(hist[dominant]))

# Split histogram into dark / mid / bright thirds.
dark = int(hist[0:85].sum())
mid = int(hist[85:170].sum())
bright = int(hist[170:256].sum())
print("dark/mid/bright pixels: {} / {} / {}".format(dark, mid, bright))

# Apply a fixed sharpening kernel and measure the change in detail
# (variance of Laplacian is a common sharpness proxy).
kernel = np.array([[0, -1, 0],
                   [-1, 5, -1],
                   [0, -1, 0]], dtype=np.float32)
sharpened = cv2.filter2D(img, -1, kernel)

before = float(cv2.Laplacian(gray, cv2.CV_64F).var())
sharp_gray = cv2.cvtColor(sharpened, cv2.COLOR_BGR2GRAY)
after = float(cv2.Laplacian(sharp_gray, cv2.CV_64F).var())
print("laplacian variance before: {:.2f}".format(before))
print("laplacian variance after:  {:.2f}".format(after))

cv2.imwrite("cv3_sharpened.png", sharpened)
print("wrote cv3_sharpened.png")
