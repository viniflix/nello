-- Wave 15: explicit cash dates. Legacy paid rows use their transaction date as
-- the best available historical payment date; this is visible in the report.
alter table public.financial_transactions
  add column if not exists paid_at date,
  add column if not exists refunded_at date,
  add column if not exists payment_method text,
  add column if not exists fee_percentage numeric,
  add column if not exists net_amount numeric,
  add column if not exists attachment_url text;

alter table public.financial_transactions add constraint financial_transactions_fee_percentage_check
  check (fee_percentage is null or fee_percentage between 0 and 100);

update public.financial_transactions set paid_at = transaction_date
where status = 'paid' and paid_at is null;
update public.financial_transactions set net_amount = amount
where net_amount is null;

alter table public.financial_transactions drop constraint if exists financial_transactions_status_check;
alter table public.financial_transactions add constraint financial_transactions_status_check
  check (status in ('paid','pending','overdue','refunded'));

create or replace function private.stamp_financial_cash_dates()
returns trigger language plpgsql set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'refunded' and to_jsonb(new) <> to_jsonb(old) then
      raise exception 'FINANCIAL_REFUND_IMMUTABLE';
    end if;
    if (old.status = 'refunded' and new.status <> 'refunded') or
       (old.status = 'paid' and new.status in ('pending','overdue')) then
      raise exception 'FINANCIAL_USE_REFUND_FOR_PAID';
    end if;
  end if;
  if new.status = 'paid' then
    if tg_op = 'INSERT' then
      new.paid_at := coalesce(new.paid_at, new.transaction_date);
    elsif old.status <> 'paid' then
      new.paid_at := coalesce(new.paid_at, current_date);
    else
      new.paid_at := coalesce(new.paid_at, old.paid_at, new.transaction_date);
    end if;
    new.refunded_at := null;
  elsif new.status = 'refunded' then
    if tg_op = 'INSERT' then raise exception 'FINANCIAL_REFUND_REQUIRES_PAYMENT'; end if;
    if old.status not in ('paid','refunded') or new.paid_at is null then
      raise exception 'FINANCIAL_REFUND_REQUIRES_PAYMENT';
    end if;
    new.refunded_at := coalesce(new.refunded_at, current_date);
  else
    new.paid_at := null;
    new.refunded_at := null;
  end if;
  new.net_amount := case when new.type = 'income' then
    round(new.amount * (1 - coalesce(new.fee_percentage, 0) / 100), 2)
    else new.amount end;
  return new;
end;
$function$;

drop trigger if exists trg_stamp_financial_cash_dates on public.financial_transactions;
create trigger trg_stamp_financial_cash_dates before insert or update
on public.financial_transactions for each row execute function private.stamp_financial_cash_dates();

create or replace function public.refund_financial_transaction(p_id bigint, p_refunded_at date)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $function$
begin
  if auth.uid() is null then raise exception 'FINANCIAL_AUTH_REQUIRED'; end if;
  if p_refunded_at is null or p_refunded_at > current_date then
    raise exception 'FINANCIAL_INVALID_REFUND_DATE';
  end if;
  update public.financial_transactions set status = 'refunded', refunded_at = p_refunded_at
  where id = p_id and nutritionist_id = auth.uid() and status = 'paid'
    and paid_at <= p_refunded_at;
  if not found then raise exception 'FINANCIAL_PAYMENT_NOT_FOUND'; end if;
end;
$function$;

create or replace function private.guard_paid_financial_delete()
returns trigger language plpgsql set search_path = pg_catalog, public
as $function$
begin
  if auth.uid() is not null and old.status in ('paid','refunded') then
    raise exception 'FINANCIAL_USE_REFUND_FOR_PAID';
  end if;
  return old;
end;
$function$;

drop trigger if exists trg_guard_paid_financial_delete on public.financial_transactions;
create trigger trg_guard_paid_financial_delete before delete on public.financial_transactions
for each row execute function private.guard_paid_financial_delete();

create index if not exists financial_transactions_cash_month_idx
on public.financial_transactions(nutritionist_id, paid_at)
where status in ('paid','refunded');
create index if not exists financial_transactions_refund_month_idx
on public.financial_transactions(nutritionist_id, refunded_at)
where status = 'refunded';

revoke all on function public.refund_financial_transaction(bigint,date) from public, anon;
grant execute on function public.refund_financial_transaction(bigint,date) to authenticated;
