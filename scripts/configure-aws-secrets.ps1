#Requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$AwsExe,
    [string]$Profile = 'nova-deploy',
    [string]$Region = 'us-east-2',
    [string]$EnvFile = (Join-Path $PSScriptRoot '../backend/.env')
)
$ErrorActionPreference = 'Stop'
$env:AWS_CLI_FILE_ENCODING = 'UTF-8'
$env:AWS_CLI_OUTPUT_ENCODING = 'UTF-8'
if (-not $PSCmdlet.ShouldProcess("AWS Parameter Store ($Region, perfil $Profile)", 'Guardar MONGODB_URI y JWT_SECRET como SecureString Standard para NOVA')) { return }
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) { throw 'No existe el archivo de entorno local.' }

$privateDir = Join-Path $env:LOCALAPPDATA ('NOVA-AWS-Tools/private-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
$acl = Get-Acl -LiteralPath $privateDir
$acl.SetAccessRuleProtection($true, $false)
$rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().User,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
)
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $privateDir -AclObject $acl

try {
    $envPath = (Resolve-Path -LiteralPath $EnvFile).Path
    $dotenvPath = Join-Path $PSScriptRoot '../backend/node_modules/dotenv'
    @'
const fs = require('node:fs');
const path = require('node:path');
const [envPath, directory, dotenvPath] = process.argv.slice(2);
const values = require(path.resolve(dotenvPath)).parse(fs.readFileSync(envPath));
if (!/^mongodb(?:\+srv)?:\/\//.test(values.MONGODB_URI || '') || (values.JWT_SECRET || '').length < 32) {
  console.error('La configuración local de MongoDB o JWT no es válida.');
  process.exit(1);
}
for (const [key, name] of [['MONGODB_URI', 'mongodb-uri'], ['JWT_SECRET', 'jwt-secret']]) {
  if (/[\r\n\0]/.test(values[key])) {
    console.error('Una variable privada contiene caracteres no admitidos.');
    process.exit(1);
  }
  fs.writeFileSync(path.join(directory, name + '.json'), JSON.stringify({
    Name: '/nova/prod/' + name, Type: 'SecureString', Tier: 'Standard',
    Value: values[key], Overwrite: true,
  }), { mode: 0o600 });
}
'@ | & node - $envPath $privateDir $dotenvPath
    if ($LASTEXITCODE -ne 0) { throw 'No se prepararon las variables privadas.' }
    foreach ($name in @('mongodb-uri', 'jwt-secret')) {
        $inputFile = Join-Path $privateDir ($name + '.json')
        & $AwsExe ssm put-parameter --cli-input-json ('file://' + $inputFile) --profile $Profile --region $Region --no-cli-pager --query Version --output text
        if ($LASTEXITCODE -ne 0) { throw "No se guardó el parámetro /nova/prod/$name." }
        Write-Output "Guardado cifrado: /nova/prod/$name"
    }
} finally {
    foreach ($name in @('mongodb-uri.json', 'jwt-secret.json')) {
        $privateFile = Join-Path $privateDir $name
        if (Test-Path -LiteralPath $privateFile) { Remove-Item -LiteralPath $privateFile -Force }
    }
    Remove-Item -LiteralPath $privateDir -Force
}
