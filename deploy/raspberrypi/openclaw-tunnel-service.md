# Raspberry Pi `openclaw-tunnel` systemd User Service

Use this to keep the Pi -> Uberspace reverse SSH tunnel running automatically.

## 1) Prerequisite: key-based SSH from Pi to Uberspace

If SSH from Pi to Uberspace still asks for password, create and install a key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
ssh-copy-id eggman3@lynx.uberspace.de
ssh eggman3@lynx.uberspace.de 'echo ok'
```

The last command should log in without password prompt.

## 2) Install the tunnel service (from this repo)

Run on the Pi inside the project directory:

```bash
cd ~/robinhoodcoin-freeland
UBERSPACE_USER=eggman3 UBERSPACE_HOST=lynx.uberspace.de \
  bash scripts/raspberrypi/install-openclaw-tunnel.sh
```

Optional custom ports:

```bash
UBERSPACE_USER=eggman3 UBERSPACE_HOST=lynx.uberspace.de \
TUNNEL_PORT=18789 LOCAL_PORT=18789 \
bash scripts/raspberrypi/install-openclaw-tunnel.sh
```

This writes:
- `~/.config/systemd/user/openclaw-tunnel.service`

## 3) Service operations

```bash
systemctl --user status openclaw-tunnel --no-pager
systemctl --user restart openclaw-tunnel
systemctl --user stop openclaw-tunnel
systemctl --user disable openclaw-tunnel
```

Logs:

```bash
journalctl --user -u openclaw-tunnel -f -n 200
```

## 4) Verify tunnel from Uberspace

```bash
nc -vz 127.0.0.1 18789
```

Expected: `Connected to 127.0.0.1:18789`.

## 5) Keep user services alive after logout (recommended)

Run once on the Pi:

```bash
sudo loginctl enable-linger pi
```
