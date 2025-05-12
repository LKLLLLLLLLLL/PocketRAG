import os
import argparse
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from optimum.onnxruntime import ORTModelForSequenceClassification

def convert_safetensors_to_onnx(model_path, output_dir, quantize=False):
    """
    将SafeTensors模型转换为ONNX格式
    
    参数:
        model_path: SafeTensors模型路径
        output_dir: ONNX模型输出目录
        quantize: 是否量化模型（降低模型大小）
    """
    print(f"正在加载模型: {model_path}")
    
    # 加载模型和分词器
    tokenizer = AutoTokenizer.from_pretrained("BAAI/bge-reranker-v2-m3")
    model = AutoModelForSequenceClassification.from_pretrained("BAAI/bge-reranker-v2-m3")
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"正在将模型转换为ONNX格式...")
    
    # 导出为ONNX格式
    ort_model = ORTModelForSequenceClassification.from_pretrained(
        model,
        export=True,
        output=output_dir
    )
    
    # 保存分词器
    tokenizer.save_pretrained(output_dir)
    
    print(f"转换完成! ONNX模型已保存至: {output_dir}")

if __name__ == "__main__":
    model_path = os.path.abspath("../models/bge-reranker-v2-m3")
    output_dir = model_path
    quantize = False
    convert_safetensors_to_onnx(model_path, output_dir, quantize)