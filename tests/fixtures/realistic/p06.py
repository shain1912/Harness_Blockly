def multiplication_table(size):
    table = []
    for i in range(1, size + 1):
        row = []
        for j in range(1, size + 1):
            row.append(i * j)
        table.append(row)
    return table


table = multiplication_table(5)
for row in table:
    line = " ".join(f"{value:3d}" for value in row)
    print(line)
