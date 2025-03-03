from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM
import torch

model = "ai-forever/rugpt3medium_based_on_gpt2"
tokenizer = AutoTokenizer.from_pretrained(model, cache_dir='./models/')
model = AutoModelForCausalLM.from_pretrained(model, cache_dir='./models/', torch_dtype=torch.float16)

pipe = pipeline(
    "text-generation",
    model=model,
    tokenizer=tokenizer,
    trust_remote_code=True,
    device_map="auto",
)

sequences = pipe(
    "Чей крым? Ответь коротко",
    max_new_tokens=100,
    do_sample=True,
    # temperature=0.2,
    # top_p=0.92,
    top_k=6,
    penalty_alpha=0.6,
    # repetition_penalty=1.2,
    # length_penalty=1.0,
    # stop_strings=['@@ПЕРВЫЙ@@'],
    # tokenizer=tokenizer,
    eos_token_id=tokenizer.eos_token_id,
)

for seq in sequences:
    print(f"Result: {seq['generated_text']}")