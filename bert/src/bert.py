import time
from model.model import Model
from search.search import Search

sentenses = [
    "Путин сообщил, что не станет организовывать семинар.",
    "Чемпионат РФ начнется в феврале.",
    "Сегодня очень хорошая погода!",
    "Инфляция в России достигла 10%.",
    "В москве прошел концерт Филиппа Киркорова.",
    "Недавно приехали и не можем найти где поесть. Где можно нормально поесть?",
    "Я вам уже рассказывал, где можно нормально поесть",
    "Подскажите плиз кто сдает байки",
    "Уважаемые ренталы, у кого если байк в аренду ? На две недели"
]

data = [
    "ремонт байка, ремонтирование мотоцикла, ремонт скутера, мастер по ремонту, починить, поменять масло, амортизаторы",
    "аренда байка, мотоцикла, скутера, взять в аренду, взять в прокат",
]

texts = [
    "Подскажите плиз кто сдает байки",
    "Продам байк Excel-2 Двигатель: 150 куб.см Комфорт: Удобное большое сиденье Багажник: Большой, вместительный Идеален для езды по городу и в горы Цена: 4 миллиона донг Документы в наличии",
    "Знаете круглосуточный ремонт байков в центре? Или точнее шиномонтаж",
    "всем привет, есть тут те, кто занимается тотал ремонтом байков?",
    "Уважаемые ренталы, у кого если байк в аренду ? На две недели"
]

classifier = Model()
classifier.load_model()
search = Search(classifier)
search.set_data(data)

def search_similarity():
    t = time.time()

    for text in texts:
        data_index, similarity = search.query(text)
        print("Text:", text)
        print("Label:", data[data_index])
        print("Similarity:", similarity)

        # for i in range(100):
        #     data_index, similarity = search.query(text)
        #     print("Label:", data[data_index])

        print("\nElapsed time:", time.time() - t, "\n")

def classify():
    start_time = time.time()

    for text in sentenses:
        result = classifier.classify(text)
        print(result, "-", text)

    print('\nElapsed time:', time.time() - start_time, "\n")

search_similarity()