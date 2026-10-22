# osionos-ml — the recommender's model (M3c-1)
#
# The model is implicit-feedback ALS on the CPU (`implicit`, MIT). The image
# needs no network at runtime: everything the evaluation does is offline.
FROM python:3.12-slim@sha256:cb33f7f771ecec2ef1225cf39b159591a040391bd73e4c01f00fdfc4c47611d2

# `implicit`'s CPU extension links against OpenMP, which python:3.12-slim does
# not ship. Nothing else is needed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OPENBLAS_NUM_THREADS=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt

COPY osml/ ./osml/

RUN useradd --create-home --uid 10001 osml \
    && mkdir -p /app/results \
    && chown -R osml:osml /app

USER osml

CMD ["python", "-m", "osml.evaluate", "--out", "/app/results/sim"]
