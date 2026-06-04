"""Recursive factorial and Fibonacci; print the first 10 of each."""


def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)


def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


if __name__ == "__main__":
    print("Factorials:", [factorial(i) for i in range(10)])
    print("Fibonacci: ", [fib(i) for i in range(10)])
