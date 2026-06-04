"""Filter and transform a list of records, then sort by a field."""

people = [
    {"name": "Alice", "age": 30, "city": "NYC"},
    {"name": "Bob", "age": 17, "city": "LA"},
    {"name": "Carol", "age": 25, "city": "SF"},
    {"name": "Dave", "age": 40, "city": "NYC"},
]


def adults_by_age(records):
    adults = [
        {"name": r["name"], "age": r["age"]}
        for r in records
        if r["age"] >= 18
    ]
    return sorted(adults, key=lambda r: r["age"])


if __name__ == "__main__":
    for person in adults_by_age(people):
        print(f"{person['name']} ({person['age']})")
