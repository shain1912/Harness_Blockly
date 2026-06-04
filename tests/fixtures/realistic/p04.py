def bubble_sort(values):
    items = values[:]
    n = len(items)
    for i in range(n):
        for j in range(n - i - 1):
            if items[j] > items[j + 1]:
                items[j], items[j + 1] = items[j + 1], items[j]
    return items


def binary_search(items, target):
    low = 0
    high = len(items) - 1
    while low <= high:
        mid = (low + high) // 2
        if items[mid] == target:
            return mid
        elif items[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1


data = [37, 4, 19, 8, 25, 1, 42]
sorted_data = bubble_sort(data)
print("Sorted:", sorted_data)

for target in [25, 100]:
    idx = binary_search(sorted_data, target)
    print(f"{target} found at index {idx}")
