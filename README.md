# Lab Asset Tracker

One self-contained file, `lab-tracker.html` (no internet, no server). Tracks lab hardware, replacement
schedules, software per lab, contacts, OS/device data from Intune, Mosyle and LabStats, and draws charts.

## Set up for the team
1. Copy `lab-tracker.html` into a folder on the network share (e.g. `\\server\IT\LabTracker`).
2. Everyone opens it in **Edge or Chrome** (Safari/Firefox can't write to a shared folder), enters their name,
   and picks that same folder once. The browser remembers it; after a restart it's one "Reconnect" click.
3. The folder gets `lab-tracker-data.json` (the database) and `backups/` (one snapshot a day, 60 kept).

Several people can edit at once: each save re-reads the file and merges only the fields you changed
(field-level), with a short lock file; the page checks for others' changes every 15 s. It is a shared file, not a
server database. Two people editing the *same field* at the same second: last save wins. Big imports are best done
by one person at a time.

## Features (Snipe-IT style)
Dark sidebar, global search (press `/`), "Create new" menu, column chooser + export on every table, dashboard tiles,
device status labels (Ready to deploy, Deployed, Pending, In repair, Archived, Lost / stolen), asset tags (bulk
"Generate asset tags"), check-out / check-in of devices to labs, per-lab and per-device history timeline (who changed
which field, old -> new), maintenance & repair log, and Reports: depreciation (straight-line over lifecycle),
activity log, license & warranty expiry, device health.

## Replacement notices, model repository, funding, Lenovo warranty
- **Email contacts** (lab page, or *Notify contacts* on the Replacement plan): builds an email with the lab's devices
  (model, specs, qty, OS) and application list (version on record + a column to confirm/change). Send via your email app
  (mailto, shortened), **Copy formatted email** (paste into Outlook with tables intact) or **Download .eml** (opens as an
  unsent Outlook draft). Wording is editable in Settings. "Last notified" is recorded on the lab.
- **Models & configurations**: one entry per model configuration (CPU, RAM, storage, default OS, price, lifecycle, warranty,
  part number). Hardware lines pick from it; *Duplicate* makes another configuration. Default lifecycle is 4 years.
- **Funding**: each hardware line records *Purchased with* (Replacement budget, Tech fee project, Grant… editable list),
  a project/PO number, and *Planned replacement funding*. Reports > Funding and the plan page break costs down by source.
- **Lenovo warranty, no API key**: *Settings > Build batch upload file* (or the bulk action on Devices) creates the `.xlsx`
  Lenovo's public [Batch Warranty Lookup](https://pcsupport.lenovo.com/us/en/warrantylookup/batchquery) expects
  (`Machine Type`, `SerialorIMEI`; max 1,000 rows per upload, split into several files automatically). Upload it there,
  press *Export Results*, then *Import > Warranty dates* and drop the exported .xlsx/.csv (or paste the table). Several
  warranties per serial -> the latest end date wins. Machine type is taken from the first 4 characters of a 10-character
  model string such as `11U5S0KE00` when present. Column names are from Lenovo's FAQ, not a sample file: if Lenovo rejects
  the upload, paste the serials into their downloadable template. An optional API-key lookup and
  `tools/Get-LenovoWarranty.ps1` remain for anyone who gets a Lenovo ClientID (untested).

## Planning & operations features
- **Drop-folder auto-import** (Settings): scripts write CSVs to `<data folder>/imports/` (`intune-devices.csv`, `mosyle-devices.csv`,
  `labstats-stations.csv`, `labstats-usage.csv`, `warranty.csv`, `installed-apps.csv`); the tracker offers (or auto-runs) the import.
  `tools/Export-IntuneDevices.ps1` (Microsoft Graph) writes the Intune file. "Missing from export" is only flagged when the file
  holds at least half of the known devices. Mosyle/LabStats export scripts are not written yet (need their API details).
- **Budget planner**: budgets per fiscal year x funding source; ranks lines by urgency (age, overdue, warranty, repairs, usage, OS
  support) and fills the earliest year with money left; options for splitting, overflow to other sources, pulling forward;
  unfunded list; lifecycle what-if (3-6 yrs); *Apply schedule to plan* writes planned-date overrides.
- **Proposals**: Tech-fee style request document built from the data (age, warranty, repairs, usage, OS, software, cost table with
  contingency/shipping), Print/PDF, Copy for Word, Download .doc; status + approved amount tracking.
- **Projects**: board / table / install timeline (quote > PO > delivery > imaging > install), blackout windows from Settings.
- **OS support**: end-of-support dates (Settings), "Can upgrade OS?" per model, badges, dashboard alert, report, planner weight.
- **Software**: installed-app import + drift report, confirmation tracking for notice emails, baselines per lab type, license
  compliance (seats owned vs needed, cost per seat/lab).
- **Reports**: cost of ownership per model, right-sizing from LabStats, usage trends (history kept per import), data quality,
  surplus & redeployment with disposal/sanitization records, calendar (.ics) export.
- **Labels & audits**: Code 128 barcode labels (Avery 5160/5163 layouts; generator verified against a reference table) and a
  scan-based lab audit with history. Table **Views** menu saves filters/sort per computer; hardware/devices/projects take link lists.

## Importing from the old Microsoft Lists tracker
*Import > Old tracker / Microsoft Lists* takes the list exported to CSV or Excel. Columns are recognised by heading (case, spaces and
symbols ignored; `Building {Choice}`, `Room #`, `Departments { Colleges }` work). Mapping: **Naming Convention** -> the lab's device-match
keywords (trailing `##` removed, so Intune/Mosyle devices find their room); **Applications Requested Lookup** -> software titles linked to
the lab (split on `;` or `,`); **Lab Manager** -> a contact linked to the lab; Vendor/Chip/Device Type/Operating System -> model details;
Last Refreshed + Replacement Cycle -> age clock and lifecycle; **Planned Replacement Year** -> a planned-date override only when it
differs from the calculated year; Cost Per Item (or Total Cost / Quantity); **Current PO** -> Project/PO #; Replacement PO, Refresh
Status, Warranty Expiration, Compliance Asset Id, Service Now / Physical counts and enrollment are kept on the line; Lab Stats Count on
the lab; Calculated Replacement Date and Total Cost are not stored (recomputed). State: retire/surplus -> Retired, spare -> Spare.
"Single" rows with no room go into a "Singles" entry per building. Unmapped columns can be kept in the line notes. Re-running updates the
same lines (matched by lab + model). Warranty dates are copied to devices linked later. Assumptions: a bare year (e.g. 2021) means mid-year;
Planned Replacement Year is treated as the year of the planned date; "State" is read as a status.

## Data safety
Every save is verified: the file must parse, per-table record counts stored in the file must match, and a save is **stopped** (not
written) if the shared file suddenly holds far fewer records than when it was loaded or the save would remove records you did not
delete. Saving then pauses until you fix the cause (Settings > Data safety > Resume saving). A damaged data file offers to restore the
newest backup on load (the damaged copy is kept as `lab-tracker-data.damaged-*.json`). **Run health check** tests the folder: read,
write/re-read/delete a test file, lock, stale lock, backups (newest one is opened and validated). **Export everything (zip)** downloads
the full JSON plus one CSV per table and the activity log for an off-share copy. Still do a real two-computer test on your share.

## Themes
Settings > Appearance: Classic blue, **West Chester University** (purple `#512d6d` + gold `#ffc72c` from wcupa.edu's brand colors,
darker sidebar from their newer "Elemental Purple"; no logo used), Graphite, Forest, High contrast. Each has light and dark
variants; the sun/moon button in the top bar cycles Auto / Light / Dark. "Everyone" sets the shared organization default
(WCU out of the box); "Just me" overrides it in your browser only. Themes are in `src/js/14-theme.js`.

## Apple coverage
No open API and the public page has a CAPTCHA, so: *Apple coverage tools* (Settings, Devices bulk action, device page) offers
(1) copy-ready serial lists (comma-separated, 1,000 per chunk) for Apple School/Business Manager's device search, and (2) a
one-by-one worklist: copies the serial, opens checkcoverage.apple.com, you type the end date, Save & next (optional +1/+3 year
estimate from purchase date). Coverage exports with serial + end date import via Import > Warranty dates.

## Data model
Buildings -> Labs -> Hardware lines (model, qty, cost, OS, dates). Models catalog (price + lifecycle) drives cost
estimates. Managed devices (from imports) link to labs. Software catalog <-> labs (matrix). Contacts link to labs,
software, or "notify automatically" for a platform (Windows/Mac).
Planned replacement = last replaced (or purchase) + lifecycle years, unless you set an override date.

## Imports (Import page)
- **Intune / Mosyle / LabStats devices**: CSV exports, columns auto-detected. Matched by serial (LabStats by name),
  so re-import updates instead of duplicating. Devices are linked to rooms using each lab's *match keywords*
  (e.g. `SMI204`) or building code + room found in the device name / location / tags.
- **LabStats usage**: group/lab hours, sessions, utilization % -> shown on labs, plan and charts.
- **Inventory CSV**: move in a Microsoft List export (template provided).

## How devices get linked to rooms
In order: (1) the lab's *match keywords* (e.g. `SMI204, ArtStudio`), (2) your naming patterns in Settings
(`{bldg}-{room}-{type}{n}`, `{any}`), (3) building code/name/alias + room found in the device name, location or
tags (`SMI204-PC01`, `SMI-204-MAC03`, `Smith Hall Room 204`; leading zeros ignored), (4) a generic `BLDG-ROOM-xx` guess.
Anything left over shows up in the import preview grouped by name prefix; pick a lab per group and the prefix is saved
as a keyword. Rooms you assign by hand are never overwritten. "Re-link by name" on the Devices page re-runs matching.

## Develop
Edit `src/` then `node build.js` to regenerate `lab-tracker.html`. Try the demo: open the page and choose "Try it with sample data".

## App users and audit trail
Everyone picks their name when they open the tracker (App users page). The first person to connect becomes an Admin; others pick themselves from the list or add themselves (an Admin can turn self-adding off). Every record stores who created it and who last edited it, and the change history records the name per save. Viewer-role users open read-only. Roles are a convenience, not security: anyone who can write to the share folder can edit the data file.

## Campus lab list
Import > Lab list creates buildings and empty labs from a CSV (Building, Room, Lab name, Department, Equipment, Notes) or from the built-in West Chester University campus list (wcupa.edu Technology Fee "Campus Computer Labs" page, last updated 12/5/23).

## Automatic replacement projects
The Projects page creates a Planned project for every lab that is overdue or due within the horizon (default 12 months, adjustable or switchable off on that page). Amounts follow the replacement plan until you move the project past Planned. Projects use fixed ids per lab and fiscal year, so two people opening the tracker at once don't create duplicates; a deleted auto project isn't re-created.

## Tech Fee: replacements vs projects
- **Tech Fee replacement** = routine lifecycle refresh paid by the Tech Fee. Set the hardware line's planned funding to "Tech fee replacement"; it flows through the replacement plan, auto-created replacement projects and the funding reports.
- **Tech Fee project** = a new initiative proposed for Tech Fee money. Tracked on the Tech Fee projects page (Idea > Proposal drafted > Submitted > Under review > Approved > Funded > In progress > Complete, or Denied / On hold) with requested / awarded / spent amounts, affected labs, decision and report-due dates.

## Automation (runs on load, on remote changes and on the Projects page)
- Replacement projects are created from the plan (see above).
- Project status follows dates: quote > Quoting, PO # > PO issued, past delivery date > Delivered, past install start > Installing, past install end > Complete. It only moves forward and never touches "On hold".
- When a project reaches Complete, the lab's due hardware lines are marked replaced (date = install end), history is kept, the PO and funding are copied, and the warranty date is cleared. An optional "Replacement model" on the project switches the lines to that model.
- Board cards show notice status with a one-click email to the lab's contacts; the dashboard flags projects whose lab hasn't been emailed.
- Devices are re-linked to labs by name automatically (hand-assigned devices are left alone); labs with no baseline get the only baseline for their platform.
- The dashboard "needs attention" list adds stalled projects, Tech Fee reports due, proposals waiting on a decision, and devices missing a Lenovo/Apple warranty date.

## Pilot, lab managers, finance and cleanup
- **Shared-folder pilot:** Settings > Data safety > health check now has an **IT setup note** download (permissions, files created, backup, limits) and a **Two-computer save test** (20 locked updates each from two computers at once; reports lost updates if the lock fails). Run it on your real share before relying on multi-user saving.
- **My labs:** users with the **Lab manager** role (linked to a contact on App users) see only their labs, devices and applications and press "Everything is correct" or "Send changes". That records a confirmation; they can't edit anything else.
- **Projects:** quote / PO / invoice links per project; the dashboard flags a PO with no quote and a completed project with no invoice. After a delivery date is set, an install window (default 10 days, adjustable on the Projects page) is placed outside blackout dates automatically.
- **Reports > Scenarios & rollover:** saved lifecycle scenarios compared with budget, and carry-forward of unspent money per funding source (Tech Fee projects use awarded and spent).
- **Reports > Cleanup:** duplicate labs (same building + room), devices (same serial) and models (same name ignoring punctuation) with one-click merge, plus orphaned records.
- **Lab sheet:** a printable one-page summary with a verification column, from each lab page.
- **tools/:** `Register-NightlyExport.ps1` schedules the Intune export; Mosyle and LabStats scheduled pulls are not provided because their API details weren't verified (see tools/README.md).
