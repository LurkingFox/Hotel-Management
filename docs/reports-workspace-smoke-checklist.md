# Reports Workspace Smoke Checklist

Use this checklist after changing the reports experience under `/admin/reports`.

## Preconditions

- Build is passing with `npm run build`
- App is running locally with an authenticated admin session available
- Hotel settings include branding if PDF identity needs verification

## Core Routes

- Outlook: `/admin/reports?mode=outlook`
- Export studio: `/admin/reports?mode=export`

## Outlook Checks

1. Open `/admin/reports?mode=outlook` while signed in as an admin user.
2. Confirm the hero reads as the outlook workspace rather than a generic reports page.
3. Confirm the summary panel headline reads `What needs attention in this range`.
4. Confirm the filter rail uses outlook language:
   - `Outlook filters`
   - `Included lanes`
   - `Apply outlook filters`
5. Use each dashboard trend-card deep link and confirm it lands in outlook mode with the category filter preserved.
6. Change date preset, grouping, scope, and categories; apply filters and confirm `mode=outlook` remains in the URL.
7. Refresh the page and confirm the same mode and filters persist.

## Export Studio Checks

1. Open `/admin/reports?mode=export` while signed in as an admin user.
2. Confirm the hero reads as `Export studio`.
3. Confirm the summary panel headline reads `What is ready for circulation`.
4. Confirm the filter rail uses export language:
   - `Export filters`
   - `Included sheets`
   - `Apply export filters`
5. Confirm the PDF action is visible in the header and in the export notes card.
6. Change date preset, grouping, scope, and categories; apply filters and confirm `mode=export` remains in the URL.
7. Refresh the page and confirm the same mode and filters persist.

## Workspace Switching Checks

1. Start in outlook mode and switch to export studio using the workspace toggle.
2. Confirm the route changes to `mode=export` without dropping active filters.
3. Switch back to outlook and confirm the route changes to `mode=outlook` without dropping active filters.

## PDF Checks

1. In export studio, click `Download PDF pack` or `Generate PDF pack`.
2. Confirm a file downloads successfully.
3. Confirm the filename reflects the report title and selected date range.
4. Open the PDF and verify:
   - hotel identity is present
   - cover summary renders
   - decision-support metrics render
   - pressure-watch content renders
   - category outlook pages render
   - unified ledger pages render
5. Repeat once with a narrow filter set and once with broader categories selected.

## Empty and Edge States

1. Apply filters that produce little or no activity.
2. Confirm the workspace stays usable and shows an explicit no-activity state.
3. Confirm PDF generation is disabled or behaves safely when no operations match.
4. Switch to `scope=staff` without a selected staff member and confirm the UI blocks invalid filter application.

## Regression Checks

1. Open `/admin/dashboard` and use the reports command action.
2. Confirm it opens export studio directly.
3. Open the occupancy, payments, and request trend cards from the dashboard.
4. Confirm each lands in outlook mode with its expected category filter.
5. Open admin navigation and confirm both entries are present:
   - `Reports outlook`
   - `Export studio`

## Pass Criteria

- Mode stays stable across navigation, filtering, and refresh
- Dashboard and nav links enter the intended workspace
- Export studio produces a readable PDF without runtime errors
- Outlook remains focused on live operational review instead of print workflow