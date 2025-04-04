import pandas as pd

q_tags = [
    "подскажите",
    "кто может",
    "помогите",
    "знает кто-нибудь",
    "кто-нибудь знает",
    "кто нибудь знает",
    "посоветуйте",
    "знает кто-нибудь",
    "порекомендуйте",
    "можете подсказ",
    "кто может",
    "кто-нибудь видел",
    "кто нибудь видел",
    "не подскажите",
    "не подскажете"
]

def process_tg_dataset(df_input):
    df_question = pd.DataFrame()
    df_mess = None
    df_result = pd.DataFrame()

    df = pd.DataFrame(df_input.messages.tolist())
    df = df.query('type == "message"')
    df = df[['text']][df['text'].apply(lambda text: isinstance(text, str))]
    df = df[df['text'].str.len() > 10][df['text'].str.len() < 1000]
    df.insert(0, "id", df.index)

    for q_tag in q_tags:
        df_question = pd.concat([df_question, df.loc[df['text'].str.contains(q_tag, case=False)]])

    df_question = df_question.drop_duplicates(subset=['text'])
    df_question = df_question[df_question['text'].str.len() < 500]
    df_question.insert(1, "label", 1)

    df_mess = df.drop(df_question['id'], axis=0).drop_duplicates(subset=['text'])
    df_mess.insert(1, "label", 0)

    df_result = pd.concat([df_question, df_mess], ignore_index=True)
    df_result = df_result.sample(frac=1).reset_index(drop=True)
    df_result = df_result.drop(columns=['id'])

    return df_result

def process_gen_dataset(df_input):
    df_result = df_input.rename(columns={0: "text"})
    df_result['text'] = df_result['text'].str.replace(".*\[q\] ", "", regex=True)
    df_result.insert(1, "label", 1)
    return df_result
    
df_result = pd.DataFrame()

df_tg1 = pd.read_json('./src/process_dataset/tg_result1.json')
df_tg2 = pd.read_json('./src/process_dataset/tg_result2.json')
df_gen = pd.read_csv('./src/process_dataset/gen_result.txt', sep="\t", header=None)

df_gen_question = process_gen_dataset(df_gen)
df_tg1 = process_tg_dataset(df_tg1)
df_tg2 = process_tg_dataset(df_tg2)

df_result = pd.concat([df_result, df_gen_question, df_tg1, df_tg2], ignore_index=True)
df_result = df_result.sample(frac=1).reset_index(drop=True)
df_result.insert(0, "id", df_result.index)

print(df_result)

df_result.to_csv('./src/process_dataset/q_tg_chat_dataset.csv', index=False, sep="\t")

