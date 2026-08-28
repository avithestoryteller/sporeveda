UPDATE public.bags b
SET bag_code = ba.batch_code || '-' || lpad(LEAST(b.bag_number, 99)::text, 2, '0'),
    bag_number = LEAST(b.bag_number, 99)
FROM public.batches ba
WHERE ba.id = b.batch_id
  AND b.bag_code IS DISTINCT FROM ba.batch_code || '-' || lpad(LEAST(b.bag_number, 99)::text, 2, '0');