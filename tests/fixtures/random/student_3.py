# 장바구니 가격 계산 + 할인
items = ["사과", "우유", "빵", "과자"]
prices = [1200, 2500, 1800, 1500]

total = 0
for k in range(len(items)):
    print(items[k], ":", prices[k], "원")
    total = total + prices[k]

print("합계:", total, "원")

# 10000원 넘으면 10% 할인
if total >= 10000:
    discount = total * 0.1
    print("할인 적용! 할인액:", int(discount), "원")
    total = total - discount
else:
    print("할인 없음")

print("최종 결제 금액:", int(total), "원")

# 가장 비싼 물건 찾기
max_price = prices[0]
max_item = items[0]
for k in range(len(prices)):
    if prices[k] > max_price:
        max_price = prices[k]
        max_item = items[k]

print("가장 비싼 물건:", max_item, max_price, "원")
