-- Fix admin/warden/student password hashes
UPDATE sentinel.users SET password_hash = (
  CASE roll_number
    WHEN 'ADMIN-001' THEN '$2b$10$1R/Bb/D2ztYlggECx5Q1TO6rD1zaV4YiRStywiNTOyqweLPpIs.aK'
    WHEN 'WAR-001' THEN '$2b$10$SJSkwMwoq9rl5zoaKvVL6uv2zQZdwbFoADa.oAYeGLpB4tpvgHlhS'
    WHEN 'STU-001' THEN '$2b$10$puZJvWuy33NyXpGNHH6EVe6yzZGAaysyTQjgfBsVEGsMVS6hClP9W'
  END
) WHERE roll_number IN ('ADMIN-001', 'WAR-001', 'STU-001');

-- Verify
SELECT roll_number, length(password_hash) as hash_length, password_hash FROM sentinel.users WHERE roll_number IN ('ADMIN-001', 'WAR-001', 'STU-001');
