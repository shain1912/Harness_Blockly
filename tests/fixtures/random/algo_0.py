"""Recursion: factorial and Fibonacci (memoized)."""


def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)


def fib(n, memo=None):
    if memo is None:
        memo = {}
    if n < 2:
        return n
    if n in memo:
        return memo[n]
    memo[n] = fib(n - 1, memo) + fib(n - 2, memo)
    return memo[n]


facts = [factorial(n) for n in range(8)]
fibs = [fib(n) for n in range(10)]

print("factorial 0..7:", facts)
print("fibonacci 0..9:", fibs)
print("factorial(10) =", factorial(10))
print("fib(20) =", fib(20))
