matrix = [
    [1, 2, 3],
    [4, 5, 6],
]

transposed = [list(row) for row in zip(*matrix)]

print("Original:")
for row in matrix:
    print(row)

print("Transposed:")
for row in transposed:
    print(row)
