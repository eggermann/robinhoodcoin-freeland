# Raspberry Pi OpenClaw Dashboard Kiosk

Opens the live OpenClaw dashboard in a fullscreen terminal on Raspberry Pi desktop login.

## What it does

- waits for `openclaw-gateway.service` to be active
- starts [`scripts/monitor/openclaw-dash.sh`](/Users/eggermann/Desktop/speedProjects/robinhoodcoin-freeland/scripts/monitor/openclaw-dash.sh)
- keeps idle heartbeat visible as a single updating status line instead of printing a new line every few seconds
- launches in `lxterminal` fullscreen; if `wmctrl` is installed, it also tries to keep the window above others

## Install on the Pi

From the repo on the Raspberry Pi:

```bash
cd ~/robinhoodcoin-freeland
bash scripts/raspberrypi/install-openclaw-dashboard-kiosk.sh
```

Then log out and back in to the Raspberry Pi desktop.

## Manual run

If you want to test the exact terminal session first:

```bash
cd ~/robinhoodcoin-freeland
bash scripts/raspberrypi/openclaw-dashboard-session.sh
```

## Remove

```bash
rm ~/.config/autostart/openclaw-dashboard.desktop
rm ~/.local/bin/openclaw-dashboard-kiosk
```
