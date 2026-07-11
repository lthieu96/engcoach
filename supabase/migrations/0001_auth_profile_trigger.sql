-- Auto-create a profile row on signup. Trigger lives on auth.users, which
-- Drizzle can't model — kept as a custom migration (drizzle-kit generate --custom).
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
--> statement-breakpoint
drop trigger if exists on_auth_user_created on auth.users;
--> statement-breakpoint
create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();
