from optimum.onnxruntime import ORTModelForSequenceClassification
from transformers import AutoTokenizer

model_path = './models/result'
save_directory = "onnx/"
example = "adsfasdf"

ort_model = ORTModelForSequenceClassification.from_pretrained(model_path, export=True)
tokenizer = AutoTokenizer.from_pretrained(model_path)

ort_model.save_pretrained(save_directory)
tokenizer.save_pretrained(save_directory)