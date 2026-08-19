"""Fine-tune Whisper on the local F1 team-radio Parquet shards.

The dataset stores audio as embedded MP3 bytes. This script decodes and
resamples each example lazily, so the full corpus does not need to be copied
into memory or converted before training.

Examples:
    # CPU/GPU smoke test (writes a small, usable local checkpoint)
    python train_model.py --max-samples 8 --max-steps 1

    # Full training run (recommended on a CUDA machine)
    python train_model.py --output-dir models/f1-whisper --num-train-epochs 3
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
from typing import Iterator

import numpy as np
import soundfile as sf
import torch
import pyarrow.parquet as pq
from datasets import Audio, load_dataset
from torch.utils.data import IterableDataset
from transformers import (
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    WhisperForConditionalGeneration,
    WhisperProcessor,
)


TARGET_SAMPLE_RATE = 16_000
DEFAULT_MODEL = "openai/whisper-tiny"
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "model"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "models" / "f1-whisper"


def resample(audio: np.ndarray, source_rate: int) -> np.ndarray:
    """Resample with linear interpolation without adding another dependency."""
    audio = np.asarray(audio, dtype=np.float32)
    if source_rate == TARGET_SAMPLE_RATE or len(audio) == 0:
        return audio
    target_length = max(1, round(len(audio) * TARGET_SAMPLE_RATE / source_rate))
    return np.interp(
        np.linspace(0, len(audio) - 1, target_length),
        np.arange(len(audio)),
        audio,
    ).astype(np.float32)


def decode_audio(audio: dict) -> np.ndarray:
    """Decode an embedded audio field returned by datasets with decode=False."""
    raw = audio.get("bytes")
    if raw is None and audio.get("path"):
        raw = Path(audio["path"]).read_bytes()
    if not raw:
        raise ValueError("Dataset row has no audio bytes or path")
    waveform, sample_rate = sf.read(io.BytesIO(raw), dtype="float32")
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)
    return resample(waveform, sample_rate)


def load_stream(data_dir: Path):
    files = sorted(data_dir.glob("train-*.parquet"))
    if not files:
        raise FileNotFoundError(f"No train-*.parquet files found in {data_dir}")
    dataset = load_dataset(
        "parquet",
        data_files={"train": [str(path) for path in files]},
        split="train",
        streaming=True,
    )
    return dataset.cast_column("audio", Audio(decode=False))


def estimate_training_steps(
    data_dir: Path,
    eval_percent: int,
    batch_size: int,
    gradient_accumulation_steps: int,
    epochs: float,
) -> int:
    """Estimate steps for an IterableDataset, whose length is intentionally unknown."""
    total_rows = sum((pq.ParquetFile(path).metadata.num_rows for path in data_dir.glob("train-*.parquet")), 0)
    train_rows = max(1, int(total_rows * (100 - eval_percent) / 100))
    batches_per_epoch = max(1, (train_rows + batch_size - 1) // batch_size)
    updates_per_epoch = max(1, (batches_per_epoch + gradient_accumulation_steps - 1) // gradient_accumulation_steps)
    return max(1, int(np.ceil(updates_per_epoch * epochs)))


def is_eval_example(example_id: str, eval_percent: int) -> bool:
    digest = hashlib.sha1(example_id.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100 < eval_percent


class WhisperRadioDataset(IterableDataset):
    def __init__(
        self,
        source,
        processor: WhisperProcessor,
        split: str,
        eval_percent: int,
        max_samples: int | None,
        language: str,
    ) -> None:
        self.source = source
        self.processor = processor
        self.split = split
        self.eval_percent = eval_percent
        self.max_samples = max_samples
        self.language = language

    def __iter__(self) -> Iterator[dict]:
        yielded = 0
        for row in self.source:
            if is_eval_example(row["id"], self.eval_percent) != (self.split == "eval"):
                continue
            text = (row.get("transcription") or "").strip()
            if not text:
                continue
            try:
                waveform = decode_audio(row["audio"])
                input_features = self.processor.feature_extractor(
                    waveform,
                    sampling_rate=TARGET_SAMPLE_RATE,
                    return_tensors="pt",
                ).input_features[0]
                labels = self.processor.tokenizer(
                    text,
                    add_special_tokens=True,
                    truncation=True,
                    max_length=448,
                ).input_ids
            except Exception as exc:
                print(f"Skipping {row.get('id', '<unknown>')}: {exc}")
                continue
            yield {"input_features": input_features, "labels": labels}
            yielded += 1
            if self.max_samples is not None and yielded >= self.max_samples:
                return


class DataCollatorSpeechSeq2Seq:
    def __init__(self, processor: WhisperProcessor) -> None:
        self.processor = processor

    def __call__(self, features: list[dict]) -> dict[str, torch.Tensor]:
        input_features = [{"input_features": item["input_features"]} for item in features]
        batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")
        label_features = [{"input_ids": item["labels"]} for item in features]
        labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")
        labels = labels_batch.input_ids.masked_fill(labels_batch.attention_mask.ne(1), -100)
        if labels.shape[1] > 0 and (labels[:, 0] == self.processor.tokenizer.bos_token_id).all():
            labels = labels[:, 1:]
        batch["labels"] = labels
        return batch


def build_prompt(source, output_dir: Path) -> None:
    """Create a compact domain prompt from driver and race names in the corpus."""
    drivers: set[str] = set()
    grands_prix: set[str] = set()
    for row in source:
        if row.get("driver_id"):
            drivers.add(row["driver_id"])
        if row.get("grand_prix"):
            grands_prix.add(row["grand_prix"].replace(" Grand Prix", ""))
        if len(drivers) >= 64 and len(grands_prix) >= 64:
            break
    # Keep the prompt comfortably below Whisper's decoder context window.
    prompt = "Formula 1 team radio. Drivers: " + ", ".join(sorted(drivers)[:16])
    prompt += ". Races: " + ", ".join(sorted(grands_prix)[:16]) + "."
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "f1_radio_prompt.json").write_text(
        json.dumps({"prompt": prompt}, indent=2), encoding="utf-8"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--model-name", default=DEFAULT_MODEL)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--language", default="en")
    parser.add_argument("--eval-percent", type=int, default=5)
    parser.add_argument("--max-samples", type=int, default=None)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--num-train-epochs", type=float, default=3.0)
    parser.add_argument("--per-device-train-batch-size", type=int, default=2)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not 0 < args.eval_percent < 100:
        raise ValueError("--eval-percent must be between 1 and 99")

    source = load_stream(args.data_dir)
    processor = WhisperProcessor.from_pretrained(args.model_name)
    processor.tokenizer.set_prefix_tokens(language=args.language, task="transcribe")
    model = WhisperForConditionalGeneration.from_pretrained(args.model_name)
    model.generation_config.language = args.language
    model.generation_config.task = "transcribe"
    model.generation_config.forced_decoder_ids = None
    model.config.use_cache = False

    build_prompt(source, args.output_dir)
    train_dataset = WhisperRadioDataset(
        source, processor, "train", args.eval_percent, args.max_samples, args.language
    )
    eval_dataset = WhisperRadioDataset(
        source, processor, "eval", args.eval_percent, args.max_samples, args.language
    )
    use_cpu = not torch.cuda.is_available()
    max_steps = args.max_steps
    if max_steps < 0:
        max_steps = estimate_training_steps(
            args.data_dir,
            args.eval_percent,
            args.per_device_train_batch_size,
            args.gradient_accumulation_steps,
            args.num_train_epochs,
        )
        print(f"Streaming dataset detected; using {max_steps} optimizer steps")
    training_args = Seq2SeqTrainingArguments(
        output_dir=str(args.output_dir),
        per_device_train_batch_size=args.per_device_train_batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        learning_rate=args.learning_rate,
        num_train_epochs=args.num_train_epochs,
        max_steps=max_steps,
        warmup_steps=50,
        logging_steps=10,
        save_strategy="steps",
        save_steps=250,
        save_total_limit=2,
        eval_strategy="no",
        predict_with_generate=False,
        report_to="none",
        remove_unused_columns=False,
        dataloader_num_workers=0,
        use_cpu=use_cpu,
        fp16=torch.cuda.is_available(),
    )
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=DataCollatorSpeechSeq2Seq(processor),
        processing_class=processor,
    )
    trainer.train()
    trainer.save_model(str(args.output_dir))
    processor.save_pretrained(str(args.output_dir))
    print(f"Saved F1 radio Whisper model to {args.output_dir}")


if __name__ == "__main__":
    main()
