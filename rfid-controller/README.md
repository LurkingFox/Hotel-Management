# RFID Controller Simulation

This folder now contains two controller runners:

- `main.py`: real Raspberry Pi runner using `RPi.GPIO` and `mfrc522`
- `mock_controller.py`: laptop-safe simulator for testing without a Pi, RC522 reader, relay, or door hardware
- `hotel-door-controller.service`: `systemd` unit for boot-time startup on the Raspberry Pi

## What can be simulated

- controller boot heartbeat
- periodic online heartbeats
- degraded heartbeat on request failure
- card tap requests against the live `validate_keycard` edge function
- granted and denied results
- dashboard controller status updates
- access log writes in Supabase

## What is not simulated

- RC522 physical read quality
- GPIO relay switching
- electrical lock power behavior
- actual door strike timing and latch mechanics

## Setup

1. Create a Python environment if needed.
2. Install the only dependency required for the simulator:

```bash
pip install requests
```

3. Copy `.env.example` values into your shell environment.

Required variables:

- `ROOM_ID`
- `SUPABASE_EDGE_URL`
- `SUPABASE_ANON_KEY`

Optional variables:

- `CONTROLLER_ID`
- `FIRMWARE_VERSION`
- `RELAY_PIN`
- `READ_COOLDOWN_SECONDS`
- `UNLOCK_SECONDS`
- `HEARTBEAT_INTERVAL_SECONDS`
- `REQUEST_TIMEOUT_SECONDS`

## Run the simulator

```bash
python mock_controller.py
```

To disable periodic heartbeats:

```bash
python mock_controller.py --no-heartbeat
```

## Commands

- `tap A3:F2:91:BC`
- `heartbeat`
- `degrade wifi timeout`
- `status`
- `help`
- `quit`

## Recommended test flow before hardware

1. Start the web app.
2. Issue a master key or room card from the app.
3. Run `python mock_controller.py`.
4. Send `heartbeat` and confirm the admin dashboard shows the controller.
5. Send `tap <CARD_UID>` and confirm:
   - access decision is returned
   - `access_log` updates
   - controller status updates on the dashboard
6. Revoke the card in the app and repeat the tap.

This validates the full business and controller integration path before wiring a real Pi and door lock.

## Deploy on Raspberry Pi

1. Install OS dependencies:

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip python3-dev build-essential libspi-dev
```

2. Enable SPI on the Pi:

```bash
sudo raspi-config
```

Enable `Interface Options -> SPI`, then reboot.

3. Copy this folder to the Pi, for example into `/opt/university-hotel/rfid-controller`.

4. Create a virtual environment and install the controller dependencies:

```bash
cd /opt/university-hotel/rfid-controller
python3 -m venv .venv
. .venv/bin/activate
pip install requests RPi.GPIO mfrc522
```

5. Create the runtime environment file expected by the service:

```bash
sudo mkdir -p /etc/university-hotel
sudo nano /etc/university-hotel/door-controller.env
```

Example contents:

```dotenv
ROOM_ID=00000000-0000-0000-0000-000000000000
CONTROLLER_ID=room-101
FIRMWARE_VERSION=pi-zero-1.0.0
RELAY_PIN=18
SUPABASE_EDGE_URL=https://your-project-ref.supabase.co/functions/v1
SUPABASE_ANON_KEY=your-anon-key
READ_COOLDOWN_SECONDS=2
UNLOCK_SECONDS=5
HEARTBEAT_INTERVAL_SECONDS=60
REQUEST_TIMEOUT_SECONDS=5
```

6. Install the service:

```bash
sudo cp hotel-door-controller.service /etc/systemd/system/hotel-door-controller.service
sudo systemctl daemon-reload
sudo systemctl enable --now hotel-door-controller.service
```

7. Inspect logs:

```bash
sudo journalctl -u hotel-door-controller.service -f
```

## Wiring assumptions in this code

- RC522 reader is connected through SPI.
- Relay control is on BCM GPIO `18` by default, overridable with `RELAY_PIN`.
- Relay is active-high in `main.py`.
- Lock power delivery, flyback protection, and strike hardware sizing still need to match the final lock hardware selection.

## Operational note

`main.py` now sends heartbeats from a background thread so the controller still appears online while idle between card taps. That matters for stale-controller detection and dashboard accuracy.