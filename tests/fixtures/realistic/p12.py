target = 42
guesses = [50, 25, 37, 44, 40, 42]

attempts = 0
for guess in guesses:
    attempts += 1
    if guess < target:
        print(f"{guess} is too low")
    elif guess > target:
        print(f"{guess} is too high")
    else:
        print(f"{guess} is correct!")
        break

print(f"Solved in {attempts} attempts")
