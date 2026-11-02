# Export helpers

The tracker auto-imports these file names when they appear in the shared folder's `imports\` folder:
`intune-devices.csv`, `mosyle-devices.csv`, `labstats-stations.csv`, `labstats-usage.csv`, `warranty.csv`, `lenovo-warranty.csv`, `installed-apps.csv`.

- **Intune:** `Export-IntuneDevices.ps1` (Graph), scheduled nightly with `Register-NightlyExport.ps1`. Untested against a live tenant.
- **Mosyle / LabStats:** no script is provided yet. Export the CSV from their consoles (Mosyle: Management > Devices > export; LabStats: Stations / Reports > export), save it under the file name above, and drop it in `imports\`. Scheduled API pulls need each vendor's API documentation and an API token; the endpoints could not be verified, so none were guessed.
