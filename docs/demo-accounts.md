# Demo Accounts

The role-account seed creates one active account for every current system role
and one client account. It is idempotent: rerunning it refreshes the demo
passwords and restores the intended single active role without deleting history.

Run:

```powershell
$env:DEMO_ROLE_PASSWORD="<shared-staff-demo-password>"
$env:DEMO_SUPER_ADMIN_PASSWORD="<separate-super-admin-password>"
$env:DEMO_CLIENT_PASSWORD="<client-demo-password>"
npm run seed:demo-roles
```

| Role code | Demo email | Department |
|---|---|---|
| `super_admin` | `demo.super-admin@altheka.example` | Executive |
| `new_clients_manager` | `demo.clients-manager@altheka.example` | New clients |
| `litigation_manager` | `demo.litigation-manager@altheka.example` | Litigation |
| `litigation_secretary` | `demo.litigation-secretary@altheka.example` | Litigation |
| `lawyer` | `demo.lawyer@altheka.example` | Litigation |
| `legal_specialist` | `demo.legal-specialist@altheka.example` | Litigation |
| `estates_manager` | `demo.estates-manager@altheka.example` | Estates |
| `estates_secretary` | `demo.estates-secretary@altheka.example` | Estates |
| `accountant` | `demo.accountant@altheka.example` | Finance |
| `executive_manager` | `demo.executive-manager@altheka.example` | Executive |
| Client account | `demo.client@altheka.example` | Client portal |

Demo accounts are for controlled presentations only. Rotate or disable them
before production use, especially the demo Super Admin.
