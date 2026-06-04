def is_valid_email(address):
    if address.count("@") != 1:
        return False
    local, domain = address.split("@")
    if not local or not domain:
        return False
    if "." not in domain:
        return False
    if domain.startswith(".") or domain.endswith("."):
        return False
    if " " in address:
        return False
    return True


candidates = [
    "alice@example.com",
    "bob.smith@mail.co",
    "no-at-sign.com",
    "two@@signs.com",
    "trailing@dot.",
]

for email in candidates:
    status = "valid" if is_valid_email(email) else "invalid"
    print(f"{email}: {status}")
