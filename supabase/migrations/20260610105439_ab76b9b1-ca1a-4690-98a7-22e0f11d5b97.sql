UPDATE public.replacement_workers
SET is_active = true,
    notes = NULL
WHERE id IN (
  '6fa77585-e082-4860-82dc-5aa3eab4c3c6',
  'eed4d990-98aa-4ab3-80f3-9d0843a6e04b',
  '539500ed-e2d8-41c6-86f4-122049a8c3e2'
);