UPDATE attendance_records
SET check_out = check_in + INTERVAL '4 hours',
    hours_worked = 4
WHERE id = '0404d85e-5600-4a4d-9833-df80b82fb57c';