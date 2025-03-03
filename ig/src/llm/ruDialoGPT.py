import torch
from transformers import pipeline, set_seed, AutoTokenizer, AutoModelForCausalLM

tokenizer = AutoTokenizer.from_pretrained("t-bank-ai/ruDialoGPT-medium")
model = AutoModelForCausalLM.from_pretrained("t-bank-ai/ruDialoGPT-medium")

text = '@@ПЕРВЫЙ@@ Чей крым? Ответь развернуто в несколько предложений. @@ВТОРОЙ@@ '

def query(message):
    inputs = tokenizer(text, return_tensors='pt')
    generated_token_ids = model.generate(
        **inputs,
        top_k=10,
        top_p=0.95,
        num_beams=3,
        num_return_sequences=3,
        do_sample=True,
        no_repeat_ngram_size=2,
        temperature=1.2,
        repetition_penalty=1.2,
        length_penalty=1.0,
        eos_token_id=50257,
        max_new_tokens=100
    )
    context_with_response = [tokenizer.decode(sample_token_ids, skip_special_tokens= True) for sample_token_ids in generated_token_ids]
    
    print(context_with_response[len(context_with_response) - 1])

    output = context_with_response[len(context_with_response) - 1]

    return output


query('')