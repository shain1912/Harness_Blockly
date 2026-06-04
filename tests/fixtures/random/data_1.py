"""Descriptive statistics on a response-time sample: mean, median, mode, stdev."""
import statistics

response_ms = [120, 135, 110, 200, 135, 150, 135, 175, 160, 110, 135, 300]

n = len(response_ms)
mean = statistics.mean(response_ms)
median = statistics.median(response_ms)
mode = statistics.mode(response_ms)
stdev = statistics.pstdev(response_ms)

# Quartiles via sorted slicing.
ordered = sorted(response_ms)
q1 = statistics.median(ordered[: n // 2])
q3 = statistics.median(ordered[(n + 1) // 2 :])
iqr = q3 - q1

# Flag outliers using the 1.5*IQR rule.
lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
outliers = [x for x in ordered if x < lower or x > upper]

print(f"n={n}")
print(f"mean={mean:.2f}")
print(f"median={median:.1f}")
print(f"mode={mode}")
print(f"pstdev={stdev:.2f}")
print(f"Q1={q1:.1f} Q3={q3:.1f} IQR={iqr:.1f}")
print(f"outliers={outliers}")
