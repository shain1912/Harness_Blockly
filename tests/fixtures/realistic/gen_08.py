"""A generator that yields prime numbers up to n."""


def primes_up_to(n):
    for candidate in range(2, n + 1):
        is_prime = True
        for divisor in range(2, int(candidate ** 0.5) + 1):
            if candidate % divisor == 0:
                is_prime = False
                break
        if is_prime:
            yield candidate


if __name__ == "__main__":
    print("Primes under 50:", list(primes_up_to(49)))
