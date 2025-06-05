import onnxruntime
# from optimum.onnxruntime import ORTModelForSequenceClassification
from transformers import AutoTokenizer
import os

model_path = './onnx/model.onnx'
sess_options = onnxruntime.SessionOptions()
# sess_options.optimized_model_filepath = os.path.join(model_path, "optimized_model_cpu.onnx")
session = onnxruntime.InferenceSession(model_path, sess_options)

# ort_model = ORTModelForSequenceClassification.from_pretrained(model_path)
tokenizer = AutoTokenizer.from_pretrained(model_path)

inputs = tokenizer("Подскажите по визам", return_tensors="pt")

ort_outputs = session.run(None, inputs)
# outputs = ort_model(**inputs)

print(ort_outputs)