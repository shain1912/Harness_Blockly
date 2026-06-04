import cv2
import numpy as np

img1 = cv2.imread('image1.jpg')
img2 = cv2.imread('image2.jpg')

img2 = cv2.resize(img2, (img1.shape[1], img1.shape[0]))

blended = cv2.addWeighted(img1, 0.7, img2, 0.3, 0)

combined = np.hstack((img1, blended))

cv2.imshow('Original and Blended', combined)
cv2.waitKey(0)
cv2.destroyAllWindows()
