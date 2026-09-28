# EXPLAIN ANALYZE: after-indexes (2026-09-27T17:11:51.834Z)

## tasks of a project, page 1

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE "public"."Task"."projectId" = $1 ORDER BY "public"."Task"."createdAt" DESC, "public"."Task"."id" DESC LIMIT $2 OFFSET $3
```

```
Limit  (cost=0.41..144.44 rows=51 width=459) (actual time=0.023..0.083 rows=51 loops=1)
  Buffers: shared hit=56
  ->  Index Scan Backward using "Task_projectId_createdAt_id_idx" on "Task"  (cost=0.41..6642.51 rows=2352 width=459) (actual time=0.022..0.079 rows=51 loops=1)
        Index Cond: ("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text)
        Buffers: shared hit=56
Planning Time: 0.085 ms
Execution Time: 0.111 ms
```

## tasks of a project, after row 2,000 (Prisma cursor)

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE ("public"."Task"."projectId" = $1 AND (("public"."Task"."createdAt" = (SELECT "public"."Task"."createdAt" FROM "public"."Task" WHERE ("public"."Task"."id") = ($2)) AND "public"."Task"."id" <= (SELECT "public"."Task"."id" FROM "public"."Task" WHERE ("public"."Task"."id") = ($3))) OR ("public"."Task"."createdAt" < (SELECT "public"."Task"."createdAt" FROM "public"."Task" WHERE ("public"."Task"."id") = ($4))))) ORDER BY "public"."Task"."createdAt" DESC, "public"."Task"."id" DESC LIMIT $5 OFFSET $6
```

```
Limit  (cost=30.18..461.87 rows=51 width=459) (actual time=1.086..1.126 rows=51 loops=1)
  Buffers: shared hit=2119
  InitPlan 1
    ->  Index Scan using "Task_pkey" on "Task" "Task_1"  (cost=0.41..8.43 rows=1 width=8) (actual time=0.011..0.012 rows=1 loops=1)
          Index Cond: (id = 'a0a59fe9-ea4f-459f-aa9d-a1330b652945'::text)
          Buffers: shared hit=4
  InitPlan 2
    ->  Index Only Scan using "Task_pkey" on "Task" "Task_2"  (cost=0.41..4.43 rows=1 width=37) (actual time=0.019..0.020 rows=1 loops=1)
          Index Cond: (id = 'a0a59fe9-ea4f-459f-aa9d-a1330b652945'::text)
          Heap Fetches: 0
          Buffers: shared hit=4
  InitPlan 3
    ->  Index Scan using "Task_pkey" on "Task" "Task_3"  (cost=0.41..8.43 rows=1 width=8) (actual time=0.006..0.006 rows=1 loops=1)
          Index Cond: (id = 'a0a59fe9-ea4f-459f-aa9d-a1330b652945'::text)
          Buffers: shared hit=4
  ->  Index Scan Backward using "Task_projectId_createdAt_id_idx" on "Task"  (cost=0.41..6636.63 rows=784 width=459) (actual time=1.084..1.120 rows=52 loops=1)
        Index Cond: ("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text)
        Filter: ((("createdAt" = (InitPlan 1).col1) AND (id <= (InitPlan 2).col1)) OR ("createdAt" < (InitPlan 3).col1))
        Rows Removed by Filter: 1999
        Buffers: shared hit=2119
Planning Time: 0.182 ms
Execution Time: 1.187 ms
```

## tasks of a project, after row 2,000 (keyset)

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE ("public"."Task"."projectId" = $1 AND "public"."Task"."createdAt" <= $2 AND ("public"."Task"."createdAt" < $3 OR "public"."Task"."id" < $4)) ORDER BY "public"."Task"."createdAt" DESC, "public"."Task"."id" DESC LIMIT $5 OFFSET $6
```

```
Limit  (cost=0.41..285.79 rows=51 width=459) (actual time=0.040..0.092 rows=51 loops=1)
  Buffers: shared hit=58
  ->  Index Scan Backward using "Task_projectId_createdAt_id_idx" on "Task"  (cost=0.41..1332.19 rows=238 width=459) (actual time=0.039..0.088 rows=51 loops=1)
        Index Cond: (("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text) AND ("createdAt" <= '2025-11-21 16:47:53.951+00'::timestamp with time zone))
        Filter: (("createdAt" < '2025-11-21 16:47:53.951+00'::timestamp with time zone) OR (id < 'a0a59fe9-ea4f-459f-aa9d-a1330b652945'::text))
        Rows Removed by Filter: 1
        Buffers: shared hit=58
Planning:
  Buffers: shared hit=6
Planning Time: 0.145 ms
Execution Time: 0.119 ms
```

## tasks of a project, assignee = me

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE ("public"."Task"."projectId" = $1 AND "public"."Task"."assigneeId" = $2) ORDER BY "public"."Task"."createdAt" DESC, "public"."Task"."id" DESC LIMIT $3 OFFSET $4
```

```
Limit  (cost=155.77..155.84 rows=28 width=459) (actual time=0.477..0.482 rows=51 loops=1)
  Buffers: shared hit=92
  ->  Sort  (cost=155.77..155.84 rows=28 width=459) (actual time=0.476..0.478 rows=51 loops=1)
        Sort Key: "createdAt" DESC, id DESC
        Sort Method: quicksort  Memory: 73kB
        Buffers: shared hit=92
        ->  Bitmap Heap Scan on "Task"  (cost=51.07..155.10 rows=28 width=459) (actual time=0.333..0.428 rows=87 loops=1)
              Recheck Cond: (("assigneeId" = 'org_bench_main_user_7'::text) AND ("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text))
              Heap Blocks: exact=82
              Buffers: shared hit=92
              ->  BitmapAnd  (cost=51.07..51.07 rows=28 width=0) (actual time=0.318..0.319 rows=0 loops=1)
                    Buffers: shared hit=10
                    ->  Bitmap Index Scan on "Task_assigneeId_due_date_idx"  (cost=0.00..20.88 rows=595 width=0) (actual time=0.109..0.109 rows=586 loops=1)
                          Index Cond: ("assigneeId" = 'org_bench_main_user_7'::text)
                          Buffers: shared hit=6
                    ->  Bitmap Index Scan on "Task_projectId_status_idx"  (cost=0.00..29.93 rows=2352 width=0) (actual time=0.178..0.178 rows=2307 loops=1)
                          Index Cond: ("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text)
                          Buffers: shared hit=4
Planning Time: 0.080 ms
Execution Time: 0.543 ms
```

## comments of a task, page 1

```sql
SELECT "public"."Comment"."id", "public"."Comment"."content", "public"."Comment"."userId", "public"."Comment"."taskId", "public"."Comment"."createdAt" FROM "public"."Comment" WHERE "public"."Comment"."taskId" = $1 ORDER BY "public"."Comment"."createdAt" ASC, "public"."Comment"."id" ASC LIMIT $2 OFFSET $3
```

```
Limit  (cost=12.31..12.32 rows=2 width=202) (actual time=0.030..0.031 rows=2 loops=1)
  Buffers: shared hit=4
  ->  Sort  (cost=12.31..12.32 rows=2 width=202) (actual time=0.029..0.029 rows=2 loops=1)
        Sort Key: "createdAt", id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=4
        ->  Bitmap Heap Scan on "Comment"  (cost=4.43..12.30 rows=2 width=202) (actual time=0.019..0.020 rows=2 loops=1)
              Recheck Cond: ("taskId" = '5f398ab6-2bb6-43ca-bb00-e708d1e9b0d2'::text)
              Heap Blocks: exact=1
              Buffers: shared hit=4
              ->  Bitmap Index Scan on "Comment_taskId_createdAt_id_idx"  (cost=0.00..4.43 rows=2 width=0) (actual time=0.012..0.012 rows=2 loops=1)
                    Index Cond: ("taskId" = '5f398ab6-2bb6-43ca-bb00-e708d1e9b0d2'::text)
                    Buffers: shared hit=3
Planning Time: 0.057 ms
Execution Time: 0.075 ms
```

## project members by project (access checks, includes)

```sql
SELECT "public"."ProjectMember"."id", "public"."ProjectMember"."userId", "public"."ProjectMember"."projectId" FROM "public"."ProjectMember" WHERE "public"."ProjectMember"."projectId" = $1 OFFSET $2
```

```
Bitmap Heap Scan on "ProjectMember"  (cost=4.34..13.64 rows=24 width=96) (actual time=0.015..0.017 rows=24 loops=1)
  Recheck Cond: ("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text)
  Heap Blocks: exact=1
  Buffers: shared hit=2
  ->  Bitmap Index Scan on "ProjectMember_projectId_idx"  (cost=0.00..4.33 rows=24 width=0) (actual time=0.009..0.009 rows=24 loops=1)
        Index Cond: ("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text)
        Buffers: shared hit=1
Planning Time: 0.069 ms
Execution Time: 0.064 ms
```

## projects visible to a member

```sql
SELECT "public"."Project"."id", "public"."Project"."name", "public"."Project"."description", "public"."Project"."priority"::text, "public"."Project"."status"::text, "public"."Project"."start_date", "public"."Project"."end_date", "public"."Project"."team_lead", "public"."Project"."workspaceId", "public"."Project"."createdAt", "public"."Project"."updatedAt" FROM "public"."Project" WHERE ("public"."Project"."workspaceId" = $1 AND ("public"."Project"."team_lead" = $2 OR EXISTS(SELECT "t0"."projectId" FROM "public"."ProjectMember" AS "t0" WHERE ("t0"."userId" = $3 AND ("public"."Project"."id") = ("t0"."projectId") AND "t0"."projectId" IS NOT NULL)))) OFFSET $4
```

```
Index Scan using "Project_workspaceId_idx" on "Project"  (cost=0.14..178.54 rows=10 width=210) (actual time=0.043..0.048 rows=7 loops=1)
  Index Cond: ("workspaceId" = 'org_bench_main'::text)
  Filter: ((team_lead = 'org_bench_main_user_7'::text) OR (ANY (id = (hashed SubPlan 2).col1)))
  Rows Removed by Filter: 13
  Buffers: shared hit=8
  SubPlan 2
    ->  Bitmap Heap Scan on "ProjectMember" t0  (cost=4.33..13.72 rows=7 width=37) (actual time=0.014..0.017 rows=7 loops=1)
          Recheck Cond: ("userId" = 'org_bench_main_user_7'::text)
          Heap Blocks: exact=4
          Buffers: shared hit=6
          ->  Bitmap Index Scan on "ProjectMember_userId_projectId_key"  (cost=0.00..4.33 rows=7 width=0) (actual time=0.010..0.010 rows=7 loops=1)
                Index Cond: ("userId" = 'org_bench_main_user_7'::text)
                Buffers: shared hit=2
Planning Time: 0.116 ms
Execution Time: 0.116 ms
```

## task counts per project (GROUP BY)

```sql
SELECT COUNT(*) AS "_count$_all", "public"."Task"."projectId", "public"."Task"."status"::text FROM "public"."Task" WHERE "public"."Task"."projectId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) GROUP BY "public"."Task"."projectId", "public"."Task"."status" OFFSET $21
```

```
GroupAggregate  (cost=0.29..1266.23 rows=84 width=81) (actual time=0.119..5.452 rows=60 loops=1)
  Group Key: "projectId", status
  Buffers: shared hit=52
  ->  Index Only Scan using "Task_projectId_status_idx" on "Task"  (cost=0.29..927.77 rows=44960 width=41) (actual time=0.023..2.164 rows=45000 loops=1)
        Index Cond: ("projectId" = ANY ('{3c3a7be6-8351-4ebd-b920-f22dd3b4e138,f6ade75e-911f-48b5-9b35-41bd733e574a,9fca74f4-32d0-4304-9b01-b4993d0ac7b7,de7c38d9-deb0-4ead-a0ea-57c8ae205742,c2b898a7-ea8c-4af0-933d-b8b7e0cb4018,3c93fa94-bc20-4c9c-96c2-b87ad3012d2a,619753fc-8665-4c37-bd17-8d940ebabdec,7d5695b3-9948-404d-b107-d54840b0b5b3,8487e96a-0b48-491e-bd9f-8846a7b7097f,2edc8ff2-23d8-4eda-86b0-7b44a4173095,7474c282-45cb-4c82-81da-28719880dfdd,110006c1-0b63-47bd-a6d1-5958b55b8428,0ed21406-f9f3-4a6d-8883-28eabcf2ac46,f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed,2ed046ff-e5ed-4bd9-95bd-e84d8946db6e,4cef2a21-2aab-4d23-b258-81cddd13747a,53932cad-ea22-49c5-ab2d-040839e22c91,305929cc-bd6f-4f57-bb8d-2fccacc49dd5,bd11f5f2-d9c2-411f-998e-37ae5ea04d27,54210546-8f89-42ff-a54c-dbaa20f854d9}'::text[]))
        Heap Fetches: 0
        Buffers: shared hit=52
Planning:
  Buffers: shared hit=2
Planning Time: 0.272 ms
Execution Time: 5.504 ms
```

## summary: overdue count

```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."Task"."id" FROM "public"."Task" WHERE ("public"."Task"."projectId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) AND "public"."Task"."status" <> CAST($21::text AS "public"."TaskStatus") AND "public"."Task"."due_date" < $22) OFFSET $23) AS "sub"
```

```
Aggregate  (cost=3979.31..3979.32 rows=1 width=8) (actual time=9.309..9.310 rows=1 loops=1)
  Buffers: shared hit=2542
  ->  Seq Scan on "Task"  (cost=0.05..3792.05 rows=14981 width=32) (actual time=0.010..8.841 rows=15076 loops=1)
        Filter: ((due_date < '2026-09-27 17:11:51.901+00'::timestamp with time zone) AND ("projectId" = ANY ('{3c3a7be6-8351-4ebd-b920-f22dd3b4e138,f6ade75e-911f-48b5-9b35-41bd733e574a,9fca74f4-32d0-4304-9b01-b4993d0ac7b7,de7c38d9-deb0-4ead-a0ea-57c8ae205742,c2b898a7-ea8c-4af0-933d-b8b7e0cb4018,3c93fa94-bc20-4c9c-96c2-b87ad3012d2a,619753fc-8665-4c37-bd17-8d940ebabdec,7d5695b3-9948-404d-b107-d54840b0b5b3,8487e96a-0b48-491e-bd9f-8846a7b7097f,2edc8ff2-23d8-4eda-86b0-7b44a4173095,7474c282-45cb-4c82-81da-28719880dfdd,110006c1-0b63-47bd-a6d1-5958b55b8428,0ed21406-f9f3-4a6d-8883-28eabcf2ac46,f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed,2ed046ff-e5ed-4bd9-95bd-e84d8946db6e,4cef2a21-2aab-4d23-b258-81cddd13747a,53932cad-ea22-49c5-ab2d-040839e22c91,305929cc-bd6f-4f57-bb8d-2fccacc49dd5,bd11f5f2-d9c2-411f-998e-37ae5ea04d27,54210546-8f89-42ff-a54c-dbaa20f854d9}'::text[])) AND (status <> ('DONE'::cstring)::"TaskStatus"))
        Rows Removed by Filter: 34924
        Buffers: shared hit=2542
Planning Time: 0.214 ms
Execution Time: 9.324 ms
```

## summary: my open tasks (count)

```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."Task"."id" FROM "public"."Task" WHERE ("public"."Task"."projectId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) AND "public"."Task"."status" <> CAST($21::text AS "public"."TaskStatus") AND "public"."Task"."assigneeId" = $22) OFFSET $23) AS "sub"
```

```
Aggregate  (cost=1440.15..1440.16 rows=1 width=8) (actual time=0.633..0.634 rows=1 loops=1)
  Buffers: shared hit=520
  ->  Bitmap Heap Scan on "Task"  (cost=21.02..1435.70 rows=356 width=32) (actual time=0.133..0.614 rows=381 loops=1)
        Recheck Cond: ("assigneeId" = 'org_bench_main_user_7'::text)
        Filter: (("projectId" = ANY ('{3c3a7be6-8351-4ebd-b920-f22dd3b4e138,f6ade75e-911f-48b5-9b35-41bd733e574a,9fca74f4-32d0-4304-9b01-b4993d0ac7b7,de7c38d9-deb0-4ead-a0ea-57c8ae205742,c2b898a7-ea8c-4af0-933d-b8b7e0cb4018,3c93fa94-bc20-4c9c-96c2-b87ad3012d2a,619753fc-8665-4c37-bd17-8d940ebabdec,7d5695b3-9948-404d-b107-d54840b0b5b3,8487e96a-0b48-491e-bd9f-8846a7b7097f,2edc8ff2-23d8-4eda-86b0-7b44a4173095,7474c282-45cb-4c82-81da-28719880dfdd,110006c1-0b63-47bd-a6d1-5958b55b8428,0ed21406-f9f3-4a6d-8883-28eabcf2ac46,f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed,2ed046ff-e5ed-4bd9-95bd-e84d8946db6e,4cef2a21-2aab-4d23-b258-81cddd13747a,53932cad-ea22-49c5-ab2d-040839e22c91,305929cc-bd6f-4f57-bb8d-2fccacc49dd5,bd11f5f2-d9c2-411f-998e-37ae5ea04d27,54210546-8f89-42ff-a54c-dbaa20f854d9}'::text[])) AND (status <> ('DONE'::cstring)::"TaskStatus"))
        Rows Removed by Filter: 205
        Heap Blocks: exact=514
        Buffers: shared hit=520
        ->  Bitmap Index Scan on "Task_assigneeId_due_date_idx"  (cost=0.00..20.88 rows=595 width=0) (actual time=0.085..0.085 rows=586 loops=1)
              Index Cond: ("assigneeId" = 'org_bench_main_user_7'::text)
              Buffers: shared hit=6
Planning Time: 0.235 ms
Execution Time: 0.681 ms
```

## summary: my open tasks (top 10 by due date)

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE ("public"."Task"."projectId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) AND "public"."Task"."status" <> CAST($21::text AS "public"."TaskStatus") AND "public"."Task"."assigneeId" = $22) ORDER BY "public"."Task"."due_date" ASC LIMIT $23 OFFSET $24
```

```
Limit  (cost=0.46..59.24 rows=10 width=459) (actual time=0.022..0.039 rows=10 loops=1)
  Buffers: shared hit=19
  ->  Index Scan using "Task_assigneeId_due_date_idx" on "Task"  (cost=0.46..2092.90 rows=356 width=459) (actual time=0.022..0.038 rows=10 loops=1)
        Index Cond: ("assigneeId" = 'org_bench_main_user_7'::text)
        Filter: (("projectId" = ANY ('{3c3a7be6-8351-4ebd-b920-f22dd3b4e138,f6ade75e-911f-48b5-9b35-41bd733e574a,9fca74f4-32d0-4304-9b01-b4993d0ac7b7,de7c38d9-deb0-4ead-a0ea-57c8ae205742,c2b898a7-ea8c-4af0-933d-b8b7e0cb4018,3c93fa94-bc20-4c9c-96c2-b87ad3012d2a,619753fc-8665-4c37-bd17-8d940ebabdec,7d5695b3-9948-404d-b107-d54840b0b5b3,8487e96a-0b48-491e-bd9f-8846a7b7097f,2edc8ff2-23d8-4eda-86b0-7b44a4173095,7474c282-45cb-4c82-81da-28719880dfdd,110006c1-0b63-47bd-a6d1-5958b55b8428,0ed21406-f9f3-4a6d-8883-28eabcf2ac46,f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed,2ed046ff-e5ed-4bd9-95bd-e84d8946db6e,4cef2a21-2aab-4d23-b258-81cddd13747a,53932cad-ea22-49c5-ab2d-040839e22c91,305929cc-bd6f-4f57-bb8d-2fccacc49dd5,bd11f5f2-d9c2-411f-998e-37ae5ea04d27,54210546-8f89-42ff-a54c-dbaa20f854d9}'::text[])) AND (status <> ('DONE'::cstring)::"TaskStatus"))
        Rows Removed by Filter: 6
        Buffers: shared hit=19
Planning Time: 0.101 ms
Execution Time: 0.074 ms
```

## summary: recently updated (top 10)

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE "public"."Task"."projectId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) ORDER BY "public"."Task"."updatedAt" DESC LIMIT $21 OFFSET $22
```

```
Limit  (cost=0.34..1.32 rows=10 width=459) (actual time=0.583..0.589 rows=10 loops=1)
  Buffers: shared hit=321
  ->  Index Scan Backward using "Task_updatedAt_idx" on "Task"  (cost=0.34..4408.23 rows=44960 width=459) (actual time=0.582..0.587 rows=10 loops=1)
        Filter: ("projectId" = ANY ('{3c3a7be6-8351-4ebd-b920-f22dd3b4e138,f6ade75e-911f-48b5-9b35-41bd733e574a,9fca74f4-32d0-4304-9b01-b4993d0ac7b7,de7c38d9-deb0-4ead-a0ea-57c8ae205742,c2b898a7-ea8c-4af0-933d-b8b7e0cb4018,3c93fa94-bc20-4c9c-96c2-b87ad3012d2a,619753fc-8665-4c37-bd17-8d940ebabdec,7d5695b3-9948-404d-b107-d54840b0b5b3,8487e96a-0b48-491e-bd9f-8846a7b7097f,2edc8ff2-23d8-4eda-86b0-7b44a4173095,7474c282-45cb-4c82-81da-28719880dfdd,110006c1-0b63-47bd-a6d1-5958b55b8428,0ed21406-f9f3-4a6d-8883-28eabcf2ac46,f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed,2ed046ff-e5ed-4bd9-95bd-e84d8946db6e,4cef2a21-2aab-4d23-b258-81cddd13747a,53932cad-ea22-49c5-ab2d-040839e22c91,305929cc-bd6f-4f57-bb8d-2fccacc49dd5,bd11f5f2-d9c2-411f-998e-37ae5ea04d27,54210546-8f89-42ff-a54c-dbaa20f854d9}'::text[]))
        Rows Removed by Filter: 5000
        Buffers: shared hit=321
Planning Time: 0.080 ms
Execution Time: 0.605 ms
```
