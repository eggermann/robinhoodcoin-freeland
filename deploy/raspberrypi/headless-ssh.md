# Raspberry Pi Headless SSH Recovery

Use this when the Pi is reachable on LAN but SSH fails with `Connection refused`.

## 1) Confirm SSH is closed

```bash
nc -vz <PI_IP> 22
```

If this returns `refused`, SSH is not listening yet.

## 2) Enable SSH from the SD card boot partition

1. Power off the Pi.
2. Insert SD card into your Mac.
3. Find the boot partition under `/Volumes` (usually `/Volumes/bootfs`).
4. Create the SSH marker file:

```bash
touch /Volumes/bootfs/ssh
```

## 3) Create a headless user (`userconf.txt`)

Recent Raspberry Pi OS images require a local user to be created for headless boot.

### Linux host (supports `openssl passwd -6`)

```bash
USERNAME=pi
HASH=$(openssl passwd -6 'ChangeThisPassword')
echo "${USERNAME}:${HASH}" > /Volumes/bootfs/userconf.txt
```

### macOS host (no `openssl passwd -6`)

```bash
python3 -m pip install --user passlib
python3 - <<'PY'
from passlib.hash import sha512_crypt
user = "pi"
password = "ChangeThisPassword"
print(f"{user}:{sha512_crypt.hash(password)}")
PY
```

Copy the output into:

```bash
cat > /Volumes/bootfs/userconf.txt
```

Paste one line (`username:hash`), then press `Ctrl-D`.

## 4) Boot and verify

```bash
diskutil eject /Volumes/bootfs
```

Boot the Pi and test:

```bash
nc -vz <PI_IP> 22
ssh pi@<PI_IP>
```

After first login, rotate credentials immediately:

```bash
passwd
```
