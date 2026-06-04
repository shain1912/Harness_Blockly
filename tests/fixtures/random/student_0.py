# 학점 계산기 - 점수에 따라 등급을 매긴다
scores = [92, 78, 85, 63, 50, 100]

total = 0
for s in scores:
    total = total + s

average = total / len(scores)
print("점수 개수:", len(scores))
print("총점:", total)
print("평균:", round(average, 2))

# 평균으로 등급 정하기
if average >= 90:
    grade = "A"
elif average >= 80:
    grade = "B"
elif average >= 70:
    grade = "C"
else:
    grade = "D"

print("평균 등급:", grade)

# 70점 미만이 몇 명인지 세기
fail_count = 0
for s in scores:
    if s < 70:
        fail_count = fail_count + 1

print("70점 미만 인원:", fail_count)
