# 구구단 + 짝수/홀수 판별
dan = 3
print(dan, "단")
i = 1
while i <= 9:
    print(dan, "x", i, "=", dan * i)
    i = i + 1

# 1부터 10까지 짝수 합과 홀수 합 구하기
even_sum = 0
odd_sum = 0
for n in range(1, 11):
    if n % 2 == 0:
        even_sum = even_sum + n
    else:
        odd_sum = odd_sum + n

print("짝수 합:", even_sum)
print("홀수 합:", odd_sum)
