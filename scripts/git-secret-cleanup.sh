#!/bin/bash
# ============================================================================
# InfraDesk — Git History Secret Cleanup
# ============================================================================
# This script removes hardcoded secrets from git history using git-filter-repo.
#
# PREREQUISITES:
#   pip install git-filter-repo
#
# WARNING:
#   - This REWRITES git history (force push required)
#   - All collaborators must re-clone after this
#   - Backup your repo first!
#
# USAGE:
#   cd /path/to/infradesk
#   bash scripts/git-secret-cleanup.sh
# ============================================================================

set -e

echo "=== InfraDesk Secret Cleanup ==="
echo ""
echo "This will:"
echo "  1. Replace old hardcoded secrets in git history"
echo "  2. Require a force push to origin"
echo "  3. Require all collaborators to re-clone"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Secrets to replace in history
cat > /tmp/infradesk-replacements.txt << 'EOF'
super-secret-jwt-key-change-in-production-min32chars!!==>***REMOVED***
super-secret-refresh-key-change-in-production-min32!!==>***REMOVED***
12345678901234567890123456789032==>***REMOVED***
changeme-secret-key==>***REMOVED***
changeme-refresh-secret==>***REMOVED***
changeme-32-char-encryption-key!==>***REMOVED***
EOF

echo "Replacing secrets in git history..."
git filter-repo --replace-text /tmp/infradesk-replacements.txt --force

echo ""
echo "Done! Now run:"
echo "  git push --force --all origin"
echo "  git push --force --tags origin"
echo ""
echo "Then tell all collaborators to re-clone the repo."

rm /tmp/infradesk-replacements.txt
