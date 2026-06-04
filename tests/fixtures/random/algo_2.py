"""Binary search on a sorted list (iterative)."""


def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


sorted_data = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]

print("array:", sorted_data)
for t in [1, 9, 19, 8, 20]:
    idx = binary_search(sorted_data, t)
    if idx >= 0:
        print("found", t, "at index", idx)
    else:
        print(t, "not found")
