"""Stack and Queue classes plus a DP coin-change example."""


class Stack:
    def __init__(self):
        self._items = []

    def push(self, x):
        self._items.append(x)

    def pop(self):
        return self._items.pop()

    def peek(self):
        return self._items[-1]

    def is_empty(self):
        return len(self._items) == 0


class Queue:
    def __init__(self):
        self._items = []

    def enqueue(self, x):
        self._items.append(x)

    def dequeue(self):
        return self._items.pop(0)

    def is_empty(self):
        return len(self._items) == 0


def min_coins(coins, amount):
    INF = amount + 1
    dp = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    return dp[amount] if dp[amount] != INF else -1


s = Stack()
for v in [1, 2, 3]:
    s.push(v)
print("stack pop order:", s.pop(), s.pop(), s.pop())

q = Queue()
for v in [1, 2, 3]:
    q.enqueue(v)
print("queue dequeue order:", q.dequeue(), q.dequeue(), q.dequeue())

print("min coins for 11 with [1,2,5]:", min_coins([1, 2, 5], 11))
print("min coins for 27 with [1,5,10]:", min_coins([1, 5, 10], 27))
