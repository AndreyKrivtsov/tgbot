from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from scripts.inference import SpamClassifier
from pydantic import BaseModel

classifier = SpamClassifier(model_path="./model")
app = FastAPI()

class Query(BaseModel):
    text: str

class Responce(BaseModel):
    is_spam: bool

@app.post("/")
async def antispam(query: Query):
    is_spam = classifier.classify(classifier.preprocess(query.text))
    responce = Responce(is_spam = is_spam)
    responce_data = jsonable_encoder(responce)
    return JSONResponse(content=responce_data)

# texts = [
#     "Приветствую! Стабильный доход, от 570 долларов в неделю, всё официально. Пишите старт в личные.",
#     "Приветствую, проверенный метод с доходом от 530 долларов за неделю, никаких сложностей, пишите плюс в личные сообщения.",
#     "Приветствую. Доход 200 долларов ежедневно. Осталось 4 места. Пишите в личные старт, расскажу детали",
#     "Всем привет! Есть хорошие материалы про трейдингу. Кому-нибудь нужно?",
#     "Здравствуйте. Ищу 2 амбициозных человека, от 350 долларов. Все детали в личных сообщениях, пишите хочу"
# ]

# for text in texts:
#     is_spam = classifier.classify(classifier.preprocess(text))
#     print(is_spam)