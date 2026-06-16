import bcrypt
from typing import Tuple
from datetime import datetime
import json
import os

print("""
1. Message your mates/friends
2. Access my messages
""")
userinput = int(input("Enter your choice: "))
if userinput == 1:

    def hash_pwd(message: str, rounds=12) -> bytes:
        pwd = bcrypt.hashpw(message.encode("utf-8"), bcrypt.gensalt(rounds=rounds))
        return pwd

    def check_pwd(message: str, hash: bytes) -> bool:
        return bcrypt.checkpw(message.encode(), hash)

    class UserAuth:
        def __init__(self, storage_path='password.json'):
            self.storage_path = storage_path
            self.hash = {}
            self.login_attempts = {}
            self.max_attempts = 3
            self.lockout_minutes = 15
            self._load_users()

        def _load_users(self):
            if os.path.exists(self.storage_path):
                try:
                    with open(self.storage_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            for entry in data:
                                username = entry.get('username')
                                if not username:
                                    continue
                                msg_hash_str = entry.get('msg_hash')
                                msg_rounds = entry.get('msg_rounds', 12)
                                created_at = entry.get('created_at')
                                if msg_hash_str is None:
                                    continue
                                self.hash[username] = {
                                    'msg_hash': msg_hash_str.encode('utf-8'),
                                    'created_at': created_at,
                                    'msg_rounds': msg_rounds
                                }
                except (json.JSONDecodeError, IOError):
                    # Invalid file — start with empty store
                    self.hash = {}

        def _save_user_to_file(self, username: str):
            entry = self.hash.get(username)
            if entry is None:
                return
            record = {
                'username': username,
                'msg_hash': entry['msg_hash'].decode('utf-8'),
                'created_at': entry.get('created_at') if isinstance(entry.get('created_at'), str) else datetime.now().isoformat(),
                'msg_rounds': entry.get('msg_rounds', 12)
            }
            data = []
            if os.path.exists(self.storage_path):
                try:
                    with open(self.storage_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if not isinstance(data, list):
                            data = []
                except (json.JSONDecodeError, IOError):
                    data = []
            # remove existing entry for username
            data = [e for e in data if e.get('username') != username]
            data.append(record)
            with open(self.storage_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)

        def add_user(self, username: str, message: str) -> bool:

            msg_hash = hash_pwd(message)
            self.hash[username] = {
                'msg_hash' : msg_hash,
                'created_at' : datetime.now().isoformat(),
                'msg_rounds' : 12
            }
            try:
                self._save_user_to_file(username)
            except Exception as e:
                # rollback in-memory
                del self.hash[username]
                print(f"[!] Failed to save user to file: {e}")
                return False
            return True

        def login(self, username: str, message: str) -> Tuple[bool, str]:
            if self._is_locked(username):
                return False, 'Too many attempts, account locked'

            if username not in self.hash:
                return False, 'Invalid user information...'

            user = self.hash[username]
            if not check_pwd(message, user['msg_hash']):
                self._track_attempts(username)
                return False, "Invalid user information..."

            if username in self.login_attempts:
                del self.login_attempts[username]

            self._upgrade_hash(username, message)

            return True, "Successfully logged in"

        def _is_locked(self, username: str) -> bool:
            if username not in self.login_attempts:
                return False

            # {attempt: last_attempt}
            attempts, last_attempts = self.login_attempts[username]
            if attempts > self.max_attempts:
                mins_passed = (datetime.now() - last_attempts).total_seconds() / 60
                if mins_passed < self.lockout_minutes:
                    return True
                del self.login_attempts[username]
            return False

        def _track_attempts(self, username: str):
            now = datetime.now()
            if username in self.login_attempts:
                attempts, _ = self.login_attempts[username]
                self.login_attempts[username] = (attempts + 1, now)
            else:
                self.login_attempts[username] = (1, now)

        def _upgrade_hash(self, username: str, message: str):
            user = self.hash[username]
            min_rounds = 14
            if user['msg_rounds'] < min_rounds:
                user['msg_hash'] = hash_pwd(message, min_rounds)
                user['msg_rounds'] = min_rounds

    if __name__ == '__main__':
        auth = UserAuth()

        user = input('Enter username: ')
        message = input('Enter message to end: ')

        if auth.add_user(user, message):
            print('Account Created!')

        success, msg = auth.login(user, message)
        print("Good Login:", msg)

        for attempt in range(3):
            success, msg = auth.login(user, message)
            print(f"Bad Login: {attempt+1}: {msg}")
