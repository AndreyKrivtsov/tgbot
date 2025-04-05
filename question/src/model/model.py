from transformers import AutoTokenizer, AutoModelForSequenceClassification, AutoModel
import torch
from torch.nn.functional import normalize
import numpy as np

class Model:
    config = None
    model_path = None
    cache_dir = './cache/cached_models/'

    model = None
    tokenizer = None

    labels = ['не вопрос', 'вопрос']

    max_length_embeddings = 100

    def __init__(self, model_path=None, cache_dir=None):
        self.config = None
        self.model_path = model_path
        self.cache_dir = cache_dir if cache_dir else self.cache_dir

    def load_model(self):
        print("Loading model...", sep=' ', end='', flush=True)
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_path, cache_dir=self.cache_dir)
        self.model = AutoModel.from_pretrained(self.model_path, cache_dir=self.cache_dir)
        self.model.eval()
        print("done")

    def load_cf_model(self):
        print("Loading model...", sep=' ', end='', flush=True)
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_path, cache_dir=self.cache_dir)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_path, cache_dir=self.cache_dir)
        self.model.eval()
        print("done")

    def load_cf_train_model(self, num_labels=None):
        print("Loading model...", sep=' ', end='', flush=True)
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_path, cache_dir=self.cache_dir)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_path, cache_dir=self.cache_dir, num_labels=num_labels)
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
            last_hidden_state = model_output.hidden_states[-1][:, 0]
            # sentence_embedding = last_hidden_state.mean(dim=1)
            # normalized_last_hidden_state = normalize(sentence_embedding, p=2, dim=1)
            embeddings = normalize(last_hidden_state, p=2, dim=1)

        self.model.config.output_hidden_states = False
        return embeddings