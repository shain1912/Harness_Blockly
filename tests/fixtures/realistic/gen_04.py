"""Parse a list of 'key=value' strings into a dict and pretty-print it."""
import json


def parse_pairs(pairs):
    result = {}
    for pair in pairs:
        key, sep, value = pair.partition("=")
        if sep:
            result[key.strip()] = value.strip()
    return result


if __name__ == "__main__":
    raw = ["host=localhost", "port=8080", "debug=true", "name=my app"]
    config = parse_pairs(raw)
    print(json.dumps(config, indent=2))
