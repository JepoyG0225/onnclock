-- Consolidate Backlog into each company's To Do without deleting tasks.
DO $$
DECLARE source_row RECORD; target_id TEXT;
BEGIN
  FOR source_row IN SELECT * FROM task_statuses WHERE lower(trim(name)) = 'backlog' FOR UPDATE LOOP
    SELECT id INTO target_id FROM task_statuses
      WHERE "companyId" = source_row."companyId" AND lower(trim(name)) = 'to do'
      ORDER BY "order", id LIMIT 1;
    IF target_id IS NULL THEN
      UPDATE task_statuses SET name = 'To Do', category = 'TODO', color = '#3b82f6', "updatedAt" = NOW() WHERE id = source_row.id;
    ELSE
      UPDATE tasks SET "statusId" = target_id, "updatedAt" = NOW()
        WHERE "companyId" = source_row."companyId" AND "statusId" = source_row.id;
      IF source_row."isDefault" THEN
        UPDATE task_statuses SET "isDefault" = true, "updatedAt" = NOW() WHERE id = target_id;
      END IF;
      DELETE FROM task_statuses WHERE id = source_row.id;
    END IF;
  END LOOP;
END $$;
