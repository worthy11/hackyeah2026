import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SAMPLES_DIR = ROOT / "samples"
CONTINUOUS_DIR = ROOT / "continuous"
MODELS_DIR = ROOT / "models"
sys.path.insert(0, str(ROOT.parent / "backend"))

GLOSSES = [
    "ja", "ty", "poznać", "miło", "mężczyzna", "kobieta", "klucz", "niski",
    "imię", "nazwisko", "mam", "masz", "brzydki", "cześć", "jak się czujesz",
]

_POLISH_TO_ASCII = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")


def ascii_name(gloss: str) -> str:
    """Folder / on-screen name of a gloss (OpenCV cannot render Polish characters)."""
    return gloss.translate(_POLISH_TO_ASCII)
