# Matrix operations using nested lists (no external libraries).

def matrix_multiply(a, b):
    rows_a = len(a)
    cols_a = len(a[0])
    cols_b = len(b[0])
    result = [[0 for _ in range(cols_b)] for _ in range(rows_a)]
    for i in range(rows_a):
        for j in range(cols_b):
            total = 0
            for k in range(cols_a):
                total += a[i][k] * b[k][j]
            result[i][j] = total
    return result

def transpose(m):
    return [[m[i][j] for i in range(len(m))] for j in range(len(m[0]))]

A = [[1, 2], [3, 4]]
B = [[5, 6], [7, 8]]

print("Matrix A:", A)
print("Matrix B:", B)

product = matrix_multiply(A, B)
print("A x B:", product)

print("Transpose of A:", transpose(A))

# Sum of the main diagonal (the trace).
trace = sum(A[i][i] for i in range(len(A)))
print("Trace of A:", trace)

# Determinant of a 2x2 matrix.
det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
print("Determinant of A:", det)
