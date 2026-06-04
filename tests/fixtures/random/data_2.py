"""Word-frequency analysis: tokenize text, count, and report top terms + set ops."""
from collections import Counter

text = """
data drives decisions and good data drives good decisions
but bad data drives bad decisions so clean the data
""".lower()

words = text.split()

# Frequency table.
counts = Counter(words)
top3 = counts.most_common(3)

# Comprehension: words appearing more than once.
repeated = sorted({w for w, c in counts.items() if c > 1})

# Set algebra between two vocabularies.
positive = {"good", "clean", "drives"}
negative = {"bad", "decisions"}
vocab = set(words)

print(f"total_words={len(words)}")
print(f"unique_words={len(vocab)}")
print("top3=" + ", ".join(f"{w}:{c}" for w, c in top3))
print(f"repeated={repeated}")
print(f"positive_present={sorted(vocab & positive)}")
print(f"negative_present={sorted(vocab & negative)}")
print(f"never_used_positive={sorted(positive - vocab)}")
