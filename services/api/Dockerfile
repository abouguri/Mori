FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# WITH_OPTIMIZER pulls in fsrs-optimizer (torch, pandas, scikit-learn — a
# multi-GB addition) for the §08.4 Tier 2 parameter-tuning job. Only the
# worker image needs it — the job runs in an isolated subprocess
# (app/workers/optimize_subprocess.py), never in the API process — so the
# api service's image build leaves this unset and stays light.
ARG WITH_OPTIMIZER=false

COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]" && \
    if [ "$WITH_OPTIMIZER" = "true" ]; then \
        # fsrs-optimizer depends on plain `torch`, which resolves to a CUDA
        # build (multi-GB, pulls in nvidia-cudnn/cusparselt/nccl) from the
        # default index. Installing the CPU-only build from PyTorch's own
        # index first satisfies that dependency before fsrs-optimizer's
        # install can reach for the CUDA one — this is a CPU-only container.
        pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
        pip install --no-cache-dir -e ".[optimizer]"; \
    fi

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
