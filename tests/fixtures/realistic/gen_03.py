"""Compute mean and median over a list of numbers."""


def mean(numbers):
    return sum(numbers) / len(numbers)


def median(numbers):
    s = sorted(numbers)
    n = len(s)
    mid = n // 2
    if n % 2 == 0:
        return (s[mid - 1] + s[mid]) / 2
    return s[mid]


if __name__ == "__main__":
    data = [4, 8, 15, 16, 23, 42]
    print(f"Mean:   {mean(data):.2f}")
    print(f"Median: {median(data):.2f}")
