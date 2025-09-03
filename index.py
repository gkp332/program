import random
import string

def generate_password(length):
    chars = string.ascii_letters + string.digits + "#@!$%&*?"
    return ''.join(random.choice(chars) for _ in range(length))

while True:
    try:
        length = int(input("How many digits do you want your password to be? "))
        if length < 4:
            print("Please choose at least 4 digits for better security.")
            continue
        password = generate_password(length)
        print("Your safe password is:", password)
    except ValueError:
        print("Please enter a valid number.")
        continue

    again = input("Do you want to create another one? (yes/no): ").strip().lower()
    if again != "yes":
        print("Goodbye!")
        break