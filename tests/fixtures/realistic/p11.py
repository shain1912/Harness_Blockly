words = ["apple", "banana", "avocado", "cherry", "blueberry", "apricot", "cantaloupe"]

groups = {}
for word in words:
    first = word[0]
    if first not in groups:
        groups[first] = []
    groups[first].append(word)

for letter in sorted(groups):
    print(f"{letter}: {', '.join(groups[letter])}")
