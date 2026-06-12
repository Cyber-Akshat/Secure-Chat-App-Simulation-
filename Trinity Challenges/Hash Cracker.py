import hashlib

def crack_hash(target_hash, dictionary_file, hash_type="md5"):
    #Attempts to crack a hash by comparing it against hashed words from a wordlist.
    try:
        with open(dictionary_file, 'r', encoding='utf-8', errors='ignore') as file:
            for line in file:
                # Removes any extra whitespace or newlines
                word = line.strip()

                # Encode the word to bytes and hash it
                if hash_type.lower() ==
