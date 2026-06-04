def merge_sorted(a, b):
    merged = []
    i = j = 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            merged.append(a[i])
            i += 1
        else:
            merged.append(b[j])
            j += 1
    merged.extend(a[i:])
    merged.extend(b[j:])
    return merged


left = [1, 4, 7, 9]
right = [2, 3, 5, 8, 10]
result = merge_sorted(left, right)
print("Left:", left)
print("Right:", right)
print("Merged:", result)
