def add_item(inventory, name, quantity):
    inventory[name] = inventory.get(name, 0) + quantity


def remove_item(inventory, name, quantity):
    if name in inventory:
        inventory[name] -= quantity
        if inventory[name] <= 0:
            del inventory[name]


inventory = {}
add_item(inventory, "apple", 10)
add_item(inventory, "banana", 5)
add_item(inventory, "apple", 3)
remove_item(inventory, "banana", 2)

print("Inventory:")
for name, qty in inventory.items():
    print(f"  {name}: {qty}")

total = sum(inventory.values())
print(f"Total items: {total}")
print(f"Distinct products: {len(inventory)}")
