from transformers import AutoTokenizer, AutoModelForSequenceClassification, AutoModel
import torch
from torch.nn.functional import normalize
import numpy as np

model_path = './models/result'
model_path_for_train = './models/initial'
model_id = "Geotrend/bert-base-ru-cased"
cache_dir = './cache/cached_models/'

class Model:
    config = None

    model = None
    tokenizer = None

    labels = ['не вопрос', 'вопрос']

    max_length_embeddings = 100

    def __init__(self):
        self.config = None

    def load_model(self):
        print("Loading model...", sep=' ', end='', flush=True)
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path)
        self.model.eval()
        print("done")

    def load_hf_model(self):
        print("Loading model... ", sep=' ', end='', flush=True)
        self.tokenizer = AutoTokenizer.from_pretrained(model_id, cache_dir=cache_dir)
        self.model = AutoModel.from_pretrained(model_id, cache_dir=cache_dir)
        self.model.eval()
        print("done")

    def load_model_for_train(self, num_labels):
        print("Loading model... ", sep=' ', end='', flush=True)
        self.tokenizer = AutoTokenizer.from_pretrained(model_path_for_train)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path_for_train, num_labels=num_labels)
        print("done")

    def classify(self, text):
        # Prepare input
        inputs = self.tokenizer(text, return_tensors="pt")

        # Make prediction
        outputs = self.model(**inputs)
        label_index = outputs.logits.argmax()
        return label_index

    def get_vector(self, text: str):
        self.model.config.output_hidden_states = True
        inputs = self.tokenizer(text, return_tensors="pt", padding="max_length", truncation=True, max_length=self.max_length_embeddings)
        with torch.no_grad():
            model_output = self.model(**inputs)
            last_hidden_state = model_output.hidden_states[5]
            sentence_embedding = last_hidden_state.mean(dim=1)
            # normalized_last_hidden_state = normalize(sentence_embedding, p=2, dim=1)
            embeddings = sentence_embedding

        self.model.config.output_hidden_states = False
        return embeddings