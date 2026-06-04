"""Sales analytics: aggregate monthly revenue by region and rank performers."""
from collections import defaultdict

# (region, month, units, unit_price)
sales = [
    ("North", "Jan", 120, 9.5),
    ("North", "Feb", 80, 9.5),
    ("South", "Jan", 200, 8.0),
    ("South", "Feb", 150, 8.0),
    ("East", "Jan", 60, 12.0),
    ("East", "Feb", 90, 12.0),
    ("West", "Jan", 110, 10.0),
    ("West", "Feb", 130, 10.0),
]

# Total revenue per region using a grouping dict.
revenue_by_region = defaultdict(float)
units_by_region = defaultdict(int)
for region, month, units, price in sales:
    revenue_by_region[region] += units * price
    units_by_region[region] += units

# Rank regions by revenue (descending), then name (ascending) for ties.
ranking = sorted(revenue_by_region.items(), key=lambda kv: (-kv[1], kv[0]))

print("=== Revenue by region ===")
for rank, (region, revenue) in enumerate(ranking, start=1):
    avg_price = revenue / units_by_region[region]
    print(f"{rank}. {region:<6} revenue=${revenue:,.2f} units={units_by_region[region]} avg=${avg_price:.2f}")

total = sum(revenue_by_region.values())
print(f"Total revenue: ${total:,.2f}")
print(f"Top region: {ranking[0][0]}")
