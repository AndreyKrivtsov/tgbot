import re
import ftfy
import unicodedata
import textacy.preprocessing as tp
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification


class SpamClassifier:
    def __init__(self, model_path="spam_classifier_transformer", max_length=128):
        """
        Initializes the spam classifier by loading the pretrained model and tokenizer.
        
        Args:
            model_path (str): Path to the saved model directory.
            max_length (int): Maximum sequence length for tokenization.
        """
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path)
        self.max_length = max_length
        # Set device to GPU if available, else CPU
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        self.model.eval()

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
        # Fix unicode Issues (e.g., "CafÃ©" → "Café")
        text = ftfy.fix_text(text)

        # Normalize diacritics and symbols (e.g., "cafè" → "cafe")
        text = unicodedata.normalize('NFD', text)

        # Replace special characters (emojies, logins, hashtags, etc.)
        text = tp.replace.emojis(text, mapper["emojies"])
        text = tp.replace.emails(text, mapper["mails"])
        text = tp.replace.urls(text, mapper["urls"])
        text = tp.replace.hashtags(text, mapper["hashtags"])
        text = tp.replace.user_handles(text, mapper["logins"])
        text = tp.replace.phone_numbers(text, mapper["logins"])

        # Remove punctuation and extra whitespace
        text = tp.remove.punctuation(text) 
        text = tp.normalize.whitespace(text)

        # Keep only Cyrillic and Latin characters
        text = re.sub(r'[^a-zA-Zа-яА-ЯёЁ0-9\s.,!?<>]', '', text)

        return text.lower()

    def classify(self, text: str) -> bool:
        """
        Classify a given text as spam or not.
        
        Args:
            text (str): Input text to classify.
            
        Returns:
            bool: True if text is classified as spam, False otherwise.
        """
        # Tokenize input text with truncation and padding
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            padding="max_length",
            max_length=self.max_length
        )
        # Move inputs to the same device as the model
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
            logits = outputs.logits
            # Get the predicted class (0: non-spam, 1: spam)
            predicted_class = logits.argmax(dim=-1).item()
        
        return predicted_class == 1


if __name__ == "__main__":
    model_path = "./model"
    classifier = SpamClassifier(model_path=model_path)

    sample_texts = [
        "Поздравляем! Вы выиграли миллион долларов! Переведите 100$ на наш счет для получения приза",
        "Срочно! Перезвони мне!",
        "Скидки на все товары до 50% только сегодня!",
        "Привет! Как дела?",
        "Сегодня будет дождь",
        "Работы онлайн, писать в лс",
        "Приходи на вечеринку, у нас бесплатное пиво!"
    ]
    for text in sample_texts:
        is_spam = classifier.classify(text)
        print(f"Message: {text}\nIs spam: {is_spam}\n")
