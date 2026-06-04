# Quadratic formula solver and number-base conversions.
import math

# Solve a*x^2 + b*x + c = 0 using the quadratic formula.
def solve_quadratic(a, b, c):
    disc = b * b - 4 * a * c
    if disc < 0:
        return None
    root_disc = math.sqrt(disc)
    x1 = (-b + root_disc) / (2 * a)
    x2 = (-b - root_disc) / (2 * a)
    return (x1, x2)

# x^2 - 5x + 6 = 0  ->  roots 3 and 2
roots = solve_quadratic(1, -5, 6)
print("Roots of x^2 - 5x + 6:", roots)

# x^2 + 2x + 5 = 0  ->  no real roots
print("Roots of x^2 + 2x + 5:", solve_quadratic(1, 2, 5))

# Base conversions for the number 42.
value = 42
print("42 in binary:", bin(value))
print("42 in octal:", oct(value))
print("42 in hex:", hex(value))

# Parse strings written in different bases back to int.
print("0b101010 ->", int("101010", 2))
print("0o52 ->", int("52", 8))
print("0x2a ->", int("2a", 16))
