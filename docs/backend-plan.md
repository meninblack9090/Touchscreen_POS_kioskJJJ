# Approved implementation plan

Connect the existing UI to Supabase POS koiskJJJJJ. Save completed transactions only; all payments are simulated. Prices and money use integer centavos. Backend checkout is atomic, validates confirmed totals, and is idempotent. Invalid cash stays on payment. QR and card pay the exact total. Render the saved receipt; keep privileged keys off clients and GitHub.

Tasks: (1) database/API and authorization tests, (2) frontend integration and browser tests, (3) deployed integration/security verification, review, documentation, and GitHub push.
