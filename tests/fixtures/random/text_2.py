# Simple key=value config parser (split on '=', strip, ignore comments)
config = """
# app settings
host = localhost
port =8080
debug= true
name = My App
empty_value =
# trailing comment line
timeout=30
"""

settings = {}
for line in config.splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    if "=" not in line:
        continue
    key, _, value = line.partition("=")
    settings[key.strip()] = value.strip()

# Print parsed settings, joined nicely
print("parsed config:")
for key in sorted(settings):
    print(f"  {key} -> {repr(settings[key])}")

# Reconstruct a normalized config string via join
normalized = "; ".join(f"{k}={v}" for k, v in sorted(settings.items()))
print("normalized:")
print(normalized)

# Typed access with simple coercion
port = int(settings["port"])
debug = settings["debug"] == "true"
print(f"port+1={port + 1}, debug={debug}")
