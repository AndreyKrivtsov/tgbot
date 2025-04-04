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
        # if not isinstance(query_vector, np.ndarray):
        #     raise TypeError("query_vector must be a numpy array")
        
        similarity = 0
        data_index = -1

        for index in range(len(self.data_embeddings)):
            data_vector = self.data_embeddings[index]

            # s = self.cosine_similarity(query_vector, data_vector)

            s = torch.cosine_similarity(query_vector, data_vector)

            if s > similarity:
                similarity = s
                data_index = index

        return data_index, similarity

    def cosine_similarity(self, lst1, lst2):
        return np.dot(lst1, lst2) / (np.linalg.norm(lst1) * np.linalg.norm(lst2))

    def get_model_vector(self, data_item):
        return self.model.get_vector(data_item)