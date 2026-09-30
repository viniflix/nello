ALTER TABLE appointments ADD COLUMN unregistered_patient_name text;
ALTER TABLE appointments ALTER COLUMN patient_id DROP NOT NULL;
