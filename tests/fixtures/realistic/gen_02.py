"""A simple bank account with deposit, withdraw, and overdraft protection."""


class InsufficientFundsError(Exception):
    pass


class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("Deposit must be positive")
        self.balance += amount
        return self.balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise InsufficientFundsError(
                f"Cannot withdraw {amount}, balance is {self.balance}"
            )
        self.balance -= amount
        return self.balance


if __name__ == "__main__":
    acct = BankAccount("Alice", 100)
    acct.deposit(50)
    acct.withdraw(30)
    print(f"{acct.owner}'s balance: {acct.balance}")
    try:
        acct.withdraw(1000)
    except InsufficientFundsError as e:
        print(f"Error: {e}")
