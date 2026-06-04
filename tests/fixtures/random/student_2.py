# 간단한 함수로 직사각형 넓이와 둘레 구하기
def area(w, h):
    return w * h

def perimeter(w, h):
    return 2 * (w + h)

widths = [4, 7, 2]
heights = [5, 3, 8]

for k in range(len(widths)):
    w = widths[k]
    h = heights[k]
    a = area(w, h)
    p = perimeter(w, h)
    print("가로", w, "세로", h, "-> 넓이", a, "둘레", p)
    if a > 20:
        print("  큰 직사각형")
    else:
        print("  작은 직사각형")

# 가장 큰 넓이 찾기
max_area = 0
for k in range(len(widths)):
    a = area(widths[k], heights[k])
    if a > max_area:
        max_area = a

print("최대 넓이:", max_area)
