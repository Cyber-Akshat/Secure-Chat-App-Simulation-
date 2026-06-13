import bcrypt
from typing import Tuple
from datetime import datetime
import json
import os

def hash_pwd(password: str, rounds=12) -> bytes:
    pwd = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=rounds))
    return pwd

def check_pwd(password: str, hash: bytes) -> bool:
    return bcrypt.checkpw(password.encode(), hash)

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
                            pwd_hash_str = entry.get('pwd_hash')
                            pwd_rounds = entry.get('pwd_rounds', 12)
                            created_at = entry.get('created_at')
                            if pwd_hash_str is None:
                                continue
                            self.hash[username] = {
                                'pwd_hash': pwd_hash_str.encode('utf-8'),
                                'created_at': created_at,
                                'pwd_rounds': pwd_rounds
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
            'pwd_hash': entry['pwd_hash'].decode('utf-8'),
            'created_at': entry.get('created_at') if isinstance(entry.get('created_at'), str) else datetime.now().isoformat(),
            'pwd_rounds': entry.get('pwd_rounds', 12)
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

    def add_user(self, username: str, password: str) -> bool:
        if username in self.hash:
            return False

        pwd_hash = hash_pwd(password)
        self.hash[username] = {
            'pwd_hash' : pwd_hash,
            'created_at' : datetime.now().isoformat(),
            'pwd_rounds' : 12
        }
        try:
            self._save_user_to_file(username)
        except Exception as e:
            # rollback in-memory
            del self.hash[username]
            print(f"[!] Failed to save user to file: {e}")
            return False
        return True

    def login(self, username: str, password: str) -> Tuple[bool, str]:
        if self._is_locked(username):
            return False, 'Too many attempts, account locked'

        if username not in self.hash:
            return False, 'Invalid user information...'

        user = self.hash[username]
        if not check_pwd(password, user['pwd_hash']):
            self._track_attempts(username)
            return False, "Invalid user information..."

        if username in self.login_attempts:
            del self.login_attempts[username]

        self._upgrade_hash(username, password)

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

    def _upgrade_hash(self, username: str, password: str):
        user = self.hash[username]
        min_rounds = 14
        if user['pwd_rounds'] < min_rounds:
            user['pwd_hash'] = hash_pwd(password, min_rounds)
            user['pwd_rounds'] = min_rounds

if __name__ == '__main__':
    auth = UserAuth()

    user = input('Enter username: ')
    password = input('Enter password: ')

    if auth.add_user(user, password):
        print('Acount Created!')

    success, msg = auth.login(user, password)
    print("Good Login:", msg)

    for attempt in range(3):
        success, msg = auth.login(user, password)
        print(f"Bad Login: {attempt+1}: {msg}")
