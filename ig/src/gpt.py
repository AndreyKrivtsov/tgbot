import torch
from transformers import pipeline, set_seed, AutoTokenizer, AutoModelForCausalLM
from src.chatContext import ChatContext

models = [
    'ai-forever/rugpt3medium_based_on_gpt2',
    't-bank-ai/ruDialoGPT-medium',
    'Mary222/MADE_AI_Dungeon_model_RUS',
    'Nehc/gpt2_priest_ru',
    'its5Q/rugpt3large_mailqa',
    'igorktech/rugpt3-joker-150k', # add "JOKE:" without spaces at the beginning, eos_token to the end
    'malalejandra/putinspeaks', # Putin's speeches scraped from kremlin.ru over last 2 terms of his presidency 2012-2022
    'Ifromspace/GRIEFSOFT-walr', # Забавное для дискордика))00)) https://discord.gg/HpeadKH
    'zlsl/l_erotic_kink_chat', # Сильно расширенная модель для эротического ролеплея. Для чата желательно останавливать после '\n', также ставьте более 5 попыток генерации и ожидаемое количество новых токенов > 350, тогда диалоги будут интереснее. Очень желательно в контексте и во время диалога указывать действия и мысли в скобках. Например: Привет (вхожу в комнату, закрываю дверь) Важно! В модели добавлен токен <char>, он указывает начало строки диалога, прямой
]

currentModel = models[0]

tokenizer = AutoTokenizer.from_pretrained(currentModel, cache_dir='./models/')
model = AutoModelForCausalLM.from_pretrained(currentModel, torch_dtype=torch.float16)
llm_chat = ChatContext(50257, 50258)

history = ''

def llm_process(message):
    inputs = tokenizer(message, return_tensors='pt')
    output_tokens = model.generate(
        **inputs,
        # do_sample=True,
        temperature=1,
        # top_p=0.92,
        top_k=10,
        penalty_alpha=0.2,
        repetition_penalty=1.2,
        # length_penalty=1.0,
        max_new_tokens=100,
        # stop_strings=['@@ПЕРВЫЙ@@'],
        tokenizer=tokenizer
    )
    output = tokenizer.decode(output_tokens[0], skip_special_tokens=False)

    return output

def query(message):
    output = llm_process(message)
    return output

q1 = 'Чей крым? Ответь коротко'
a1 = query(history + q1)
history = history + a1

print('q1:')
print(q1)

print('a1:')
print(a1)

q2 = 'Почему ты так считаешь?'
a2 = query(history + q2)

print('q2:')
print(q2)

print('a2:')
print(a2)