def celsius_to_fahrenheit(c):
    return c * 9 / 5 + 32


def celsius_to_kelvin(c):
    return c + 273.15


def fahrenheit_to_celsius(f):
    return (f - 32) * 5 / 9


def kelvin_to_celsius(k):
    return k - 273.15


temps_c = [0, 25, 37, 100]
for c in temps_c:
    f = celsius_to_fahrenheit(c)
    k = celsius_to_kelvin(c)
    print(f"{c}C = {f:.1f}F = {k:.2f}K")

print(f"98.6F is {fahrenheit_to_celsius(98.6):.1f}C")
print(f"310.15K is {kelvin_to_celsius(310.15):.1f}C")
