# Slicing, slug generation, and f-string number formatting
title = "  Hello, World! This Is BlockPy 2024  "

# Build a URL slug: strip, lower, keep alnum, collapse spaces to hyphens
stripped = title.strip().lower()
chars = []
for ch in stripped:
    if ch.isalnum():
        chars.append(ch)
    elif ch.isspace():
        chars.append(" ")
    # drop everything else
slug = "-".join("".join(chars).split())
print(f"slug: {slug}")

# Slicing demos
s = "abcdefghij"
print(f"first3={s[:3]} last3={s[-3:]} reversed={s[::-1]} every2={s[::2]}")

# Center / truncate with f-string format specs
label = "REPORT"
print(f"[{label:^20}]")

# Number formatting
pi = 3.14159265358979
total = 1234567.891
print(f"pi={pi:.3f} pct={0.8732:.1%} money=${total:,.2f}")

# Mask all but last 4 of an id
account = "1234567890123456"
masked = "*" * (len(account) - 4) + account[-4:]
print(f"account={masked}")
