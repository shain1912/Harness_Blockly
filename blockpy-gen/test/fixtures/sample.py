"""Sample module for introspection tests."""

def greet(name, excited=False):
    """Return a greeting."""
    return ("HELLO " if excited else "hello ") + name

class Counter:
    """A tiny counter."""
    def __init__(self, start=0):
        self.n = start
    def bump(self, by=1) -> int:
        """Increase and return the count."""
        self.n += by
        return self.n
    def reset(self) -> None:
        """Reset to zero."""
        self.n = 0

_private = 1
def _hidden():
    pass
