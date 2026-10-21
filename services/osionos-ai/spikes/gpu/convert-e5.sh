#!/bin/sh
# The conversion of the embedder (AI-P0d, Part B).
#
# The two GGUFs of the community are NOT the model of the deployment:
# rodion-m/multilingual-e5-small-gguf (fp32) and
# keisuke-miyako/multilingual-e5-small-gguf-f16 (f16) tokenize
# "query: hello world" into 4 tokens, where TEI (the ONNX pipeline of the
# deployment) makes 8, and their vectors agree with the ones of TEI at a
# cosine of 0.85. The reason is the tokenizer: those conversions were made
# from the sentencepiece BPE model of the repository, while TEI uses the
# Unigram tokenizer (tokenizer.json).
#
# So the model is converted here, with the converter of llama.cpp itself
# (b11580), from the original files of intfloat/multilingual-e5-small, the
# same revision the TEI of the deployment uses
# (614241f622f53c4eeff9890bdc4f31cfecc418b3). The result agrees with TEI at
# a cosine of 0.9998.
#
# Three things are needed, and the two scripts of this directory do them:
#   - the config of the model must point at the XLM-Roberta class of the
#     converter (patch-e5-model.mjs);
#   - the normalizer of tokenizer.json must be the Precompiled one alone
#     (patch-e5-model.mjs);
#   - the scores of the vocabulary must be floats (patch-llama-converter.mjs).
#
# usage: sh convert-e5.sh [f16|f32]
set -eu
SPIKE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TYPE="${1:-f16}"
IMAGE=ghcr.io/ggml-org/llama.cpp:full-b11580
MODEL_VOLUME=osionos_ai_models_e5_hf
CONV_VOLUME=osionos_ai_models_e5_conv
TOOLS_VOLUME=osionos_ai_llama_cpp_tools
OUT_VOLUME=osionos_ai_models_tei_gguf
OUT_NAME="multilingual-e5-small-official-$TYPE.gguf"

echo "[convert] 1. the files of the model, and the patches"
docker run --rm --network none \
	-v "$MODEL_VOLUME:/model:ro" -v "$CONV_VOLUME:/conv" \
	node:22-bookworm-slim node /s/patch-e5-model.mjs /model /conv 2>/dev/null || {
		docker run --rm --network none \
		-v "$MODEL_VOLUME:/model:ro" -v "$CONV_VOLUME:/conv" -v "$SPIKE_DIR:/s:ro" \
		node:22-bookworm-slim node /s/patch-e5-model.mjs /model /conv
	}

echo "[convert] 2. the converter of llama.cpp, patched"
docker run --rm --network none --entrypoint sh \
	-v "$TOOLS_VOLUME:/tools" "$IMAGE" -c 'cp -r /app/conversion /app/gguf-py /app/convert_hf_to_gguf.py /tools/'
docker run --rm --network none \
	-v "$TOOLS_VOLUME:/tools" -v "$SPIKE_DIR:/s:ro" \
	node:22-bookworm-slim node /s/patch-llama-converter.mjs /tools

echo "[convert] 3. the conversion itself"
docker run --rm --network none --entrypoint python3 \
	-e OMP_NUM_THREADS=4 -e PYTHONPATH=/tools/gguf-py \
	-v "$TOOLS_VOLUME:/tools" \
	-v "$CONV_VOLUME:/model:ro" \
	-v "$OUT_VOLUME:/out" \
	"$IMAGE" \
	/tools/convert_hf_to_gguf.py /model \
	--outfile "/out/$OUT_NAME" \
	--outtype "$TYPE" 2>&1 | tail -12

echo "[convert] 4. the result"
docker run --rm --network none -v "$OUT_VOLUME:/out" alpine:3.20 \
	sh -c "ls -la /out/$OUT_NAME; sha256sum /out/$OUT_NAME"
