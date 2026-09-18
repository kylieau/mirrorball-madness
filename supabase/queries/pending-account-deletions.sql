-- Pending account deletion requests.
-- Super-admins also see this queue at /admin/accounts.
-- This does not delete auth users, profiles, or league history.
select
  p.id,
  p.display_name,
  u.email,
  p.deletion_requested_at
from public.profiles p
join auth.users u on u.id = p.id
where p.deletion_requested_at is not null
order by p.deletion_requested_at;
