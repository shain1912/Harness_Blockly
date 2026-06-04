import cv2

cap = cv2.VideoCapture('input.mp4')

fps = cap.get(cv2.CAP_PROP_FPS)
width = 640
height = 360

fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter('output.mp4', fourcc, fps, (width, height))

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    resized = cv2.resize(frame, (width, height))
    out.write(resized)

cap.release()
out.release()
cv2.destroyAllWindows()
