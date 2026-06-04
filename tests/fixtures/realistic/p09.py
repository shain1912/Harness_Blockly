def compound_interest(principal, rate, years):
    balance = principal
    history = []
    for year in range(1, years + 1):
        balance *= (1 + rate)
        history.append((year, balance))
    return history


principal = 1000.0
rate = 0.05
years = 5

print(f"Principal: ${principal:.2f} at {rate * 100:.1f}% for {years} years")
for year, balance in compound_interest(principal, rate, years):
    print(f"Year {year}: ${balance:.2f}")
