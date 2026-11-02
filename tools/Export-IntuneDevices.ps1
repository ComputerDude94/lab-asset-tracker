<#
.SYNOPSIS
  Exports Intune managed devices to the CSV the Lab Asset Tracker auto-imports (imports\intune-devices.csv).
.DESCRIPTION
  Uses the Microsoft Graph PowerShell SDK (Install-Module Microsoft.Graph.DeviceManagement).
  Interactive:  .\Export-IntuneDevices.ps1 -OutFile '\\server\share\LabTracker\imports\intune-devices.csv'
  Scheduled  :  create an Entra app registration with the *application* permission DeviceManagementManagedDevices.Read.All
                (admin consent), add a certificate, then pass -TenantId -ClientId -CertThumbprint.
  Column names match what the tracker auto-detects. NOT TESTED against a live tenant.
#>
param(
  [Parameter(Mandatory)] [string] $OutFile,
  [string] $TenantId, [string] $ClientId, [string] $CertThumbprint
)
if ($ClientId) { Connect-MgGraph -TenantId $TenantId -ClientId $ClientId -CertificateThumbprint $CertThumbprint -NoWelcome }
else { Connect-MgGraph -Scopes 'DeviceManagementManagedDevices.Read.All' -NoWelcome }

$rows = Get-MgDeviceManagementManagedDevice -All | ForEach-Object {
  [pscustomobject]@{
    'Device name'      = $_.DeviceName
    'Serial number'    = $_.SerialNumber
    'Manufacturer'     = $_.Manufacturer
    'Model'            = $_.Model
    'OS'               = $_.OperatingSystem
    'OS version'       = $_.OsVersion
    'Last check-in'    = if ($_.LastSyncDateTime) { $_.LastSyncDateTime.ToString('yyyy-MM-dd') } else { '' }
    'Primary user UPN' = $_.UserPrincipalName
    'Total storage'    = $_.TotalStorageSpaceInBytes
    'RAM'              = $_.PhysicalMemoryInBytes
  }
}
$tmp = "$OutFile.tmp"                                        # write then rename so the tracker never reads a half-written file
$rows | Export-Csv -Path $tmp -NoTypeInformation -Encoding UTF8
Move-Item -Path $tmp -Destination $OutFile -Force
Write-Host "Wrote $($rows.Count) devices to $OutFile"
