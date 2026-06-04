# Word frequency counter with normalization (lower / strip punctuation / replace)
text = """The quick brown fox jumps over the lazy dog.
The dog was NOT amused, but the fox? The fox just ran!"""

# Normalize: lowercase, replace punctuation with spaces, then split
cleaned = text.lower()
for ch in ".,!?;:":
    cleaned = cleaned.replace(ch, " ")

words = cleaned.split()

freq = {}
for w in words:
    freq[w] = freq.get(w, 0) + 1

print(f"total words: {len(words)}")
print(f"unique words: {len(freq)}")
print("top 3 by frequency:")

# Sort by count desc, then alphabetically for determinism
ranked = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))
for word, count in ranked[:3]:
    bar = "#" * count
    print(f"  {word:<8} {count:>2} {bar}")
