-- =============================================================
-- CRON JOB: Streak Reminders (chạy mỗi giờ)
-- =============================================================
-- 
-- HƯỚNG DẪN SETUP TRÊN SUPABASE DASHBOARD:
--
-- Bước 1: Enable extensions
--   → Dashboard → Database → Extensions
--   → Tìm "pg_cron" → Enable
--   → Tìm "pg_net" → Enable
--
-- Bước 2: Chạy SQL bên dưới trong SQL Editor
--   → Dashboard → SQL Editor → New Query → Paste → Run
--
-- Bước 3: Thay thế 2 giá trị:
--   - 'https://YOUR_PROJECT_REF.supabase.co' → URL project của bạn
--   - 'YOUR_STREAK_REMINDER_SECRET' → secret giống env STREAK_REMINDER_SECRET
--
-- Bước 4: Kiểm tra cron đã chạy
--   → Dashboard → Database → Extensions → pg_cron → View Jobs
--   Hoặc chạy: SELECT * FROM cron.job;
--
-- Bước 5: Xem log chạy
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- =============================================================

-- Xoá job cũ nếu có (để chạy lại migration an toàn)
SELECT cron.unschedule('streak-reminders-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'streak-reminders-hourly');

-- Tạo cron job: chạy mỗi giờ tại phút 0
SELECT cron.schedule(
  'streak-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://potsgsuutnmhnybjkdpb.supabase.co/functions/v1/send-streak-reminders',
    headers := '{"Content-Type": "application/json", "x-streak-secret": "Pxd6kZFRgAJ3gS1Ex8lcOzDNK8XSaugJBGqp6gPjtpUIySbyi3p0ioLMDKLLbd+x"}'::jsonb,
    body := '{"force": false}'::jsonb
  );
  $$
);
