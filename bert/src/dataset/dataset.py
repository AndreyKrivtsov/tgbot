from datasets import load_dataset, Dataset
import pandas as pd
import numpy as np

def load_ds(name):
    # Загрузка датасета
    dataset_long = load_dataset(name, cache_dir="./cache/cached_datasets/")
    dataset_short = Dataset.from_dict(dataset_long['train'][:1000])
    dataset = dataset_short.train_test_split(test_size=0.1, shuffle=True, seed=42)

    # Определение меток
    labels = ['спорт', 'происшествия', 'политика', 'наука', 'культура', 'экономика']
    id2label = {idx: label for idx, label in enumerate(labels)}
    label2id = {label: idx for idx, label in enumerate(labels)}

    return dataset, labels, id2label, label2id

def get_csv_dataset(file_path):
    # Загрузка и подготовка датасета
    df = pd.read_csv(file_path, sep="\t")
    df = pd.concat([df.loc[df.label == 0][:2000], df.loc[df.label == 1][:2000]])

    dataset = Dataset.from_dict(df)
    dataset = dataset.train_test_split(test_size=0.1, shuffle=True, seed=42)

    # Определение меток
    labels = ['не вопрос', 'вопрос']
    id2label = {idx: label for idx, label in enumerate(labels)}
    label2id = {label: idx for idx, label in enumerate(labels)}

    return dataset, labels, id2label, label2id