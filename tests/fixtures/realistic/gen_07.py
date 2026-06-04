"""Safely convert a list of strings to ints, collecting failures."""


def convert_ints(values):
    converted = []
    failures = []
    for v in values:
        try:
            converted.append(int(v))
        except ValueError:
            failures.append(v)
    return converted, failures


if __name__ == "__main__":
    raw = ["10", "20", "abc", "30", "4.5", "-7"]
    nums, bad = convert_ints(raw)
    print("Converted:", nums)
    print("Failed:   ", bad)
