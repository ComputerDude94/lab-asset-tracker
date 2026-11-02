<#
.SYNOPSIS
  Looks up Lenovo warranty end dates for a list of serial numbers and writes a CSV the tracker can import.

.DESCRIPTION
  Input : CSV with a "Serial" column (Settings > "Download Lenovo serial list" in the tracker).
  Output: CSV with Serial, WarrantyEnd, WarrantyStart, Product (import via Import > Warranty dates).
  You need a Lenovo ClientID (request it through your Lenovo account representative).

  ASSUMPTION: this uses GET https://supportapi.lenovo.com/v2.5/warranty?Serial=<serial> with a ClientID header,
  as used by community tools. Check Lenovo's own Product Warranty API documentation if it stops working.
  NOT TESTED against the live API.

.EXAMPLE
  .\Get-LenovoWarranty.ps1 -ClientId 'abc123' -InputCsv .\lenovo-serials.csv -OutputCsv .\lenovo-warranty.csv
#>
param(
  [Parameter(Mandatory)] [string] $ClientId,
  [Parameter(Mandatory)] [string] $InputCsv,
  [string] $OutputCsv = '.\lenovo-warranty.csv',
  [int] $DelayMs = 1100
)

function Get-Values($Obj, [string[]] $Names, $Acc) {
  if ($null -eq $Obj) { return }
  if ($Obj -is [System.Collections.IEnumerable] -and $Obj -isnot [string]) { foreach ($x in $Obj) { Get-Values $x $Names $Acc }; return }
  if ($Obj -is [psobject]) {
    foreach ($p in $Obj.PSObject.Properties) {
      if ($Names -contains $p.Name.ToLower() -and $p.Value -is [string]) { [void]$Acc.Add($p.Value) }
      elseif ($p.Value -is [psobject] -or ($p.Value -is [System.Collections.IEnumerable] -and $p.Value -isnot [string])) { Get-Values $p.Value $Names $Acc }
    }
  }
}

$headers = @{ ClientID = $ClientId }
$results = foreach ($row in (Import-Csv $InputCsv)) {
  $serial = ($row.Serial).Trim()
  if (-not $serial) { continue }
  try {
    $resp = Invoke-RestMethod -Uri "https://supportapi.lenovo.com/v2.5/warranty?Serial=$([uri]::EscapeDataString($serial))" -Headers $headers -Method Get
    $ends = New-Object System.Collections.ArrayList; $starts = New-Object System.Collections.ArrayList; $names = New-Object System.Collections.ArrayList
    Get-Values $resp @('end', 'enddate', 'warrantyend', 'expirationdate') $ends
    Get-Values $resp @('start', 'startdate', 'warrantystart') $starts
    Get-Values $resp @('name', 'description') $names
    $end   = ($ends   | ForEach-Object { try { [datetime]$_ } catch { $null } } | Where-Object { $_ } | Sort-Object | Select-Object -Last 1)
    $start = ($starts | ForEach-Object { try { [datetime]$_ } catch { $null } } | Where-Object { $_ } | Sort-Object | Select-Object -First 1)
    [pscustomobject]@{
      Serial = $serial; WarrantyEnd = if ($end) { $end.ToString('yyyy-MM-dd') } else { '' }
      WarrantyStart = if ($start) { $start.ToString('yyyy-MM-dd') } else { '' }; Product = ($names | Select-Object -First 1)
    }
    Write-Host "$serial -> $($end)"
  } catch {
    Write-Warning "$serial failed: $($_.Exception.Message)"
    [pscustomobject]@{ Serial = $serial; WarrantyEnd = ''; WarrantyStart = ''; Product = "ERROR: $($_.Exception.Message)" }
  }
  Start-Sleep -Milliseconds $DelayMs
}
$results | Export-Csv -Path $OutputCsv -NoTypeInformation -Encoding UTF8
Write-Host "Wrote $OutputCsv"
