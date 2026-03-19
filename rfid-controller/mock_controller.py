import argparse
import os
import sys
import threading
import time

import requests


READ_COOLDOWN_SECONDS = float(os.environ.get('READ_COOLDOWN_SECONDS', '2'))
UNLOCK_SECONDS = int(os.environ.get('UNLOCK_SECONDS', '5'))
HEARTBEAT_INTERVAL_SECONDS = float(os.environ.get('HEARTBEAT_INTERVAL_SECONDS', '60'))
ROOM_ID = os.environ['ROOM_ID']
CONTROLLER_ID = os.environ.get('CONTROLLER_ID', f'room-{ROOM_ID}')
FIRMWARE_VERSION = os.environ.get('FIRMWARE_VERSION', 'mock-1.0.0')
EDGE_URL = os.environ['SUPABASE_EDGE_URL']
EDGE_KEY = os.environ['SUPABASE_ANON_KEY']


def normalize_card_uid(value: str) -> str:
    parts = [segment.strip().upper() for segment in value.split(':') if segment.strip()]
    if len(parts) != 4 or any(len(part) != 2 for part in parts):
        raise ValueError('Card UID must look like A3:F2:91:BC')
    return ':'.join(parts)


def call_validate_keycard(card_uid: str) -> dict[str, object]:
    response = requests.post(
        f'{EDGE_URL}/validate_keycard',
        json={'card_uid': card_uid, 'room_id': ROOM_ID},
        headers={
            'Authorization': f'Bearer {EDGE_KEY}',
            'apikey': EDGE_KEY,
        },
        timeout=5,
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
) -> dict[str, object]:
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
        headers={
            'Authorization': f'Bearer {EDGE_KEY}',
            'apikey': EDGE_KEY,
        },
        timeout=5,
    )
    response.raise_for_status()
    return response.json()


def heartbeat_loop(stop_event: threading.Event) -> None:
    while not stop_event.wait(HEARTBEAT_INTERVAL_SECONDS):
        try:
            report_status('online', last_note='Mock heartbeat OK.')
            print('[heartbeat] online')
        except requests.RequestException as request_error:
            print(f'[heartbeat] failed: {request_error}')


def print_help() -> None:
    print('Commands:')
    print('  tap <CARD_UID>     Validate a card against the live edge function')
    print('  heartbeat          Send an immediate online heartbeat')
    print('  degrade <MESSAGE>  Send a degraded status with an error message')
    print('  status             Show current controller config')
    print('  quit               Exit the simulator')


def main() -> int:
    parser = argparse.ArgumentParser(description='Mock University Hotel RFID door controller')
    parser.add_argument('--no-heartbeat', action='store_true', help='disable periodic heartbeats')
    args = parser.parse_args()

    print(f'Mock controller ready for room {ROOM_ID}')
    print(f'Controller id: {CONTROLLER_ID}')
    print(f'Firmware version: {FIRMWARE_VERSION}')

    try:
        report_status('online', last_note='Mock controller boot complete.')
        print('[boot] heartbeat sent')
    except requests.RequestException as request_error:
        print(f'[boot] heartbeat failed: {request_error}')

    stop_event = threading.Event()
    heartbeat_thread: threading.Thread | None = None

    if not args.no_heartbeat:
        heartbeat_thread = threading.Thread(target=heartbeat_loop, args=(stop_event,), daemon=True)
        heartbeat_thread.start()

    last_card_uid = ''
    last_read_at = 0.0
    print_help()

    try:
        while True:
            try:
                raw_command = input('mock-controller> ').strip()
            except EOFError:
                break

            if not raw_command:
                continue

            if raw_command == 'quit':
                break

            if raw_command == 'help':
                print_help()
                continue

            if raw_command == 'heartbeat':
                try:
                    payload = report_status('online', last_note='Manual mock heartbeat.')
                    print(payload)
                except requests.RequestException as request_error:
                    print(f'Heartbeat failed: {request_error}')
                continue

            if raw_command == 'status':
                print(
                    {
                        'controller_id': CONTROLLER_ID,
                        'firmware_version': FIRMWARE_VERSION,
                        'heartbeat_interval_seconds': HEARTBEAT_INTERVAL_SECONDS,
                        'read_cooldown_seconds': READ_COOLDOWN_SECONDS,
                        'room_id': ROOM_ID,
                        'unlock_seconds': UNLOCK_SECONDS,
                    }
                )
                continue

            if raw_command.startswith('degrade '):
                message = raw_command[len('degrade ') :].strip()
                if not message:
                    print('Provide a message: degrade wifi timeout')
                    continue
                try:
                    payload = report_status('degraded', last_error=message, last_note='Mock degraded state reported.')
                    print(payload)
                except requests.RequestException as request_error:
                    print(f'Degraded status failed: {request_error}')
                continue

            if raw_command.startswith('tap '):
                raw_uid = raw_command[len('tap ') :].strip()
                try:
                    card_uid = normalize_card_uid(raw_uid)
                except ValueError as value_error:
                    print(value_error)
                    continue

                now = time.monotonic()
                if card_uid == last_card_uid and now - last_read_at < READ_COOLDOWN_SECONDS:
                    print('Ignored duplicate tap within cooldown window.')
                    continue

                last_card_uid = card_uid
                last_read_at = now

                try:
                    result = call_validate_keycard(card_uid)
                    report_status(
                        'online',
                        last_card_uid=card_uid,
                        last_note=str(result.get('note', 'Mock tap processed.')),
                        last_result=str(result.get('result', 'denied')),
                    )
                except requests.RequestException as request_error:
                    print(f'Validation failed: {request_error}')
                    try:
                        report_status('degraded', last_card_uid=card_uid, last_error=str(request_error), last_note='Mock validation failed.')
                    except requests.RequestException:
                        pass
                    continue

                print(result)
                if result.get('granted'):
                    print(f"Simulated unlock for {int(result.get('unlock_seconds', UNLOCK_SECONDS))} seconds")
                continue

            print('Unknown command. Type help for options.')
    finally:
        stop_event.set()
        if heartbeat_thread:
            heartbeat_thread.join(timeout=1)

    return 0


if __name__ == '__main__':
    sys.exit(main())