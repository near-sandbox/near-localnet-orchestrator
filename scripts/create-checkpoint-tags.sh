#!/bin/bash
# create-checkpoint-tags.sh
# Create synchronized git tags across all repositories for checkpoint tracking
#
# Usage: ./scripts/create-checkpoint-tags.sh [tag_name] [message]
# Example: ./scripts/create-checkpoint-tags.sh "layer3-pre-deployment" "Pre-Layer 3 deployment checkpoint"
#
# Default: Creates "layer3-pre-deployment" tag with standard message

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR_ROOT="$(dirname "$SCRIPT_DIR")"
WORKSPACE_ROOT="$(dirname "$ORCHESTRATOR_ROOT")"

# Tag configuration
TAG_NAME="${1:-layer3-pre-deployment}"
TAG_MESSAGE="${2:-Pre-Layer 3 deployment checkpoint - Layers 1&2 verified operational}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Repository paths
declare -a REPOS=(
    "$WORKSPACE_ROOT/near-localnet-orchestrator"
    "$WORKSPACE_ROOT/cross-chain-simulator"
    "$WORKSPACE_ROOT/cross-chain-simulator/cross-chain-simulator/mpc-repo"
    "$WORKSPACE_ROOT/AWSNodeRunner"
    "$WORKSPACE_ROOT/near-localnet-services"
)

# Repository names for display
declare -a REPO_NAMES=(
    "near-localnet-orchestrator"
    "cross-chain-simulator"
    "mpc-repo (submodule)"
    "AWSNodeRunner"
    "near-localnet-services"
)

# Track results
declare -a SUCCESS_REPOS=()
declare -a FAILED_REPOS=()
declare -a SKIPPED_REPOS=()

echo "=============================================="
echo "Creating Checkpoint Tags Across Repositories"
echo "=============================================="
echo "Tag Name: $TAG_NAME"
echo "Message: $TAG_MESSAGE"
echo "Timestamp: $TIMESTAMP"
echo ""

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    if ! command -v git &> /dev/null; then
        echo "ERROR: git not installed"
        exit 1
    fi
    
    echo "Prerequisites OK"
    echo ""
}

# Check if repository exists and is valid
is_valid_repo() {
    local repo_path=$1
    
    if [ ! -d "$repo_path" ]; then
        return 1
    fi
    
    if [ -d "$repo_path/.git" ] || [ -f "$repo_path/.git" ]; then
        return 0
    fi
    
    return 1
}

# Check if tag already exists
tag_exists() {
    local repo_path=$1
    local tag_name=$2
    
    git -C "$repo_path" tag -l "$tag_name" | grep -q "^${tag_name}$"
    return $?
}

# Check if there are uncommitted changes
has_uncommitted_changes() {
    local repo_path=$1
    
    if [ -n "$(git -C "$repo_path" status --porcelain 2>/dev/null)" ]; then
        return 0
    fi
    return 1
}

# Create tag in a repository
create_tag_in_repo() {
    local repo_path=$1
    local repo_name=$2
    local tag=$3
    local message=$4
    
    echo "Processing: $repo_name"
    echo "  Path: $repo_path"
    
    # Check if valid repo
    if ! is_valid_repo "$repo_path"; then
        echo "  SKIPPED: Not a valid git repository"
        SKIPPED_REPOS+=("$repo_name")
        echo ""
        return 1
    fi
    
    # Check if tag already exists
    if tag_exists "$repo_path" "$tag"; then
        echo "  SKIPPED: Tag '$tag' already exists"
        SKIPPED_REPOS+=("$repo_name (tag exists)")
        echo ""
        return 0
    fi
    
    # Check for uncommitted changes
    if has_uncommitted_changes "$repo_path"; then
        echo "  WARNING: Uncommitted changes detected"
        echo "  Committing changes before tagging..."
        
        git -C "$repo_path" add -A
        git -C "$repo_path" commit -m "checkpoint: $message" || true
    fi
    
    # Create annotated tag
    echo "  Creating tag: $tag"
    if git -C "$repo_path" tag -a "$tag" -m "$message"; then
        echo "  Tag created successfully"
    else
        echo "  ERROR: Failed to create tag"
        FAILED_REPOS+=("$repo_name")
        echo ""
        return 1
    fi
    
    # Push tag to origin
    echo "  Pushing tag to origin..."
    if git -C "$repo_path" push origin "$tag" 2>/dev/null; then
        echo "  Tag pushed successfully"
        SUCCESS_REPOS+=("$repo_name")
    else
        echo "  WARNING: Failed to push tag (may not have remote or permissions)"
        echo "  Tag created locally - manual push may be required"
        SUCCESS_REPOS+=("$repo_name (local only)")
    fi
    
    echo ""
    return 0
}

# Process all repositories
process_repositories() {
    echo "Creating tags in repositories..."
    echo ""
    
    for i in "${!REPOS[@]}"; do
        create_tag_in_repo "${REPOS[$i]}" "${REPO_NAMES[$i]}" "$TAG_NAME" "$TAG_MESSAGE"
    done
}

# Print summary
print_summary() {
    echo "=============================================="
    echo "Tag Creation Summary"
    echo "=============================================="
    echo ""
    
    if [ ${#SUCCESS_REPOS[@]} -gt 0 ]; then
        echo "SUCCESS (${#SUCCESS_REPOS[@]}):"
        for repo in "${SUCCESS_REPOS[@]}"; do
            echo "  - $repo"
        done
        echo ""
    fi
    
    if [ ${#SKIPPED_REPOS[@]} -gt 0 ]; then
        echo "SKIPPED (${#SKIPPED_REPOS[@]}):"
        for repo in "${SKIPPED_REPOS[@]}"; do
            echo "  - $repo"
        done
        echo ""
    fi
    
    if [ ${#FAILED_REPOS[@]} -gt 0 ]; then
        echo "FAILED (${#FAILED_REPOS[@]}):"
        for repo in "${FAILED_REPOS[@]}"; do
            echo "  - $repo"
        done
        echo ""
    fi
    
    echo "Tag: $TAG_NAME"
    echo ""
    
    # Verification commands
    echo "Verification commands:"
    echo "  # Check tags exist locally"
    for i in "${!REPOS[@]}"; do
        echo "  git -C ${REPOS[$i]} tag -l '$TAG_NAME'"
    done
    echo ""
    
    echo "  # Rollback to this checkpoint"
    echo "  git checkout $TAG_NAME"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    process_repositories
    print_summary
    
    if [ ${#FAILED_REPOS[@]} -gt 0 ]; then
        echo "WARNING: Some repositories failed. Review errors above."
        exit 1
    fi
    
    echo "Done!"
}

main "$@"
