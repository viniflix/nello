-- Wave 15 follow-up: direct row updates must obey the same date contract as the refund RPC.
create or replace function private.guard_financial_cash_dates()
returns trigger language plpgsql set search_path = pg_catalog, public
as $function$
begin
  if new.status in ('paid', 'refunded') and
     (new.paid_at is null or new.paid_at > current_date) then
    raise exception 'FINANCIAL_INVALID_PAYMENT_DATE';
  end if;
  if new.status = 'refunded' and
     (new.refunded_at is null or new.refunded_at < new.paid_at or new.refunded_at > current_date) then
    raise exception 'FINANCIAL_INVALID_REFUND_DATE';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_financial_cash_dates on public.financial_transactions;
create trigger trg_guard_financial_cash_dates after insert or update
on public.financial_transactions for each row execute function private.guard_financial_cash_dates();
