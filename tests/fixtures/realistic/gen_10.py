"""Simple command-line style arg handling with a function dispatch dict."""
import sys


def cmd_hello(args):
    name = args[0] if args else "world"
    print(f"Hello, {name}!")


def cmd_add(args):
    total = sum(int(a) for a in args)
    print(f"Sum: {total}")


def cmd_help(args):
    print("Commands:", ", ".join(COMMANDS))


COMMANDS = {
    "hello": cmd_hello,
    "add": cmd_add,
    "help": cmd_help,
}


def main(argv):
    if not argv:
        cmd_help([])
        return
    command, *args = argv
    handler = COMMANDS.get(command, cmd_help)
    handler(args)


if __name__ == "__main__":
    main(sys.argv[1:])
