"""Sorting: bubble sort and merge sort, verified against sorted()."""


def bubble_sort(arr):
    a = list(arr)
    n = len(a)
    for i in range(n - 1):
        swapped = False
        for j in range(n - 1 - i):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
                swapped = True
        if not swapped:
            break
    return a


def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result


def merge_sort(arr):
    if len(arr) <= 1:
        return list(arr)
    mid = len(arr) // 2
    return merge(merge_sort(arr[:mid]), merge_sort(arr[mid:]))


data = [5, 2, 9, 1, 5, 6, 3, 8, 4, 7]
b = bubble_sort(data)
m = merge_sort(data)

print("input:      ", data)
print("bubble sort:", b)
print("merge sort: ", m)
print("matches sorted():", b == sorted(data) and m == sorted(data))
