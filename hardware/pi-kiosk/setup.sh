#!/usr/bin/env bash
# OnClock Biometric Kiosk — one-shot installer for Raspberry Pi OS Bookworm.
# Run as the pi user:  bash setup.sh
set -euo pipefail

echo "== OnClock Kiosk installer =="

# 1. System packages
sudo apt-get update
sudo apt-get install -y \
  python3 python3-pip python3-tk \
  libzkfp libzkfp-dev \
  unclutter \
  xserver-xorg xinit \
  fonts-liberation

# 2. Python deps (system-wide so the systemd unit can find them)
sudo pip3 install --break-system-packages requests pyzkfp

# 3. Install the kiosk under /opt
sudo mkdir -p /opt/onclock-kiosk
sudo cp onclock_kiosk.py /opt/onclock-kiosk/onclock_kiosk.py
sudo chown -R pi:pi /opt/onclock-kiosk

# 4. systemd unit
sudo cp onclock-kiosk.service /etc/systemd/system/onclock-kiosk.service
sudo systemctl daemon-reload
sudo systemctl enable onclock-kiosk.service

# 5. Hide the cursor in kiosk mode
mkdir -p /home/pi/.config/lxsession/LXDE-pi
cat > /home/pi/.config/lxsession/LXDE-pi/autostart <<'EOF'
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0 -root
EOF

# 6. udev rule so the pi user can talk to the ZK9500 without root
sudo tee /etc/udev/rules.d/99-zk9500.rules >/dev/null <<'EOF'
SUBSYSTEM=="usb", ATTR{idVendor}=="1b55", MODE="0666", GROUP="plugdev"
EOF
sudo udevadm control --reload-rules

echo
echo "✅ Install complete."
echo "→ Reboot the Pi to start the kiosk:    sudo reboot"
echo "→ View logs:                            journalctl -u onclock-kiosk -f"
echo "→ Reset pairing:                        rm -rf ~/.onclock"
