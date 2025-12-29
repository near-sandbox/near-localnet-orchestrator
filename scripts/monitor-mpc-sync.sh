#!/bin/bash
# MPC Node Sync Monitor
# Usage: ./scripts/monitor-mpc-sync.sh
# 
# Monitors the sync progress of all 3 MPC nodes

PROFILE="shai-sandbox-profile"
REGION="us-east-1"

NODE_0="i-0f765de002761e3be"
NODE_1="i-0bfee76f879a54a93"
NODE_2="i-06f52551814a61615"

echo "================================================================"
echo "MPC Sync Monitor - $(date)"
echo "================================================================"
echo ""

check_node() {
    local node_id=$1
    local node_num=$2
    
    echo "=== Node $node_num ($node_id) ==="
    
    # Send command to get stats or sync headers (search larger window)
    cmd_id=$(aws ssm send-command \
        --instance-ids "$node_id" \
        --document-name "AWS-RunShellScript" \
        --parameters 'commands=["(docker logs mpc-node-fix 2>&1 | grep \"stats\" | tail -1) || (docker logs mpc-node-fix 2>&1 | grep \"Sync block headers\" | tail -1) || (docker logs mpc-node 2>&1 | grep \"stats\" | tail -1)"]' \
        --output text \
        --query 'Command.CommandId' \
        --profile "$PROFILE" \
        --region "$REGION" 2>/dev/null)
    
    if [ -z "$cmd_id" ]; then
        echo "  ❌ Failed to send command"
        return
    fi
    
    # Wait for result
    sleep 3
    
    # Get output
    output=$(aws ssm get-command-invocation \
        --command-id "$cmd_id" \
        --instance-id "$node_id" \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query 'StandardOutputContent' \
        --output text 2>/dev/null)
    
    if [ -z "$output" ]; then
        echo "  ⏳ Waiting for response..."
    else
        # Extract key info from stats line
        if echo "$output" | grep -q "Downloading blocks"; then
            blocks_left=$(echo "$output" | sed -n 's/.*(\([0-9]*\) left.*/\1/p')
            peer_count=$(echo "$output" | sed -n 's/.*[^0-9]\([0-9]\) peer.*/\1/p')
            download_speed=$(echo "$output" | sed -n 's/.*⬇ \([0-9.]* [kM]B\/s\).*/\1/p')
            
            echo "  📥 Syncing: $blocks_left blocks remaining"
            echo "  👥 Peers: $peer_count"
            echo "  ⚡ Speed: $download_speed"
        elif echo "$output" | grep -q "Sync block headers"; then
            last_height=$(echo "$output" | sed -n 's/.*last_height=\([0-9]*\).*/\1/p')
            echo "  📥 Syncing Headers: Height $last_height"
        elif echo "$output" | grep -q "#"; then
            # Already synced, check current block
            block_num=$(echo "$output" | sed -n 's/.*#[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
            peer_count=$(echo "$output" | sed -n 's/.*[^0-9]\([0-9]\) peers.*/\1/p')
            
            echo "  ✅ Synced: Block #$block_num"
            echo "  👥 Peers: $peer_count"
        else
            echo "  ⚠️  Unknown status"
            echo "  Output: $output"
        fi
    fi
    echo ""
}

# Check all nodes
check_node "$NODE_0" "0"
check_node "$NODE_1" "1"
check_node "$NODE_2" "2"

echo "================================================================"
echo "Tip: Run this script again in a few minutes to see progress"
echo "================================================================"

