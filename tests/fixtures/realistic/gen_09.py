"""Format and print a small table of data with aligned columns."""

rows = [
    ("Name", "Age", "City"),
    ("Alice", "30", "New York"),
    ("Bob", "25", "Los Angeles"),
    ("Carol", "35", "San Francisco"),
]


def print_table(table):
    widths = [max(len(row[i]) for row in table) for i in range(len(table[0]))]
    for row in table:
        line = "  ".join(cell.ljust(widths[i]) for i, cell in enumerate(row))
        print(line)


if __name__ == "__main__":
    print_table(rows)
