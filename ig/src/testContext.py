from src.chatContext import ChatContext

context = ChatContext(11111111, 99999999)

context.add_user_input([ 1659, 355, 15258, 35, 8353, 278, 13327, 203])

print(context.length())
print(context.context)
print(context.get_context())

flatContext = context.get_context()

model_output = [11111111, 1659, 355, 15258, 35, 8353, 278, 13327, 203, 99999999, 99999999, 99999999, 50257, 16676, 694, 453, 26624, 35, 50258, 203, 11111111, 11111111]

context.add_model_output(model_output)

print(context.length())
print(context.context)
print(context.get_context())