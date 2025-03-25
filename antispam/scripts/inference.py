import re
import unicodedata
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from datetime import datetime

class SpamClassifier:
    def __init__(self, model_path="spam_classifier_transformer", max_length=128):
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path)
        self.max_length = max_length

    def preprocess(self, text: str) -> str:
        mapper = {
            "emojies": "<e>",
            "mails": "<m>",
            "logins": "<l>",
            "hashtags": "<h>",
            "commands": "<c>",
            "urls": "<u>",
            "phone_numbers": "<p>"
        }

        text = unicodedata.normalize('NFD', text)
        text = re.sub(r'[^\w\s]', '', text)
        # text = re.sub(r'[^a-zA-Zа-яА-ЯёЁ0-9\s.,!?<>]', '', text)

        return text.lower()

    def classify(self, text: str) -> bool:
        # print("\n====================")
        # print(text)

        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            padding="max_length",
            max_length=self.max_length
        )

        with torch.no_grad():
            outputs = self.model(**inputs)
            logits = outputs.logits
            predicted_class = logits.argmax(dim=-1).item()


        # print(logits[0][0] - logits[0][1])

        return predicted_class == 1
