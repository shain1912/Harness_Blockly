class Stack:
    def __init__(self):
        self.items = []

    def push(self, value):
        self.items.append(value)

    def pop(self):
        if self.is_empty():
            raise IndexError("pop from empty stack")
        return self.items.pop()

    def peek(self):
        return self.items[-1]

    def is_empty(self):
        return len(self.items) == 0

    def size(self):
        return len(self.items)


stack = Stack()
for n in [10, 20, 30]:
    stack.push(n)

print("Top:", stack.peek())
print("Size:", stack.size())

while not stack.is_empty():
    print("Popped:", stack.pop())
