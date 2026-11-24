#requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$AwsExe,
    [Parameter(Mandatory)][ValidatePattern('^\d{12}$')][string]$ExpectedAccountId,
    [string]$Profile = 'nova-deploy',
    [ValidatePattern('^[a-z]{2}(?:-[a-z]+)+-\d+$')][string]$Region = 'us-east-2',
    [ValidateSet('Validate', 'Infrastructure', 'Upload', 'Activate')][string]$Phase = 'Validate',
    [ValidatePattern('^[A-Za-z][A-Za-z0-9-]{0,127}$')][string]$StackName = 'nova-production',
    [string]$BundlePath,
    [switch]$CertificateAgreementAccepted
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$templatePath = Join-Path $repositoryRoot 'deploy/aws/infra.yaml'
$activationPath = Join-Path $repositoryRoot 'deploy/aws/activate.sh'
$statePath = Join-Path $repositoryRoot 'outputs/aws-deployment.json'
$bundleKey = 'releases/nova-production.zip'
$utf8 = [System.Text.UTF8Encoding]::new($false)

if (-not (Test-Path -LiteralPath $AwsExe -PathType Leaf) -or
    [System.IO.Path]::GetFileName($AwsExe) -ine 'aws.exe') {
    throw 'AwsExe debe indicar la ruta explicita del aws.exe oficial de AWS CLI v2.'
}
$awsPath = (Resolve-Path -LiteralPath $AwsExe).Path
if ([string]::IsNullOrWhiteSpace($Profile) -or $Profile -match '[\x00-\x1F]') {
    throw 'El nombre del perfil AWS no es valido.'
}
if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) { throw 'Falta deploy/aws/infra.yaml.' }
if ([string]::IsNullOrWhiteSpace($BundlePath)) { $BundlePath = Join-Path $repositoryRoot 'outputs/nova-aws.zip' }
if ($Phase -eq 'Activate' -and -not $CertificateAgreementAccepted) {
    throw 'Activate requiere -CertificateAgreementAccepted tras la aceptacion explicita del acuerdo de Let''s Encrypt.'
}

function Protect-Output {
    param([AllowEmptyString()][string]$Text)
    $safe = [regex]::Replace($Text, '\x1B\[[0-?]*[ -/]*[@-~]', '')
    $safe = [regex]::Replace($safe, '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '')
    $safe = [regex]::Replace($safe, '(?i)(mongodb(?:\+srv)?://)[^\s''"<>@]+@', '$1[REDACTED]@')
    $safe = [regex]::Replace($safe, '(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])', '[REDACTED_AWS_KEY]')
    $safe = [regex]::Replace($safe, '(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}', '[REDACTED_JWT]')
    $safe = [regex]::Replace($safe,
        '(?i)((?:JWT_SECRET|MONGODB_URI|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|SecretAccessKey|SessionToken)[''"]?\s*[:=]\s*)(''[^'']*''|"[^"]*"|[^\s,}]+)',
        '$1[REDACTED]')
    return $safe
}

function Invoke-AwsCli {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$Json,
        [string[]]$AllowedErrorCodes = @(),
        [ValidateRange(1, 3600)][int]$TimeoutSeconds = 3600
    )
    # ArgumentList avoids shell interpolation. No AWS executable is looked up on PATH.
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $awsPath
    $start.WorkingDirectory = $repositoryRoot
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = $utf8
    $start.StandardErrorEncoding = $utf8
    $start.Environment['AWS_PAGER'] = ''
    $start.Environment['AWS_CLI_AUTO_PROMPT'] = 'off'
    $start.Environment['AWS_CLI_OUTPUT_ENCODING'] = 'UTF-8'
    $start.Environment['AWS_CLI_FILE_ENCODING'] = 'UTF-8'
    $common = @('--profile', $Profile, '--region', $Region, '--no-cli-pager',
                '--no-cli-auto-prompt', '--color', 'off', '--output', 'json',
                '--cli-connect-timeout', '10', '--cli-read-timeout', '60')
    foreach ($argument in ($common + $Arguments)) { $start.ArgumentList.Add($argument) }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        if (-not $process.Start()) { throw 'No se pudo iniciar AWS CLI.' }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill($true)
            $process.WaitForExit()
            throw "AWS CLI supero el limite local de $TimeoutSeconds segundos."
        }
        $stdout = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) {
            $code = [regex]::Match($stderr, 'An error occurred \(([^)]+)\)').Groups[1].Value
            if ($code -and $code -in $AllowedErrorCodes) { return $null }
            throw "AWS CLI fallo ($($process.ExitCode)): $(Protect-Output $stderr.Trim())"
        }
        if ($Json) {
            try { return ($stdout | ConvertFrom-Json -AsHashtable) }
            catch { throw 'AWS CLI no devolvio el JSON esperado; no se imprimio la respuesta completa.' }
        }
        return $stdout.Trim()
    }
    finally { $process.Dispose() }
}

function Get-PublicDefaultNetwork {
    $vpcResponse = Invoke-AwsCli -Json -Arguments @('ec2', 'describe-vpcs', '--filters', 'Name=is-default,Values=true')
    $vpcs = @($vpcResponse['Vpcs'] | Where-Object { $_['IsDefault'] -eq $true -and $_['State'] -eq 'available' })
    if ($vpcs.Count -ne 1) { throw 'Se requiere una VPC predeterminada disponible en la region seleccionada.' }
    $vpcId = [string]$vpcs[0]['VpcId']
    $subnetResponse = Invoke-AwsCli -Json -Arguments @('ec2', 'describe-subnets', '--filters',
        "Name=vpc-id,Values=$vpcId", 'Name=default-for-az,Values=true')
    $subnets = @($subnetResponse['Subnets'] | Where-Object {
        $_['VpcId'] -eq $vpcId -and $_['DefaultForAz'] -eq $true -and $_['State'] -eq 'available'
    } | Sort-Object { $_['AvailabilityZone'] }, { $_['SubnetId'] })
    if ($subnets.Count -eq 0) { throw 'La VPC predeterminada no tiene subnets predeterminadas disponibles.' }
    $gatewayResponse = Invoke-AwsCli -Json -Arguments @('ec2', 'describe-internet-gateways', '--filters', "Name=attachment.vpc-id,Values=$vpcId")
    $gateways = @($gatewayResponse['InternetGateways'] | Where-Object {
        @($_['Attachments'] | Where-Object { $_['VpcId'] -eq $vpcId -and $_['State'] -in @('available', 'attached') }).Count -gt 0
    } | ForEach-Object { [string]$_['InternetGatewayId'] })
    if ($gateways.Count -eq 0) { throw 'La VPC predeterminada no tiene un Internet Gateway conectado.' }
    $routeResponse = Invoke-AwsCli -Json -Arguments @('ec2', 'describe-route-tables', '--filters', "Name=vpc-id,Values=$vpcId")
    foreach ($subnet in $subnets) {
        $subnetId = [string]$subnet['SubnetId']
        $tables = @($routeResponse['RouteTables'] | Where-Object {
            @($_['Associations'] | Where-Object { $_['SubnetId'] -eq $subnetId }).Count -gt 0
        })
        if ($tables.Count -eq 0) {
            $tables = @($routeResponse['RouteTables'] | Where-Object {
                @($_['Associations'] | Where-Object { $_['Main'] -eq $true }).Count -gt 0
            })
        }
        if ($tables.Count -ne 1) { continue }
        $publicRoute = @($tables[0]['Routes'] | Where-Object {
            $_['DestinationCidrBlock'] -eq '0.0.0.0/0' -and $_['State'] -eq 'active' -and $_['GatewayId'] -in $gateways
        })
        if ($publicRoute.Count -gt 0) {
            return [ordered]@{ VpcId = $vpcId; SubnetId = $subnetId; AvailabilityZone = $subnet['AvailabilityZone'] }
        }
    }
    throw 'Ninguna subnet predeterminada tiene una ruta activa 0.0.0.0/0 al Internet Gateway de la VPC.'
}

function Get-DeploymentState {
    $response = Invoke-AwsCli -Json -Arguments @('cloudformation', 'describe-stacks', '--stack-name', $StackName)
    $stacks = @($response['Stacks'])
    if ($stacks.Count -ne 1) { throw 'No se encontro exactamente un stack de NOVA.' }
    $stack = $stacks[0]
    if ($stack['StackStatus'] -notin @('CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE')) {
        throw "El stack no esta listo: $($stack['StackStatus'])."
    }
    $bundleParameter = @($stack['Parameters'] | Where-Object { $_['ParameterKey'] -eq 'BundleKey' })
    if ($bundleParameter.Count -ne 1 -or $bundleParameter[0]['ParameterValue'] -cne $bundleKey) {
        throw 'BundleKey del stack no coincide con el objeto permitido para este despliegue.'
    }
    $outputs = @{}
    foreach ($item in $stack['Outputs']) { $outputs[$item['OutputKey']] = [string]$item['OutputValue'] }
    $state = [ordered]@{
        Account = $ExpectedAccountId
        Region = $Region
        Profile = $Profile
        StackName = $StackName
        BundleKey = $bundleKey
    }
    foreach ($name in @('InstanceId', 'PublicIp', 'BundleBucketName', 'HttpsUrl')) {
        if (-not $outputs.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($outputs[$name])) {
            throw "El stack no contiene la salida requerida '$name'."
        }
        $state[$name] = $outputs[$name]
    }
    $address = $null
    if ($state['InstanceId'] -notmatch '^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$' -or
        $state['BundleBucketName'] -notmatch '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' -or
        -not [System.Net.IPAddress]::TryParse($state['PublicIp'], [ref]$address) -or
        $address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
        $state['HttpsUrl'] -cne "https://$($state['PublicIp'])/") {
        throw 'Las salidas del stack no tienen el formato esperado para NOVA.'
    }
    return $state
}

function Save-DeploymentState {
    param([System.Collections.IDictionary]$State)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($statePath)) | Out-Null
    [System.IO.File]::WriteAllText($statePath, ($State | ConvertTo-Json -Depth 20) + "`n", $utf8)
}

function Get-CheckedBundle {
    $path = (Resolve-Path -LiteralPath $BundlePath -ErrorAction Stop).Path
    if ([System.IO.Path]::GetExtension($path) -ine '.zip') { throw 'BundlePath debe indicar el ZIP generado por package-aws.ps1.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($path)
    try {
        $names = @($archive.Entries | ForEach-Object { $_.FullName })
        foreach ($name in $names) {
            if ($name -match '(?i)(^|/)(\.env(?:\.[^/]*)?|\.git|node_modules)(/|$)' -or
                $name -match '(^|/)\.\.(/|$)' -or $name.Contains('\') -or $name.StartsWith('/')) {
                throw 'El ZIP contiene archivos privados, dependencias instaladas o rutas no permitidas.'
            }
        }
        foreach ($required in @('package.json', 'package-lock.json', 'backend/src/server.js', 'frontend/dist/frontend/browser/index.html')) {
            if ($required -cnotin $names) { throw "El ZIP no contiene '$required' en su ruta esperada." }
        }
    }
    finally { $archive.Dispose() }
    return $path
}

function Quote-BashArgument {
    param([string]$Value)
    $quote = [string][char]39
    $replacement = $quote + [char]34 + $quote + [char]34 + $quote
    return $quote + $Value.Replace($quote, $replacement) + $quote
}

function Invoke-Activation {
    param([System.Collections.IDictionary]$State)
    if (-not (Test-Path -LiteralPath $activationPath -PathType Leaf)) { throw 'Falta deploy/aws/activate.sh.' }
    $script = [System.IO.File]::ReadAllText($activationPath).Replace("`r`n", "`n").Replace("`r", "`n")
    foreach ($required in @('/var/lib/nova/bootstrap-ready', 'nginx -t', '--agree-tos', '--ip-address', 'set +x')) {
        if (-not $script.Contains($required)) { throw "activate.sh no contiene la salvaguarda esperada: $required" }
    }
    # The SSM payload contains code and public deployment identifiers, never secret values.
    $arguments = @($State['BundleBucketName'], $bundleKey, $State['PublicIp'], $Region) |
        ForEach-Object { Quote-BashArgument ([string]$_) }
    $delimiter = 'NOVA_ACTIVATION_' + [guid]::NewGuid().ToString('N')
    $command = "exec /bin/bash <<'$delimiter'`nset -- $($arguments -join ' ')`n$script`n$delimiter`n"
    $parameters = @{ commands = @($command); executionTimeout = @('1800') }
    $temporaryFile = Join-Path ([System.IO.Path]::GetTempPath()) ('nova-ssm-' + [guid]::NewGuid().ToString('N') + '.json')
    try {
        [System.IO.File]::WriteAllText($temporaryFile, ($parameters | ConvertTo-Json -Depth 10), $utf8)
        $sent = Invoke-AwsCli -Json -Arguments @('ssm', 'send-command', '--instance-ids', $State['InstanceId'],
            '--document-name', 'AWS-RunShellScript', '--parameters', "file://$temporaryFile", '--timeout-seconds', '300',
            '--comment', 'Activate NOVA application and approved public IP TLS')
    }
    finally {
        if (Test-Path -LiteralPath $temporaryFile -PathType Leaf) { Remove-Item -LiteralPath $temporaryFile -Force }
    }
    $commandId = [string]$sent['Command']['CommandId']
    if ($commandId -notmatch '^[0-9a-f-]{36}$') { throw 'SSM no devolvio un CommandId valido.' }
    $State['LastCommandId'] = $commandId
    Save-DeploymentState $State
    Write-Host "SSM enviado: $commandId. Espera maxima: 35 minutos."
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $lastStatus = ''
    $lastHeartbeat = -30
    while ($watch.Elapsed.TotalMinutes -lt 35) {
        $remaining = [Math]::Max(1, [Math]::Min(60, [Math]::Floor(2100 - $watch.Elapsed.TotalSeconds)))
        # SSM is eventually consistent immediately after SendCommand.
        $result = Invoke-AwsCli -Json -TimeoutSeconds $remaining -AllowedErrorCodes @('InvocationDoesNotExist') -Arguments @(
            'ssm', 'get-command-invocation', '--command-id', $commandId, '--instance-id', $State['InstanceId'])
        $status = if ($null -eq $result) { 'Pending' } else { [string]$result['Status'] }
        if ($status -ne $lastStatus -or $watch.Elapsed.TotalSeconds - $lastHeartbeat -ge 30) {
            Write-Host "SSM: $status ($([Math]::Floor($watch.Elapsed.TotalMinutes)) min)."
            $lastStatus = $status
            $lastHeartbeat = $watch.Elapsed.TotalSeconds
        }
        if ($status -in @('Success', 'Cancelled', 'TimedOut', 'Failed')) {
            foreach ($field in @('StandardOutputContent', 'StandardErrorContent')) {
                if (-not [string]::IsNullOrWhiteSpace([string]$result[$field])) {
                    Write-Host (Protect-Output ([string]$result[$field]))
                }
            }
            if ($status -ne 'Success' -or [int]$result['ResponseCode'] -ne 0) {
                throw "La activacion termino en $status (codigo $($result['ResponseCode'])). CommandId: $commandId."
            }
            $State['ActivationStatus'] = 'Success'
            Save-DeploymentState $State
            return
        }
        $sleep = [Math]::Min(5, [Math]::Max(0, 2100 - $watch.Elapsed.TotalSeconds))
        if ($sleep -gt 0) { Start-Sleep -Seconds $sleep }
    }
    throw "Se agoto la espera de 35 minutos. No se cancelo el comando remoto $commandId; revisa su estado con SSM."
}

if (-not $PSCmdlet.ShouldProcess("cuenta $ExpectedAccountId, region $Region, stack $StackName", "Fase AWS $Phase")) {
    [pscustomobject]@{ Phase = $Phase; Account = $ExpectedAccountId; Region = $Region; StackName = $StackName; WhatIf = $true; AccountVerified = $false }
    return
}
$identity = Invoke-AwsCli -Json -Arguments @('sts', 'get-caller-identity')
if ([string]$identity['Account'] -cne $ExpectedAccountId) {
    throw 'La cuenta del perfil AWS no coincide con ExpectedAccountId. No se realizaron cambios.'
}

switch ($Phase) {
    'Validate' {
        [void](Invoke-AwsCli -Json -Arguments @('cloudformation', 'validate-template', '--template-body', "file://$templatePath"))
        [pscustomobject]@{ Phase = $Phase; Account = $ExpectedAccountId; Region = $Region; TemplateValid = $true }
    }
    'Infrastructure' {
        $network = Get-PublicDefaultNetwork
        Write-Host "Red seleccionada: $($network['VpcId']), $($network['SubnetId']) ($($network['AvailabilityZone']))."
        $message = Invoke-AwsCli -Arguments @('cloudformation', 'deploy', '--template-file', $templatePath,
            '--stack-name', $StackName, '--capabilities', 'CAPABILITY_IAM', '--no-fail-on-empty-changeset',
            '--parameter-overrides', "VpcId=$($network['VpcId'])", "SubnetId=$($network['SubnetId'])", "BundleKey=$bundleKey")
        if ($message) { Write-Host (Protect-Output $message) }
        $state = Get-DeploymentState
        Save-DeploymentState $state
        [pscustomobject]$state
    }
    'Upload' {
        $bundle = Get-CheckedBundle
        $state = Get-DeploymentState
        [void](Invoke-AwsCli -Arguments @('s3', 'cp', $bundle, "s3://$($state['BundleBucketName'])/$bundleKey",
            '--sse', 'AES256', '--only-show-errors', '--no-progress'))
        Save-DeploymentState $state
        [pscustomobject]@{ Phase = $Phase; Bucket = $state['BundleBucketName']; Key = $bundleKey; SHA256 = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    'Activate' {
        $state = Get-DeploymentState
        [void](Invoke-AwsCli -Json -Arguments @('s3api', 'head-object', '--bucket', $state['BundleBucketName'], '--key', $bundleKey))
        Invoke-Activation $state
        [pscustomobject]$state
    }
}
