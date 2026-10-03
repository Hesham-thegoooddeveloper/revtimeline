# Approved pending changes

**Implementation hold:** the owner approved these directions but explicitly requested no website changes until instructed. Preparing this repository does not lift that hold.

## Completion editing

When an action is marked completed, gray and lock all date fields except actual completion date. The trigger date remains editable while the action is incomplete. Preserve due and original due dates. This is about date fields, not locking the event description.

## Add controls and hover

Remove plus controls immediately after intermediate nodes. Keep a plus in the middle of each path connection and at the end of a path to add the next event. Retain a usable way to create branches and merges when revising the controls.

Add a short hover delay and improve preview appearance. Improve the overall UI in the next design phase; no redesign has been implemented yet.

## Editable project information

Provide project creation and editing with the following approved field groups:

| Group | Fields |
|---|---|
| Identity | Project name, project reference, customer, customer contact, scope, status |
| Purchase order | PO reference, PO date, currency, project/PO value excluding VAT |
| VAT | Configurable VAT rate supplied by the owner, calculated VAT amount, calculated total including VAT |
| Quantities | Number of PO line items and total quantity of units separately |
| Payment | Multiple milestones with percentages, payment conditions and payment periods; advance payment required, percentage and amount |
| Delivery | Incoterm, named delivery place, edition, project start, contract delivery date and latest expected delivery date |
| Guarantees | Advance payment guarantee required; other bank guarantee type; required/status, reference, issuer, amount, issue date and expiry for each instrument |
| Letter of credit | Required, status, reference, amount, issuing bank and expiry date |
| Notes | Commercial exceptions and document references |

Treat PO value and project value as one amount initially unless approved variations make separate figures necessary. No VAT rate has been supplied; do not silently assume one.

Show a compact overview above the task timelines, with fuller information under Project details. The overview direction was approved using fictitious sample data; sample customers, money values, terms and dates are not real requirements.

## Later milestones

Dependable saving, backup/restore and recovery testing precede critical personal use. Later possibilities include search, attachments, reports, analysis and AI summaries. Multi-user organizations, roles, cross-device access and subscriptions require separate validation and release planning.
