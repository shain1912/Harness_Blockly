import math

# Prime number detection and listing primes up to a limit.

def is_prime(num):
    if num < 2:
        return False
    if num == 2:
        return True
    if num % 2 == 0:
        return False
    for i in range(3, int(math.sqrt(num)) + 1, 2):
        if num % i == 0:
            return False
    return True

# Check a few specific numbers.
for candidate in [1, 2, 17, 18, 19, 97, 100]:
    print(candidate, "is prime?", is_prime(candidate))

# Build a list of all primes below 30.
primes = []
for n in range(2, 30):
    if is_prime(n):
        primes.append(n)

print("Primes under 30:", primes)
print("Count of primes under 30:", len(primes))
print("Sum of primes under 30:", sum(primes))
