# .secrets directory

This directory stores local secret files used by Docker Compose secrets.

- Do not commit actual secret values.
- Each file should contain only the secret value, with no extra formatting.
- Docker mounts these files into containers under `/run/secrets/<name>`.

## Expected files

- `postgres_password`
- `jwt_access_secret`
- `jwt_refresh_secret`

## Generate example secrets

### PowerShell

```powershell
Set-Content -Path .secrets/postgres_password -Value 'nodeadmin'
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 } | ForEach-Object { [byte]$_ })) | Set-Content -Path .secrets/jwt_access_secret
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 } | ForEach-Object { [byte]$_ })) | Set-Content -Path .secrets/jwt_refresh_secret
```

### OpenSSL

```bash
printf 'nodeadmin' > .secrets/postgres_password
openssl rand -base64 32 > .secrets/jwt_access_secret
openssl rand -base64 32 > .secrets/jwt_refresh_secret
```
