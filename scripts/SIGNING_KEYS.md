# InfraDesk Update Signing Keys

Generated: 2026-04-06

## Public Key (embed in agent / env)
```
INFRADESK_UPDATE_PUBKEY=db806a14a9a82a8b8ade7a44a6b3bd81090c0899fb84058a88ee3874c71aae63
```

## Private Key (KEEP OFFLINE — never commit!)
```
INFRADESK_UPDATE_PRIVKEY=854013e1d829fbd42d3d97e303905c839c6f9e83b2c7436f2ac56c9bae7fb0e3
```

## Usage
```bash
export INFRADESK_UPDATE_PRIVKEY=854013e1d829fbd42d3d97e303905c839c6f9e83b2c7436f2ac56c9bae7fb0e3
python scripts/sign-release.py 6.1.0 dist/Asystent_Home.exe
```

⚠️ DELETE this file after saving keys to a password manager!
