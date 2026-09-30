ALTER TABLE public.glycemia_records ADD CONSTRAINT glycemia_records_value_range_check CHECK (value BETWEEN 20 AND 600);
