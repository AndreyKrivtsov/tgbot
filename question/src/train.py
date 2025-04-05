from transformers import TrainingArguments, Trainer
import evaluate
import numpy as np
from model.model import Model
from dataset.dataset import load_ds, get_csv_dataset

batch_size = 32

# dataset, labels, id2label, label2id = load_ds("ai-forever/headline-classification")
dataset, labels, id2label, label2id = get_csv_dataset('./src/process_dataset/q_tg_chat_dataset.csv')

model_path = './models/initial'

classifier = Model(model_path)
classifier.load_cf_train_model(num_labels = len(labels))

model = classifier.model
tokenizer = classifier.tokenizer

# Функция предобработки данных
def preprocess_data(examples):
    text = examples["text"]
    encoding = tokenizer(text)
    encoding["labels"] = [[label] for label in examples["label"]]
    return encoding

# Применение предобработки к датасету
encoded_dataset = dataset.map(preprocess_data, batched=True, remove_columns=dataset['train'].column_names)

# Установка формата для PyTorch
encoded_dataset.set_format("torch")

metric = evaluate.load("accuracy")

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    # convert the logits to their predicted class
    predictions = np.argmax(logits, axis=-1)
    return metric.compute(predictions=predictions, references=labels)

def train():
    args = TrainingArguments(
        eval_strategy = "epoch",
        save_strategy = "no",
        learning_rate=2e-5,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        num_train_epochs=5,
        weight_decay=0.01,
    )

    trainer = Trainer(
        model,
        args,
        train_dataset=encoded_dataset["train"],
        eval_dataset=encoded_dataset["test"],
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
    )

    trainer.train()
    trainer.evaluate()
    trainer.save_model("./models/result/")

train()