import os
import threading
import time

import requests

try:
    import RPi.GPIO as GPIO
    from mfrc522 import SimpleMFRC522
except ImportError as import_error:
    raise RuntimeError(
        'RFID controller dependencies are missing. Install RPi.GPIO and mfrc522 on the Raspberry Pi.'
    ) from import_error


RELAY_PIN = int(os.environ.get('RELAY_PIN', '18'))
READ_COOLDOWN_SECONDS = float(os.environ.get('READ_COOLDOWN_SECONDS', '2'))
UNLOCK_SECONDS = int(os.environ.get('UNLOCK_SECONDS', '5'))
HEARTBEAT_INTERVAL_SECONDS = float(os.environ.get('HEARTBEAT_INTERVAL_SECONDS', '60'))
ROOM_ID = os.environ['ROOM_ID']
CONTROLLER_ID = os.environ.get('CONTROLLER_ID', f'room-{ROOM_ID}')
FIRMWARE_VERSION = os.environ.get('FIRMWARE_VERSION', '1.0.0')
EDGE_URL = os.environ['SUPABASE_EDGE_URL']
EDGE_KEY = os.environ['SUPABASE_ANON_KEY']
REQUEST_TIMEOUT_SECONDS = float(os.environ.get('REQUEST_TIMEOUT_SECONDS', '5'))


def format_uid(uid: int) -> str:
    return ':'.join(f'{byte:02X}' for byte in uid.to_bytes(4, 'big'))


def unlock(seconds: int = 5) -> None:
    GPIO.output(RELAY_PIN, GPIO.HIGH)
    time.sleep(seconds)
    GPIO.output(RELAY_PIN, GPIO.LOW)


def validate_card(card_uid: str) -> dict[str, object]:
    response = requests.post(
        f'{EDGE_URL}/validate_keycard',
        json={'card_uid': card_uid, 'room_id': ROOM_ID},
        headers={'Authorization': f'Bearer {EDGE_KEY}'},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def report_status(
    heartbeat_status: str,
    *,
    last_card_uid: str | None = None,
    last_error: str | None = None,
    last_note: str | None = None,
    last_result: str | None = None,
) -> None:
    response = requests.post(
        f'{EDGE_URL}/report_controller_status',
        json={
            'controller_id': CONTROLLER_ID,
            'firmware_version': FIRMWARE_VERSION,
            'heartbeat_status': heartbeat_status,
            'last_card_uid': last_card_uid,
            'last_error': last_error,
            'last_note': last_note,
            'last_result': last_result,
            'room_id': ROOM_ID,
        },
        headers={'Authorization': f'Bearer {EDGE_KEY}'},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()


def heartbeat_loop(stop_event: threading.Event) -> None:
    while not stop_event.wait(HEARTBEAT_INTERVAL_SECONDS):
        try:
            report_status('online', last_note='Heartbeat OK.')
        except requests.RequestException as request_error:
            print(f'Heartbeat failed: {request_error}', flush=True)


def main() -> None:
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(RELAY_PIN, GPIO.OUT)
    GPIO.output(RELAY_PIN, GPIO.LOW)
    reader = SimpleMFRC522()

    print(f'Door controller ready for room {ROOM_ID}')
    last_card_uid = ''
    last_read_at = 0.0
    stop_event = threading.Event()
    heartbeat_thread = threading.Thread(target=heartbeat_loop, args=(stop_event,), daemon=True)

    try:
        report_status('online', last_note='Controller boot complete.')
    except requests.RequestException as request_error:
        print(f'Initial heartbeat failed: {request_error}', flush=True)

    heartbeat_thread.start()

    try:
        while True:
            uid, _ = reader.read()
            card_uid = format_uid(uid)
            now = time.monotonic()

            if card_uid == last_card_uid and now - last_read_at < READ_COOLDOWN_SECONDS:
                continue

            last_card_uid = card_uid
            last_read_at = now
            print(f'Card detected: {card_uid}', flush=True)

            try:
                result = validate_card(card_uid)
            except requests.RequestException as request_error:
                print(f'Validation request failed: {request_error}', flush=True)
                try:
                    report_status('degraded', last_card_uid=card_uid, last_error=str(request_error))
                except requests.RequestException:
                    pass
                time.sleep(1)
                continue

            if result.get('granted'):
                print('Access granted', flush=True)
                try:
                    report_status('online', last_card_uid=card_uid, last_note=str(result.get('note', 'Access granted')), last_result='granted')
                except requests.RequestException as request_error:
                    print(f'Status update failed: {request_error}', flush=True)
                unlock(int(result.get('unlock_seconds', UNLOCK_SECONDS)))
            else:
                print(f"Access denied: {result.get('note', 'No reason provided')}", flush=True)
                try:
                    report_status(
                        'online',
                        last_card_uid=card_uid,
                        last_note=str(result.get('note', 'Access denied')),
                        last_result=str(result.get('result', 'denied')),
                    )
                except requests.RequestException as request_error:
                    print(f'Status update failed: {request_error}', flush=True)
    except KeyboardInterrupt:
        print('Shutting down controller.', flush=True)
    finally:
        stop_event.set()
        heartbeat_thread.join(timeout=1)
        GPIO.cleanup()


if __name__ == '__main__':
    main()