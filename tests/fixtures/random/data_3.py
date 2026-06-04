"""Cohort grouping: bucket users by age band and summarize spend with numpy."""
import numpy as np
from collections import defaultdict

users = [
    {"name": "Ann", "age": 23, "spend": 50.0},
    {"name": "Bob", "age": 35, "spend": 120.0},
    {"name": "Cat", "age": 41, "spend": 80.0},
    {"name": "Dan", "age": 29, "spend": 60.0},
    {"name": "Eve", "age": 52, "spend": 200.0},
    {"name": "Fay", "age": 38, "spend": 90.0},
    {"name": "Gus", "age": 26, "spend": 45.0},
    {"name": "Hal", "age": 47, "spend": 150.0},
]


def band(age):
    if age < 30:
        return "18-29"
    if age < 40:
        return "30-39"
    if age < 50:
        return "40-49"
    return "50+"


# Group spend values into cohort buckets.
groups = defaultdict(list)
for u in users:
    groups[band(u["age"])].append(u["spend"])

print("=== Spend by age cohort ===")
for cohort in sorted(groups):
    arr = np.array(groups[cohort])
    print(
        f"{cohort}: count={arr.size} "
        f"mean={arr.mean():.2f} max={arr.max():.2f} total={arr.sum():.2f}"
    )

# zip two parallel arrays to find the biggest single spender overall.
names = [u["name"] for u in users]
spends = [u["spend"] for u in users]
top_name, top_spend = max(zip(names, spends), key=lambda pair: pair[1])
print(f"overall_mean={np.mean(spends):.2f}")
print(f"top_spender={top_name} ({top_spend:.2f})")
