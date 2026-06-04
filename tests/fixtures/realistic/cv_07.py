import cv2
import numpy as np

img = cv2.imread('input.jpg')
rows, cols = img.shape[:2]

M_rot = cv2.getRotationMatrix2D((cols / 2, rows / 2), 45, 1.0)
rotated = cv2.warpAffine(img, M_rot, (cols, rows))

flipped = cv2.flip(img, 1)

M_trans = np.float32([[1, 0, 100], [0, 1, 50]])
translated = cv2.warpAffine(img, M_trans, (cols, rows))

cv2.imshow('Rotated', rotated)
cv2.imshow('Flipped', flipped)
cv2.imshow('Translated', translated)
cv2.waitKey(0)
cv2.destroyAllWindows()
