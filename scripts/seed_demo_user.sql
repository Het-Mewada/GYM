DO $$
DECLARE
  v_uid UUID;
  v_gid UUID;
BEGIN
  SELECT id INTO v_uid FROM users WHERE phone = '+919999999999';
  IF v_uid IS NULL THEN
    INSERT INTO users (phone, password_hash, full_name, email)
    VALUES ('+919999999999', '$argon2id$v=19$m=65536,t=3,p=4$dQgKcEdL2DOdUZxIQspfIw$CSYOZojirOk7JIvjS5oLKv/34K947cvbHqftDMh3TRE', 'Demo Gym Owner', 'owner@demo.gym')
    RETURNING id INTO v_uid;
    
    PERFORM set_config('app.user_id', v_uid::text, false);
    SELECT provision_gym(v_uid, 'Iron Fitness Club', 'iron-fitness-demo', 'IN', 'Asia/Kolkata', 'INR', 0) INTO v_gid;
    
    PERFORM set_config('app.gym_id', v_gid::text, false);
    INSERT INTO members (gym_id, member_number, first_name, last_name, phone, email, status)
    VALUES (v_gid, 'MEM-00001', 'Suresh', 'Kumar', '+919876543210', 'suresh@example.com', 'active'),
           (v_gid, 'MEM-00002', 'Priya', 'Sharma', '+919876500002', 'priya@example.com', 'active'),
           (v_gid, 'MEM-00003', 'Ramesh', 'Patel', '+919876500003', 'ramesh@example.com', 'inactive');

    UPDATE member_sequences SET last_member_number = 3 WHERE gym_id = v_gid;
  ELSE
    SELECT gym_id INTO v_gid FROM user_gym_memberships WHERE user_id = v_uid LIMIT 1;
    IF v_gid IS NOT NULL THEN
      UPDATE member_sequences SET last_member_number = GREATEST(last_member_number, 3) WHERE gym_id = v_gid;
    END IF;
    UPDATE users SET password_hash = '$argon2id$v=19$m=65536,t=3,p=4$dQgKcEdL2DOdUZxIQspfIw$CSYOZojirOk7JIvjS5oLKv/34K947cvbHqftDMh3TRE' WHERE id = v_uid;
  END IF;
END $$;
