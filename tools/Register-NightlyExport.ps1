<#
.SYNOPSIS
  Registers a Windows scheduled task that runs an export script every night (e.g. Export-IntuneDevices.ps1),
  so imports\intune-devices.csv is refreshed and the tracker picks it up automatically.
.EXAMPLE
  .\Register-NightlyExport.ps1 -Script C:\LabTracker\tools\Export-IntuneDevices.ps1 `
     -Arguments "-OutFile '\\server\share\LabTracker\imports\intune-devices.csv' -TenantId <tenant> -ClientId <app> -CertThumbprint <thumb>" -At 2:00am
  Run from an elevated prompt on a server/PC that stays on. NOT TESTED here (no Windows / PowerShell in the build environment).
#>
param([Parameter(Mandatory)] [string] $Script, [string] $Arguments = '', [string] $At = '2:00am', [string] $TaskName = 'LabTracker nightly export')
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Script`" $Arguments"
Register-ScheduledTask -TaskName $TaskName -Action $act -Trigger (New-ScheduledTaskTrigger -Daily -At $At) -RunLevel Highest -Force | Out-Null
Write-Host "Registered '$TaskName' to run daily at $At."
