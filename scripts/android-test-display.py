"""Keep software rendering affordable on the CI runner; app layout has separate UI tests."""
import os
from pathlib import Path

config = Path(os.environ["ANDROID_AVD_HOME"]) / "test.avd" / "config.ini"
values = {"hw.lcd.width": "480", "hw.lcd.height": "800", "hw.lcd.density": "160"}
lines = [line for line in config.read_text().splitlines() if line.split("=", 1)[0].strip() not in values]
config.write_text("\n".join(lines + [f"{key}={value}" for key, value in values.items()]) + "\n")
