import numpy as np
import torch

class Search:
    data_embeddings = None
    model = None

    def __init__(self, model):
        self.model = model

    def set_data(self, data: list):
        if not isinstance(data, list):
            raise TypeError("data must be an list")

        if len(data) == 0:
            raise ValueError("data cannot be empty")

        data_embeddings = []

        print("Precomputing embeddings...")

        for data_item in data:
            data_embeddings.append(self.get_model_vector(data_item))

        self.data_embeddings = data_embeddings

        print("Precomputing embeddings done")

    def query(self, text):
        query_vector = self.get_model_vector(text)
        return self.search(query_vector)

    def search(self, query_vector) -> tuple:
        similarity = 0
        data_index = -1

        for index in range(len(self.data_embeddings)):
            data_vector = self.data_embeddings[index]

            s = self.similarity(query_vector, data_vector)

            print(f"Similarity: {s}")

            if s > similarity:
                similarity = s
                data_index = index

        return data_index, similarity

    def cosine_similarity(self, lst1, lst2):
        return np.dot(lst1, lst2) / (np.linalg.norm(lst1) * np.linalg.norm(lst2))

    def similarity(self, lst1, lst2):
        sim_scores = lst1 @ lst2.T
        return sim_scores.diag().tolist()[0]

    def get_model_vector(self, data_item):
        return self.model.get_vector(data_item)