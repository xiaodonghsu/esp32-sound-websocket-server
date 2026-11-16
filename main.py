import asyncio
import logging
import re
import uuid
import wave
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed


WS_HOST = "0.0.0.0"
WS_PORT = 12345
RECORDER_PATH = "/v1/recorder"
RECORDINGS_ROOT = Path("recordings")

DEFAULT_SEGMENT_MS = 200
SAMPLE_RATE = 16_000
CHANNELS = 1
SAMPLE_WIDTH = 2  # 16 bit PCM
BYTES_PER_SECOND = SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH

# Keep meeting IDs portable across Windows and Linux filesystems.
MEETING_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s.%(msecs)03d %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def parse_recorder_request(path: str) -> tuple[str, int]:
    """Validate a recorder URL and return its meeting ID and segment size."""
    request = urlsplit(path)
    if request.path != RECORDER_PATH:
        raise ValueError(f"path must be {RECORDER_PATH}")

    params = parse_qs(request.query, keep_blank_values=True)
    meeting_ids = params.get("id", [])
    if len(meeting_ids) != 1 or not MEETING_ID_PATTERN.fullmatch(meeting_ids[0]):
        raise ValueError("id must contain 1-128 letters, digits, '_' or '-'")

    segment_values = params.get("segment", [str(DEFAULT_SEGMENT_MS)])
    if len(segment_values) != 1:
        raise ValueError("segment must be specified once")
    try:
        segment_ms = int(segment_values[0])
    except ValueError as exc:
        raise ValueError("segment must be an integer number of milliseconds") from exc
    if not 1 <= segment_ms <= 60_000:
        raise ValueError("segment must be between 1 and 60000 milliseconds")

    return meeting_ids[0], segment_ms


def make_recording_path(meeting_id: str) -> Path:
    meeting_dir = RECORDINGS_ROOT / meeting_id
    meeting_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    return meeting_dir / f"{timestamp}_{uuid.uuid4().hex[:8]}.wav"


async def handle_connection(websocket: ServerConnection) -> None:
    request_path = websocket.request.path if websocket.request else ""
    try:
        meeting_id, segment_ms = parse_recorder_request(request_path)
    except ValueError as exc:
        logger.warning("Rejected %s: %s", websocket.remote_address, exc)
        await websocket.close(code=1008, reason=str(exc))
        return

    output_path = make_recording_path(meeting_id)
    total_bytes = 0
    expected_segment_bytes = BYTES_PER_SECOND * segment_ms // 1_000
    logger.info(
        "Client connected: address=%s meeting=%s segment=%dms file=%s",
        websocket.remote_address,
        meeting_id,
        segment_ms,
        output_path,
    )

    try:
        with wave.open(str(output_path), "wb") as wav_file:
            wav_file.setnchannels(CHANNELS)
            wav_file.setsampwidth(SAMPLE_WIDTH)
            wav_file.setframerate(SAMPLE_RATE)

            async for message in websocket:
                if not isinstance(message, bytes):
                    logger.warning("Ignored text message for meeting %s", meeting_id)
                    continue

                wav_file.writeframesraw(message)
                total_bytes += len(message)
                if len(message) != expected_segment_bytes:
                    logger.debug(
                        "Meeting %s received %d bytes; expected about %d bytes per segment",
                        meeting_id,
                        len(message),
                        expected_segment_bytes,
                    )
    except ConnectionClosed as exc:
        logger.info(
            "Connection closed: meeting=%s code=%s reason=%s",
            meeting_id,
            exc.code,
            exc.reason,
        )
    except Exception:
        logger.exception("Recorder failed for meeting %s", meeting_id)
        raise
    finally:
        duration = total_bytes / BYTES_PER_SECOND
        if total_bytes == 0:
            output_path.unlink(missing_ok=True)
            logger.info("No audio received; removed empty recording for meeting %s", meeting_id)
        else:
            logger.info(
                "Recording saved: meeting=%s bytes=%d duration=%.2fs file=%s",
                meeting_id,
                total_bytes,
                duration,
                output_path,
            )


async def main() -> None:
    logger.info("WebSocket server listening on ws://%s:%d%s", WS_HOST, WS_PORT, RECORDER_PATH)
    async with serve(handle_connection, WS_HOST, WS_PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server stopped")
