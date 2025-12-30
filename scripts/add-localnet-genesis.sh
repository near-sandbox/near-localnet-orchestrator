#!/bin/bash
# Add localnet root account to genesis configuration

set -e

PUBLIC_KEY="$1"
AMOUNT="${2:-100000000000000000000000000000}"  # 100,000 NEAR default

if [ -z "$PUBLIC_KEY" ]; then
    echo "Usage: $0 <public_key> [amount]"
    echo "Example: $0 ed25519:9PPYxbuuy6EyEtJteSHc8DUuCUe2N9nJTrhh2rFh7Kwb"
    exit 1
fi

echo "Adding localnet root account to genesis..."
echo "Public Key: $PUBLIC_KEY"
echo "Initial Balance: $AMOUNT yoctoNEAR"

# Backup genesis
sudo cp /home/ubuntu/.near/localnet/node0/genesis.json /home/ubuntu/.near/localnet/node0/genesis.json.backup

# Add localnet account to genesis using jq
sudo jq --arg pubkey "$PUBLIC_KEY" --arg amount "$AMOUNT" '
  .records += [{
    "Account": {
      "account_id": "localnet",
      "account": {
        "amount": $amount,
        "locked": "0",
        "code_hash": "11111111111111111111111111111111",
        "storage_usage": 182,
        "version": "V1"
      }
    }
  }] |
  .records += [{
    "AccessKey": {
      "account_id": "localnet",
      "public_key": $pubkey,
      "access_key": {
        "nonce": 0,
        "permission": "FullAccess"
      }
    }
  }]
' /home/ubuntu/.near/localnet/node0/genesis.json > /tmp/genesis_new.json

# Replace genesis for all nodes
for node in node0 node1 node2 node3; do
    sudo cp /tmp/genesis_new.json /home/ubuntu/.near/localnet/$node/genesis.json
    echo "✅ Updated genesis for $node"
done

echo ""
echo "✅ Genesis updated with localnet root account"
echo ""
echo "Next steps:"
echo "1. Restart nearup: sudo systemctl restart nearup"
echo "2. Wait for chain to restart (~30 seconds)"
echo "3. Verify: curl http://localhost:3030/status"

