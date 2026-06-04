rows = [
    ["name", "age", "score"],
    ["Alice", "30", "88"],
    ["Bob", "25", "92"],
    ["Carol", "41", "75"],
    ["Dan", "33", "90"],
]

header = rows[0]
col = header.index("score")

scores = [int(row[col]) for row in rows[1:]]
total = sum(scores)
average = total / len(scores)

print(f"Column: {header[col]}")
print(f"Sum: {total}")
print(f"Average: {average:.2f}")
