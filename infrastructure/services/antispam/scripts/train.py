import evaluate
import numpy as np
import pandas as pd
from datasets import Dataset
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments, DataCollatorWithPadding

def load_dataset_csv(filepath: str) -> Dataset:
    """
    Load a CSV file with columns 'message' and 'spam'.
    Rename columns to 'text' and 'label' for consistency.
    """
    df = pd.read_csv(filepath, usecols=['text', 'label'])
    df['label'] = df['label'].astype(int) # Convert spam to integer labels (assuming 0 or 1)
    return Dataset.from_pandas(df)

def tokenize_function(examples: dict, tokenizer, max_length=128) -> dict:
    """
    Tokenize the input text with truncation and padding.
    """
    return tokenizer(examples["text"], truncation=True, padding="max_length", max_length=max_length)

def main() -> None:
    # Load the cleaned dataset and split into training and testing sets
    dataset = load_dataset_csv("cleaned_dataset.csv")
    split_dataset = dataset.train_test_split(test_size=0.2, seed=42)

    # Load a Pretrained Russian-Friendly Transformer Model and Tokenizer
    model_name = "cointegrated/rubert-tiny" # lighter version of RuBERT
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    # Tokenize the dataset
    tokenized_datasets = split_dataset.map(lambda x: tokenize_function(x, tokenizer), batched=True)
    
    # Data collator for dynamic padding
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    # Load a model for sequence classification with 2 labels (spam and ham)
    model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)

    # Define evaluation metrics
    metric_accuracy = evaluate.load("accuracy")
    metric_precision = evaluate.load("precision")
    metric_recall = evaluate.load("recall")
    metric_f1 = evaluate.load("f1")
    
    def compute_metrics(eval_pred):
        """
        Compute accuracy, precision, recall, and F1 score.
        """
        logits, labels = eval_pred
        predictions = np.argmax(logits, axis=-1)
        acc = metric_accuracy.compute(predictions=predictions, references=labels)
        prec = metric_precision.compute(predictions=predictions, references=labels, average="macro")
        rec = metric_recall.compute(predictions=predictions, references=labels, average="macro")
        f1 = metric_f1.compute(predictions=predictions, references=labels, average="macro")
        return {"accuracy": acc["accuracy"], "precision": prec["precision"], "recall": rec["recall"], "f1": f1["f1"]}
    
    # Set Up Training Arguments
    training_args = TrainingArguments(
        output_dir="./results",
        num_train_epochs=20,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=16,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=1,  # only the best model
        learning_rate=2e-5,
        weight_decay=0.01,
        logging_dir='./logs',
        logging_steps=10,
        load_best_model_at_end=True,
        metric_for_best_model="f1"
    )
    
    # Initialize the Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["test"],
        processing_class=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics
    )
    
    # Fine-Tune the Model
    trainer.train()
    eval_results = trainer.evaluate()
    print("Evaluation Results:", eval_results)
    
    # Save the Fine-Tuned Model and Tokenizer for Inference
    model_path = "model"
    model.save_pretrained(model_path)
    tokenizer.save_pretrained(model_path)

if __name__ == "__main__":
    main()
