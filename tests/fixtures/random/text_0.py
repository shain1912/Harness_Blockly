# CSV-ish log line parser: split / strip / slicing + f-string formatting
raw = """  2024-01-15, INFO , user login ok
2024-01-15,  WARN, disk 80% full
2024-01-15 , ERROR ,timeout while connecting """

rows = []
for line in raw.splitlines():
    line = line.strip()
    if not line:
        continue
    parts = [field.strip() for field in line.split(",")]
    date, level, message = parts[0], parts[1], parts[2]
    rows.append((date, level, message))

# Tabular report using f-string format specs (width + alignment)
print(f"{'LEVEL':<6} | {'MESSAGE':<30} | LEN")
print("-" * 48)
for date, level, message in rows:
    print(f"{level:<6} | {message:<30} | {len(message):>3}")

# Count by level
levels = [r[1] for r in rows]
for lvl in ("INFO", "WARN", "ERROR"):
    print(f"{lvl}: {levels.count(lvl)}")
