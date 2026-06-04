import math

# Projectile and physics-style calculations using the math module.
# Compute distance, square roots, trig and logarithms.

# Distance between two points in a 2D plane.
x1, y1 = 3.0, 4.0
x2, y2 = 0.0, 0.0
distance = math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
print("Distance from (3,4) to origin:", distance)

# Hypotenuse via math.hypot (should match the manual calc above).
print("hypot(3,4):", math.hypot(3.0, 4.0))

# Trigonometry: sin/cos of common angles (in radians).
angle_deg = 30.0
angle_rad = math.radians(angle_deg)
print("sin(30deg):", round(math.sin(angle_rad), 6))
print("cos(60deg):", round(math.cos(math.radians(60.0)), 6))

# Logarithms.
print("log base e of e:", round(math.log(math.e), 6))
print("log base 2 of 8:", math.log2(8))
print("log base 10 of 1000:", math.log10(1000))

# Compound interest: A = P (1 + r/n)^(n*t)
P = 1000.0      # principal
r = 0.05        # annual rate
n = 12          # compounded monthly
t = 10          # years
A = P * (1 + r / n) ** (n * t)
print("Compound interest amount:", round(A, 2))
