# Safe Alignment v2 Data Snapshot

Captured before migration on 2026-07-29. The post-migration check must preserve
every count and identity hash below. New schema/template rows are excluded from
this legal-data snapshot.

| Data set | Count | Identity hash |
|---|---:|---|
| profiles | 8 | `5262f7bfd277c969d1be9976ebc3ac37` |
| clients | 6 | `0f781022926e349ca7bca7ace1c3d4f6` |
| client_accounts | 6 | `dbeea0092b0c40e5c35fe51956a02aa2` |
| service_requests | 7 | `b66ed8dcc812d4fbc7f9e56bbb8c8676` |
| projects | 3 | `ace17a41342bd12c27ac874ba0478f10` |
| project_members | 3 | `72df2520541f109ddc91fff98cf8ef64` |
| workflow_instances | 2 | `849540092567736e9c0cdc6025698984` |
| documents | 6 | `2e7cb92c78fd5888b53731994bb5a616` |
| document_versions | 6 | `78492dac0211e43b83ecfc57839e3f67` |
| contracts | 2 | `712047b29dbef63935b2eebbf2b3f97f` |
| contract_versions | 2 | `a70367a41ed398c1c226ff5fbaad982f` |
| contract_acceptances | 2 | `873eccf19f45c764aae8d8e8ea64c816` |
| conversations | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| messages | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| estate_details | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| estate_assets | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| legal-documents Storage objects | 6 | `03383aa7e46ee7950c3274169df2b5af` |

Backfill may update only the added `data_version`, `legacy_at`,
`needs_manager_review`, and inferred litigation `department_id` columns. It must
not change the identity hashes or Storage paths above.

Post-migration verification: passed. Every count and identity hash matched.
The database now has 60 permissions; all 7 requests, 3 projects, and 2 active
Workflow Instances are marked `legacy`; the 2 received requests are marked for
manager review. Template v2 action counts are 8/40/93/51 and all four versions
remain `draft`. The private bucket is limited to 25MB and the approved MIME list.

## Live acceptance result

The additive migrations through `20260729125715` were applied to the linked
Supabase project. `supabase db lint --linked --level warning` reported no schema
errors, and the local and remote migration histories match.

The live Arabic E2E flow passed on 2026-07-29:

- a client and the required staff accounts were registered through real Auth;
- staff activation and permission-scoped access were exercised;
- the client was linked to a manager-created request;
- a private document was uploaded, published, downloaded through a 300-second
  signed URL, and withdrawn;
- a litigation assignee submitted the study and the litigation manager approved it;
- the offer, negotiation path, versioned contract acceptance, and conversion to a
  numbered project completed successfully;
- the project received separate client and internal channels and deduplicated
  project membership.

Acceptance-test records are disabled or archived rather than physically deleted,
in line with the MVP retention policy. They are not part of the pre-migration
identity baseline above. Template v2 versions remain `draft`; publishing them is
an explicit operational release action after the remaining confirmation markers
are resolved.
