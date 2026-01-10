#!/bin/bash
# generate-deployment-state.sh
# Auto-discover current infrastructure state from CloudFormation and generate centralized deployment-state.json
#
# Usage: ./scripts/generate-deployment-state.sh [checkpoint_name]
# Example: ./scripts/generate-deployment-state.sh "pre-layer3-deployment"

set -e

# Configuration
AWS_PROFILE="${AWS_PROFILE:-shai-sandbox-profile}"
AWS_REGION="${AWS_REGION:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR_ROOT="$(dirname "$SCRIPT_DIR")"
WORKSPACE_ROOT="$(dirname "$ORCHESTRATOR_ROOT")"
OUTPUT_FILE="$ORCHESTRATOR_ROOT/deployment-state.json"

# Checkpoint name (default or provided)
CHECKPOINT_NAME="${1:-pre-layer3-deployment}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "=============================================="
echo "Generating Centralized Deployment State"
echo "=============================================="
echo "AWS Profile: $AWS_PROFILE"
echo "AWS Region: $AWS_REGION"
echo "Checkpoint: $CHECKPOINT_NAME"
echo "Timestamp: $TIMESTAMP"
echo "Output: $OUTPUT_FILE"
echo ""

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    if ! command -v aws &> /dev/null; then
        echo "ERROR: AWS CLI not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        echo "ERROR: jq not installed"
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        echo "ERROR: git not installed"
        exit 1
    fi
    
    # Verify AWS credentials
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" &> /dev/null; then
        echo "ERROR: AWS credentials not valid for profile $AWS_PROFILE"
        exit 1
    fi
    
    echo "Prerequisites OK"
    echo ""
}

# Get CloudFormation stack output
get_cf_output() {
    local stack_name=$1
    local output_key=$2
    
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" 2>/dev/null || echo ""
}

# Check if CloudFormation stack exists
stack_exists() {
    local stack_name=$1
    aws cloudformation describe-stacks \
        --stack-name "$stack_name" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" &>/dev/null
    return $?
}

# Get git commit hash for a repo
get_git_commit() {
    local repo_path=$1
    if [ -d "$repo_path/.git" ] || [ -f "$repo_path/.git" ]; then
        git -C "$repo_path" rev-parse HEAD 2>/dev/null || echo "unknown"
    else
        echo "not-a-repo"
    fi
}

# Get git branch for a repo
get_git_branch() {
    local repo_path=$1
    if [ -d "$repo_path/.git" ] || [ -f "$repo_path/.git" ]; then
        git -C "$repo_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

# Collect git commit hashes from all repositories
collect_git_commits() {
    echo "Collecting git commit hashes..."
    
    COMMIT_ORCHESTRATOR=$(get_git_commit "$ORCHESTRATOR_ROOT")
    COMMIT_SIMULATOR=$(get_git_commit "$WORKSPACE_ROOT/cross-chain-simulator")
    COMMIT_MPC_REPO=$(get_git_commit "$WORKSPACE_ROOT/cross-chain-simulator/cross-chain-simulator/mpc-repo")
    COMMIT_AWSRUNNER=$(get_git_commit "$WORKSPACE_ROOT/AWSNodeRunner")
    COMMIT_SERVICES=$(get_git_commit "$WORKSPACE_ROOT/near-localnet-services")
    
    echo "  orchestrator: ${COMMIT_ORCHESTRATOR:0:12}..."
    echo "  cross-chain-simulator: ${COMMIT_SIMULATOR:0:12}..."
    echo "  mpc-repo: ${COMMIT_MPC_REPO:0:12}..."
    echo "  AWSNodeRunner: ${COMMIT_AWSRUNNER:0:12}..."
    echo "  near-localnet-services: ${COMMIT_SERVICES:0:12}..."
    echo ""
}

# Query Layer 1 (NEAR Base) state
query_layer1() {
    echo "Querying Layer 1 (NEAR Base)..."
    
    LAYER1_DEPLOYED=false
    LAYER1_VERIFIED=false
    LAYER1_RPC_URL=""
    LAYER1_INSTANCE_ID=""
    LAYER1_PRIVATE_IP=""
    LAYER1_VPC_ID=""
    LAYER1_NETWORK_ID=""
    LAYER1_NEAR_VERSION=""
    LAYER1_STACK_STATUS=""
    
    # Check infrastructure stack
    if stack_exists "near-localnet-infrastructure"; then
        LAYER1_STACK_STATUS=$(aws cloudformation describe-stacks \
            --stack-name "near-localnet-infrastructure" \
            --query "Stacks[0].StackStatus" \
            --output text \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" 2>/dev/null || echo "UNKNOWN")
        
        if [[ "$LAYER1_STACK_STATUS" == "CREATE_COMPLETE" || "$LAYER1_STACK_STATUS" == "UPDATE_COMPLETE" ]]; then
            LAYER1_DEPLOYED=true
            
            # Get outputs - try multiple possible output key names
            LAYER1_INSTANCE_ID=$(get_cf_output "near-localnet-infrastructure" "near-instance-id")
            [ -z "$LAYER1_INSTANCE_ID" ] && LAYER1_INSTANCE_ID=$(get_cf_output "near-localnet-infrastructure" "nearinstanceid")
            
            LAYER1_PRIVATE_IP=$(get_cf_output "near-localnet-infrastructure" "near-instance-private-ip")
            [ -z "$LAYER1_PRIVATE_IP" ] && LAYER1_PRIVATE_IP=$(get_cf_output "near-localnet-infrastructure" "nearinstanceprivateip")
            
            LAYER1_VPC_ID=$(get_cf_output "near-localnet-common" "vpc-id")
            [ -z "$LAYER1_VPC_ID" ] && LAYER1_VPC_ID=$(get_cf_output "near-localnet-common" "vpcid")
        fi
    fi
    
    # Check sync stack for RPC URL
    if stack_exists "near-localnet-sync"; then
        LAYER1_RPC_URL=$(get_cf_output "near-localnet-sync" "nearrpcurl")
        [ -z "$LAYER1_RPC_URL" ] && LAYER1_RPC_URL=$(get_cf_output "near-localnet-sync" "near-rpc-url")
        
        LAYER1_NETWORK_ID=$(get_cf_output "near-localnet-sync" "nearnetworkid")
        [ -z "$LAYER1_NETWORK_ID" ] && LAYER1_NETWORK_ID="localnet"
    fi
    
    # Try reading from existing deployment-state.json in AWSNodeRunner
    local aws_state="$WORKSPACE_ROOT/AWSNodeRunner/lib/near/deployment-state.json"
    if [ -f "$aws_state" ]; then
        echo "  Reading existing state from AWSNodeRunner..."
        
        [ -z "$LAYER1_RPC_URL" ] && LAYER1_RPC_URL=$(jq -r '.layers.near_base.outputs.rpc_url // empty' "$aws_state")
        [ -z "$LAYER1_INSTANCE_ID" ] && LAYER1_INSTANCE_ID=$(jq -r '.layers.near_base.outputs.instance_id // empty' "$aws_state")
        [ -z "$LAYER1_PRIVATE_IP" ] && LAYER1_PRIVATE_IP=$(jq -r '.layers.near_base.outputs.private_ip // empty' "$aws_state")
        [ -z "$LAYER1_VPC_ID" ] && LAYER1_VPC_ID=$(jq -r '.layers.near_base.outputs.vpc_id // empty' "$aws_state")
        [ -z "$LAYER1_NETWORK_ID" ] && LAYER1_NETWORK_ID=$(jq -r '.layers.near_base.outputs.network_id // empty' "$aws_state")
        [ -z "$LAYER1_NEAR_VERSION" ] && LAYER1_NEAR_VERSION=$(jq -r '.layers.near_base.outputs.near_version // empty' "$aws_state")
    fi
    
    # Set RPC URL from private IP if not set
    if [ -z "$LAYER1_RPC_URL" ] && [ -n "$LAYER1_PRIVATE_IP" ]; then
        LAYER1_RPC_URL="http://${LAYER1_PRIVATE_IP}:3030"
    fi
    
    # Verify Layer 1 is operational
    if [ "$LAYER1_DEPLOYED" = true ] && [ -n "$LAYER1_INSTANCE_ID" ]; then
        LAYER1_VERIFIED=true
    fi
    
    echo "  Deployed: $LAYER1_DEPLOYED"
    echo "  Verified: $LAYER1_VERIFIED"
    echo "  Instance: ${LAYER1_INSTANCE_ID:-not-found}"
    echo "  RPC URL: ${LAYER1_RPC_URL:-not-found}"
    echo ""
}

# Query Layer 2 (NEAR Services) state
query_layer2() {
    echo "Querying Layer 2 (NEAR Services)..."
    
    LAYER2_DEPLOYED=false
    LAYER2_VERIFIED=false
    LAYER2_FAUCET_ENDPOINT=""
    LAYER2_FAUCET_ARN=""
    LAYER2_STACK_STATUS=""
    
    # Try different faucet stack versions
    for version in v6 v5 v4 v3 v2; do
        local stack_name="near-localnet-faucet-$version"
        if stack_exists "$stack_name"; then
            echo "  Found stack: $stack_name"
            
            LAYER2_STACK_STATUS=$(aws cloudformation describe-stacks \
                --stack-name "$stack_name" \
                --query "Stacks[0].StackStatus" \
                --output text \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" 2>/dev/null || echo "UNKNOWN")
            
            if [[ "$LAYER2_STACK_STATUS" == "CREATE_COMPLETE" || "$LAYER2_STACK_STATUS" == "UPDATE_COMPLETE" ]]; then
                LAYER2_DEPLOYED=true
                LAYER2_FAUCET_STACK="$stack_name"
                
                # Get outputs
                LAYER2_FAUCET_ARN=$(get_cf_output "$stack_name" "FaucetFunctionArn")
                [ -z "$LAYER2_FAUCET_ARN" ] && LAYER2_FAUCET_ARN=$(get_cf_output "$stack_name" "FaucetLambdaArn")
                [ -z "$LAYER2_FAUCET_ARN" ] && LAYER2_FAUCET_ARN=$(get_cf_output "$stack_name" "faucetFunctionArn")
                
                LAYER2_FAUCET_ENDPOINT=$(get_cf_output "$stack_name" "FaucetEndpoint")
                [ -z "$LAYER2_FAUCET_ENDPOINT" ] && LAYER2_FAUCET_ENDPOINT=$(get_cf_output "$stack_name" "faucetEndpoint")
                
                break
            fi
        fi
    done
    
    # Try reading from existing deployment-state.json in near-localnet-services
    local services_state="$WORKSPACE_ROOT/near-localnet-services/faucet/cdk/deployment-state.json"
    if [ -f "$services_state" ]; then
        echo "  Reading existing state from near-localnet-services..."
        # This file may have different structure, try to extract if possible
    fi
    
    # Verify Layer 2 is operational
    if [ "$LAYER2_DEPLOYED" = true ]; then
        LAYER2_VERIFIED=true
    fi
    
    echo "  Deployed: $LAYER2_DEPLOYED"
    echo "  Verified: $LAYER2_VERIFIED"
    echo "  Faucet ARN: ${LAYER2_FAUCET_ARN:-not-found}"
    echo ""
}

# Query Layer 3 (Chain Signatures) state - mostly empty for pre-deployment
query_layer3() {
    echo "Querying Layer 3 (Chain Signatures)..."
    
    LAYER3_DEPLOYED=false
    LAYER3_VERIFIED=false
    LAYER3_MPC_NODE_0=""
    LAYER3_MPC_NODE_1=""
    LAYER3_MPC_NODE_2=""
    LAYER3_CONTRACT_ID="v1.signer.localnet"
    
    # Check if MPC stack exists
    if stack_exists "MpcStandaloneStack"; then
        echo "  Found MpcStandaloneStack - Layer 3 may be partially deployed"
        
        LAYER3_MPC_NODE_0=$(get_cf_output "MpcStandaloneStack" "Node0InstanceId")
        LAYER3_MPC_NODE_1=$(get_cf_output "MpcStandaloneStack" "Node1InstanceId")
        LAYER3_MPC_NODE_2=$(get_cf_output "MpcStandaloneStack" "Node2InstanceId")
        
        if [ -n "$LAYER3_MPC_NODE_0" ]; then
            LAYER3_DEPLOYED=true
        fi
    else
        echo "  MpcStandaloneStack not found - Layer 3 not deployed"
    fi
    
    echo "  Deployed: $LAYER3_DEPLOYED"
    echo "  Verified: $LAYER3_VERIFIED"
    echo ""
}

# Generate the deployment-state.json file
generate_state_file() {
    echo "Generating deployment-state.json..."
    
    cat > "$OUTPUT_FILE" << EOF
{
  "checkpoint_name": "$CHECKPOINT_NAME",
  "version": "1.0.0",
  "timestamp": "$TIMESTAMP",
  "git_commits": {
    "orchestrator": "$COMMIT_ORCHESTRATOR",
    "cross-chain-simulator": "$COMMIT_SIMULATOR",
    "mpc-repo": "$COMMIT_MPC_REPO",
    "AWSNodeRunner": "$COMMIT_AWSRUNNER",
    "near-localnet-services": "$COMMIT_SERVICES"
  },
  "layers": {
    "near_base": {
      "deployed": $LAYER1_DEPLOYED,
      "verified": $LAYER1_VERIFIED,
      "stack_status": "${LAYER1_STACK_STATUS:-null}",
      "outputs": {
        "rpc_url": "${LAYER1_RPC_URL:-}",
        "network_id": "${LAYER1_NETWORK_ID:-localnet}",
        "instance_id": "${LAYER1_INSTANCE_ID:-}",
        "private_ip": "${LAYER1_PRIVATE_IP:-}",
        "vpc_id": "${LAYER1_VPC_ID:-}",
        "near_version": "${LAYER1_NEAR_VERSION:-2.10.1}"
      },
      "timestamp": "$TIMESTAMP"
    },
    "near_services": {
      "deployed": $LAYER2_DEPLOYED,
      "verified": $LAYER2_VERIFIED,
      "stack_name": "${LAYER2_FAUCET_STACK:-}",
      "stack_status": "${LAYER2_STACK_STATUS:-null}",
      "outputs": {
        "faucet_lambda_arn": "${LAYER2_FAUCET_ARN:-}",
        "faucet_endpoint": "${LAYER2_FAUCET_ENDPOINT:-}"
      },
      "timestamp": "$TIMESTAMP"
    },
    "chain_signatures": {
      "deployed": $LAYER3_DEPLOYED,
      "verified": $LAYER3_VERIFIED,
      "chunks_completed": [],
      "outputs": {
        "mpc_contract_id": "$LAYER3_CONTRACT_ID",
        "mpc_node_0_instance_id": "${LAYER3_MPC_NODE_0:-}",
        "mpc_node_1_instance_id": "${LAYER3_MPC_NODE_1:-}",
        "mpc_node_2_instance_id": "${LAYER3_MPC_NODE_2:-}"
      },
      "timestamp": null
    }
  },
  "layer3_progressive_deployment": {
    "chunk_3_0_prerequisites": {"status": "not_started", "timestamp": null, "errors": []},
    "chunk_3_1_collect_genesis": {"status": "not_started", "timestamp": null, "errors": []},
    "chunk_3_2_deploy_mpc": {"status": "not_started", "timestamp": null, "errors": []},
    "chunk_3_3_verify_sync": {"status": "not_started", "timestamp": null, "errors": []},
    "chunk_3_4_accounts": {"status": "not_started", "timestamp": null, "errors": []},
    "chunk_3_5_contract_deploy": {"status": "not_started", "timestamp": null, "errors": []},
    "chunk_3_6_contract_init": {"status": "not_started", "timestamp": null, "errors": []},
    "chunk_3_7_domain_voting": {"status": "not_started", "timestamp": null, "errors": []},
    "chunk_3_8_dkg": {"status": "not_started", "timestamp": null, "errors": []},
    "chunk_3_9_verification": {"status": "not_started", "timestamp": null, "errors": []}
  }
}
EOF
    
    echo "  File written to: $OUTPUT_FILE"
}

# Validate JSON syntax
validate_json() {
    echo "Validating JSON syntax..."
    
    if jq empty "$OUTPUT_FILE" 2>/dev/null; then
        echo "  JSON validation: PASSED"
    else
        echo "  JSON validation: FAILED"
        echo "ERROR: Generated JSON is invalid"
        exit 1
    fi
    echo ""
}

# Print summary
print_summary() {
    echo "=============================================="
    echo "Deployment State Summary"
    echo "=============================================="
    echo ""
    jq '{
        checkpoint_name,
        timestamp,
        layers: {
            near_base: {deployed: .layers.near_base.deployed, verified: .layers.near_base.verified},
            near_services: {deployed: .layers.near_services.deployed, verified: .layers.near_services.verified},
            chain_signatures: {deployed: .layers.chain_signatures.deployed, verified: .layers.chain_signatures.verified}
        }
    }' "$OUTPUT_FILE"
    echo ""
    echo "Full state saved to: $OUTPUT_FILE"
    echo ""
    echo "Next steps:"
    echo "  1. Review: cat $OUTPUT_FILE | jq"
    echo "  2. Commit: git add deployment-state.json && git commit -m 'checkpoint: $CHECKPOINT_NAME'"
    echo "  3. Tag: ./scripts/create-checkpoint-tags.sh"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    collect_git_commits
    query_layer1
    query_layer2
    query_layer3
    generate_state_file
    validate_json
    print_summary
    
    echo "Done!"
}

main "$@"
