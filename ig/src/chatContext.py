import array

class ChatContext:
    def __init__(self, user_special_token, model_special_token):
        self.context = []
        self.contextLength = 0
        self.user_special_token = user_special_token
        self.model_special_token = model_special_token

    def length(self):
        return self.contextLength

    def add_user_input(self, tokens_input):
        self.context.append([self.user_special_token])
        self.context.append(tokens_input)
        self.context.append([self.model_special_token])
        self.contextLength += len(tokens_input) + 2

    def add_model_output(self, model_output: list[int]):
        clean_model_output = self.trim_model_output(model_output)
        self.context.append(clean_model_output)

    def get_context(self):
        context = array.array('i', [])
        for item in self.context:
            for token in item:
                context.append(token)

        return context.tolist()
    
    def last_context_item(self):
        return self.context[-1]

    def trim_model_output(self, context: list[int]):
        clean_model_output = context[self.length():]
        startSliceIndex = -1
        endSliceIndex = -1
        isStartIndexFound = False

        length = len(clean_model_output)

        for index in range(length):
            token = clean_model_output[index]
            if token == self.user_special_token or token == self.model_special_token:
                if not isStartIndexFound:
                    startSliceIndex = index
                else:
                    endSliceIndex = index
                    break
            else:
                isStartIndexFound = True

        trimmed_output = clean_model_output[startSliceIndex+1:endSliceIndex]
        
        return trimmed_output