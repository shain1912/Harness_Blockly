import cv2

# 0번은 컴퓨터에 연결된 기본 웹캠을 뜻해
cap = cv2.shape = cv2.VideoCapture(0)

if not cap.isOpened():
    print("웹캠을 열 수 없습니다.")
    exit()

while True:
    # 프레임별로 영상 읽기
    ret, frame = cap.read()

    # 영상을 정상적으로 읽지 못했다면 루프 탈출
    if not ret:
        print("프레임을 가져올 수 없습니다.")
        break

    # 화면에 영상 표시 ('Webcam'이라는 이름의 창)
    cv2.imshow('Webcam', frame)

    # 'q' 키를 누르면 종료
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# 웹캠 자원 해제 및 모든 창 닫기
cap.release()
cv2.destroyAllWindows()
