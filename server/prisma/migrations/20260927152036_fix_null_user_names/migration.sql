-- Names were built as first_name + " " + last_name, storing "null" for missing parts
UPDATE "User"
SET "name" = CASE
    WHEN "name" = 'null null' THEN split_part("email", '@', 1)
    WHEN "name" LIKE 'null %' THEN substring("name" FROM 6)
    ELSE left("name", length("name") - 5)
END
WHERE "name" = 'null null' OR "name" LIKE 'null %' OR "name" LIKE '% null';
