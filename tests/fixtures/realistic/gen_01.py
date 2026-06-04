"""Count word frequencies in a text file and print the top 5."""
from collections import Counter


def top_words(path, n=5):
    with open(path, encoding="utf-8") as f:
        text = f.read().lower()
    words = [w.strip(".,!?;:\"'()") for w in text.split()]
    words = [w for w in words if w]
    return Counter(words).most_common(n)


if __name__ == "__main__":
    for word, count in top_words("sample.txt"):
        print(f"{word}: {count}")
