text = "The quick brown fox jumps over the lazy dog"
vowels = "aeiou"

vowel_count = 0
consonant_count = 0

for ch in text.lower():
    if ch.isalpha():
        if ch in vowels:
            vowel_count += 1
        else:
            consonant_count += 1

total = vowel_count + consonant_count
print("Text:", text)
print(f"Vowels: {vowel_count}")
print(f"Consonants: {consonant_count}")
print(f"Total letters: {total}")
