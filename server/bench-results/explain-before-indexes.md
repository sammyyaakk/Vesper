# EXPLAIN ANALYZE: before-indexes (2026-09-27T17:08:34.815Z)

## tasks of a project, page 1

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE "public"."Task"."projectId" = $1 ORDER BY "public"."Task"."createdAt" DESC, "public"."Task"."id" DESC LIMIT $2 OFFSET $3
```

```
Limit  (cost=3278.57..3278.70 rows=51 width=459) (actual time=5.493..5.500 rows=51 loops=1)
  Buffers: shared hit=2542
  ->  Sort  (cost=3278.57..3284.34 rows=2307 width=459) (actual time=5.490..5.495 rows=51 loops=1)
        Sort Key: "createdAt" DESC, id DESC
        Sort Method: top-N heapsort  Memory: 71kB
        Buffers: shared hit=2542
        ->  Seq Scan on "Task"  (cost=0.00..3201.61 rows=2307 width=459) (actual time=0.011..4.794 rows=2307 loops=1)
              Filter: ("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text)
              Rows Removed by Filter: 47693
              Buffers: shared hit=2542
Planning Time: 0.059 ms
Execution Time: 5.565 ms
```

## tasks of a project, after row 2,000

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE ("public"."Task"."projectId" = $1 AND (("public"."Task"."createdAt" = (SELECT "public"."Task"."createdAt" FROM "public"."Task" WHERE ("public"."Task"."id") = ($2)) AND "public"."Task"."id" <= (SELECT "public"."Task"."id" FROM "public"."Task" WHERE ("public"."Task"."id") = ($3))) OR ("public"."Task"."createdAt" < (SELECT "public"."Task"."createdAt" FROM "public"."Task" WHERE ("public"."Task"."id") = ($4))))) ORDER BY "public"."Task"."createdAt" DESC, "public"."Task"."id" DESC LIMIT $5 OFFSET $6
```

```
Limit  (cost=3600.60..3600.73 rows=51 width=459) (actual time=5.677..5.687 rows=51 loops=1)
  Buffers: shared hit=2554
  InitPlan 1
    ->  Index Scan using "Task_pkey" on "Task" "Task_1"  (cost=0.41..8.43 rows=1 width=8) (actual time=0.017..0.018 rows=1 loops=1)
          Index Cond: (id = 'a0a59fe9-ea4f-459f-aa9d-a1330b652945'::text)
          Buffers: shared hit=4
  InitPlan 2
    ->  Index Only Scan using "Task_pkey" on "Task" "Task_2"  (cost=0.41..4.43 rows=1 width=37) (actual time=0.021..0.022 rows=1 loops=1)
          Index Cond: (id = 'a0a59fe9-ea4f-459f-aa9d-a1330b652945'::text)
          Heap Fetches: 0
          Buffers: shared hit=4
  InitPlan 3
    ->  Index Scan using "Task_pkey" on "Task" "Task_3"  (cost=0.41..8.43 rows=1 width=8) (actual time=0.006..0.006 rows=1 loops=1)
          Index Cond: (id = 'a0a59fe9-ea4f-459f-aa9d-a1330b652945'::text)
          Buffers: shared hit=4
  ->  Sort  (cost=3579.30..3581.22 rows=769 width=459) (actual time=5.675..5.680 rows=52 loops=1)
        Sort Key: "Task"."createdAt" DESC, "Task".id DESC
        Sort Method: top-N heapsort  Memory: 74kB
        Buffers: shared hit=2554
        ->  Seq Scan on "Task"  (cost=0.00..3553.53 rows=769 width=459) (actual time=0.046..5.519 rows=308 loops=1)
              Filter: (("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text) AND ((("createdAt" = (InitPlan 1).col1) AND (id <= (InitPlan 2).col1)) OR ("createdAt" < (InitPlan 3).col1)))
              Rows Removed by Filter: 49692
              Buffers: shared hit=2554
Planning Time: 0.156 ms
Execution Time: 5.781 ms
```

## tasks of a project, assignee = me

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE ("public"."Task"."projectId" = $1 AND "public"."Task"."assigneeId" = $2) ORDER BY "public"."Task"."createdAt" DESC, "public"."Task"."id" DESC LIMIT $3 OFFSET $4
```

```
Limit  (cost=3293.09..3293.16 rows=28 width=459) (actual time=5.158..5.167 rows=51 loops=1)
  Buffers: shared hit=2542
  ->  Sort  (cost=3293.09..3293.16 rows=28 width=459) (actual time=5.157..5.162 rows=51 loops=1)
        Sort Key: "createdAt" DESC, id DESC
        Sort Method: quicksort  Memory: 73kB
        Buffers: shared hit=2542
        ->  Seq Scan on "Task"  (cost=0.00..3292.42 rows=28 width=459) (actual time=0.024..5.079 rows=87 loops=1)
              Filter: (("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text) AND ("assigneeId" = 'org_bench_main_user_7'::text))
              Rows Removed by Filter: 49913
              Buffers: shared hit=2542
Planning Time: 0.063 ms
Execution Time: 5.226 ms
```

## comments of a task, page 1

```sql
SELECT "public"."Comment"."id", "public"."Comment"."content", "public"."Comment"."userId", "public"."Comment"."taskId", "public"."Comment"."createdAt" FROM "public"."Comment" WHERE "public"."Comment"."taskId" = $1 ORDER BY "public"."Comment"."createdAt" ASC, "public"."Comment"."id" ASC LIMIT $2 OFFSET $3
```

```
Limit  (cost=4158.01..4158.02 rows=2 width=202) (actual time=5.988..5.990 rows=2 loops=1)
  Buffers: shared hit=2908
  ->  Sort  (cost=4158.01..4158.02 rows=2 width=202) (actual time=5.986..5.987 rows=2 loops=1)
        Sort Key: "createdAt", id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=2908
        ->  Seq Scan on "Comment"  (cost=0.00..4158.00 rows=2 width=202) (actual time=4.430..5.974 rows=2 loops=1)
              Filter: ("taskId" = '5f398ab6-2bb6-43ca-bb00-e708d1e9b0d2'::text)
              Rows Removed by Filter: 99998
              Buffers: shared hit=2908
Planning Time: 0.068 ms
Execution Time: 6.033 ms
```

## project members by project (access checks, includes)

```sql
SELECT "public"."ProjectMember"."id", "public"."ProjectMember"."userId", "public"."ProjectMember"."projectId" FROM "public"."ProjectMember" WHERE "public"."ProjectMember"."projectId" = $1 OFFSET $2
```

```
Seq Scan on "ProjectMember"  (cost=0.00..15.59 rows=24 width=96) (actual time=0.028..0.040 rows=24 loops=1)
  Filter: ("projectId" = 'f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed'::text)
  Rows Removed by Filter: 503
  Buffers: shared hit=9
Planning Time: 0.051 ms
Execution Time: 0.049 ms
```

## projects visible to a member

```sql
SELECT "public"."Project"."id", "public"."Project"."name", "public"."Project"."description", "public"."Project"."priority"::text, "public"."Project"."status"::text, "public"."Project"."start_date", "public"."Project"."end_date", "public"."Project"."team_lead", "public"."Project"."workspaceId", "public"."Project"."createdAt", "public"."Project"."updatedAt" FROM "public"."Project" WHERE ("public"."Project"."workspaceId" = $1 AND ("public"."Project"."team_lead" = $2 OR EXISTS(SELECT "t0"."projectId" FROM "public"."ProjectMember" AS "t0" WHERE ("t0"."userId" = $3 AND ("public"."Project"."id") = ("t0"."projectId") AND "t0"."projectId" IS NOT NULL)))) OFFSET $4
```

```
Seq Scan on "Project"  (cost=0.00..233.78 rows=10 width=210) (actual time=0.030..0.035 rows=7 loops=1)
  Filter: (("workspaceId" = 'org_bench_main'::text) AND ((team_lead = 'org_bench_main_user_7'::text) OR (ANY (id = (hashed SubPlan 2).col1))))
  Rows Removed by Filter: 21
  Buffers: shared hit=7
  SubPlan 2
    ->  Bitmap Heap Scan on "ProjectMember" t0  (cost=4.33..13.72 rows=7 width=37) (actual time=0.015..0.018 rows=7 loops=1)
          Recheck Cond: ("userId" = 'org_bench_main_user_7'::text)
          Heap Blocks: exact=4
          Buffers: shared hit=6
          ->  Bitmap Index Scan on "ProjectMember_userId_projectId_key"  (cost=0.00..4.33 rows=7 width=0) (actual time=0.011..0.011 rows=7 loops=1)
                Index Cond: ("userId" = 'org_bench_main_user_7'::text)
                Buffers: shared hit=2
Planning Time: 0.081 ms
Execution Time: 0.074 ms
```

## task counts per project (GROUP BY)

```sql
SELECT COUNT(*) AS "_count$_all", "public"."Task"."projectId", "public"."Task"."status"::text FROM "public"."Task" WHERE "public"."Task"."projectId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) GROUP BY "public"."Task"."projectId", "public"."Task"."status" OFFSET $21
```

```
HashAggregate  (cost=3629.38..3630.64 rows=84 width=81) (actual time=13.133..13.145 rows=60 loops=1)
  Group Key: "projectId", status
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=2542
  ->  Seq Scan on "Task"  (cost=0.05..3292.05 rows=44977 width=41) (actual time=0.011..6.642 rows=45000 loops=1)
        Filter: ("projectId" = ANY ('{3c3a7be6-8351-4ebd-b920-f22dd3b4e138,f6ade75e-911f-48b5-9b35-41bd733e574a,9fca74f4-32d0-4304-9b01-b4993d0ac7b7,de7c38d9-deb0-4ead-a0ea-57c8ae205742,c2b898a7-ea8c-4af0-933d-b8b7e0cb4018,3c93fa94-bc20-4c9c-96c2-b87ad3012d2a,619753fc-8665-4c37-bd17-8d940ebabdec,7d5695b3-9948-404d-b107-d54840b0b5b3,8487e96a-0b48-491e-bd9f-8846a7b7097f,2edc8ff2-23d8-4eda-86b0-7b44a4173095,7474c282-45cb-4c82-81da-28719880dfdd,110006c1-0b63-47bd-a6d1-5958b55b8428,0ed21406-f9f3-4a6d-8883-28eabcf2ac46,f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed,2ed046ff-e5ed-4bd9-95bd-e84d8946db6e,4cef2a21-2aab-4d23-b258-81cddd13747a,53932cad-ea22-49c5-ab2d-040839e22c91,305929cc-bd6f-4f57-bb8d-2fccacc49dd5,bd11f5f2-d9c2-411f-998e-37ae5ea04d27,54210546-8f89-42ff-a54c-dbaa20f854d9}'::text[]))
        Rows Removed by Filter: 5000
        Buffers: shared hit=2542
Planning:
  Buffers: shared hit=2
Planning Time: 0.123 ms
Execution Time: 13.193 ms
```

## summary: overdue count

```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."Task"."id" FROM "public"."Task" WHERE ("public"."Task"."projectId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) AND "public"."Task"."status" <> CAST($21::text AS "public"."TaskStatus") AND "public"."Task"."due_date" < $22) OFFSET $23) AS "sub"
```

```
Aggregate  (cost=3980.64..3980.65 rows=1 width=8) (actual time=10.548..10.549 rows=1 loops=1)
  Buffers: shared hit=2542
  ->  Seq Scan on "Task"  (cost=0.05..3792.05 rows=15087 width=32) (actual time=0.011..10.015 rows=15076 loops=1)
        Filter: ((due_date < '2026-09-27 17:08:34.921+00'::timestamp with time zone) AND ("projectId" = ANY ('{3c3a7be6-8351-4ebd-b920-f22dd3b4e138,f6ade75e-911f-48b5-9b35-41bd733e574a,9fca74f4-32d0-4304-9b01-b4993d0ac7b7,de7c38d9-deb0-4ead-a0ea-57c8ae205742,c2b898a7-ea8c-4af0-933d-b8b7e0cb4018,3c93fa94-bc20-4c9c-96c2-b87ad3012d2a,619753fc-8665-4c37-bd17-8d940ebabdec,7d5695b3-9948-404d-b107-d54840b0b5b3,8487e96a-0b48-491e-bd9f-8846a7b7097f,2edc8ff2-23d8-4eda-86b0-7b44a4173095,7474c282-45cb-4c82-81da-28719880dfdd,110006c1-0b63-47bd-a6d1-5958b55b8428,0ed21406-f9f3-4a6d-8883-28eabcf2ac46,f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed,2ed046ff-e5ed-4bd9-95bd-e84d8946db6e,4cef2a21-2aab-4d23-b258-81cddd13747a,53932cad-ea22-49c5-ab2d-040839e22c91,305929cc-bd6f-4f57-bb8d-2fccacc49dd5,bd11f5f2-d9c2-411f-998e-37ae5ea04d27,54210546-8f89-42ff-a54c-dbaa20f854d9}'::text[])) AND (status <> ('DONE'::cstring)::"TaskStatus"))
        Rows Removed by Filter: 34924
        Buffers: shared hit=2542
Planning:
  Buffers: shared hit=3
Planning Time: 0.204 ms
Execution Time: 10.571 ms
```

## summary: my open tasks (count)

```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."Task"."id" FROM "public"."Task" WHERE ("public"."Task"."projectId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) AND "public"."Task"."status" <> CAST($21::text AS "public"."TaskStatus") AND "public"."Task"."assigneeId" = $22) OFFSET $23) AS "sub"
```

```
Aggregate  (cost=3796.62..3796.64 rows=1 width=8) (actual time=5.299..5.301 rows=1 loops=1)
  Buffers: shared hit=2542
  ->  Seq Scan on "Task"  (cost=0.05..3792.05 rows=366 width=32) (actual time=0.039..5.275 rows=381 loops=1)
        Filter: (("assigneeId" = 'org_bench_main_user_7'::text) AND ("projectId" = ANY ('{3c3a7be6-8351-4ebd-b920-f22dd3b4e138,f6ade75e-911f-48b5-9b35-41bd733e574a,9fca74f4-32d0-4304-9b01-b4993d0ac7b7,de7c38d9-deb0-4ead-a0ea-57c8ae205742,c2b898a7-ea8c-4af0-933d-b8b7e0cb4018,3c93fa94-bc20-4c9c-96c2-b87ad3012d2a,619753fc-8665-4c37-bd17-8d940ebabdec,7d5695b3-9948-404d-b107-d54840b0b5b3,8487e96a-0b48-491e-bd9f-8846a7b7097f,2edc8ff2-23d8-4eda-86b0-7b44a4173095,7474c282-45cb-4c82-81da-28719880dfdd,110006c1-0b63-47bd-a6d1-5958b55b8428,0ed21406-f9f3-4a6d-8883-28eabcf2ac46,f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed,2ed046ff-e5ed-4bd9-95bd-e84d8946db6e,4cef2a21-2aab-4d23-b258-81cddd13747a,53932cad-ea22-49c5-ab2d-040839e22c91,305929cc-bd6f-4f57-bb8d-2fccacc49dd5,bd11f5f2-d9c2-411f-998e-37ae5ea04d27,54210546-8f89-42ff-a54c-dbaa20f854d9}'::text[])) AND (status <> ('DONE'::cstring)::"TaskStatus"))
        Rows Removed by Filter: 49619
        Buffers: shared hit=2542
Planning Time: 0.111 ms
Execution Time: 5.329 ms
```

## summary: my open tasks (top 10 by due date)

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE ("public"."Task"."projectId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) AND "public"."Task"."status" <> CAST($21::text AS "public"."TaskStatus") AND "public"."Task"."assigneeId" = $22) ORDER BY "public"."Task"."due_date" ASC LIMIT $23 OFFSET $24
```

```
Limit  (cost=3805.45..3805.47 rows=10 width=459) (actual time=5.643..5.646 rows=10 loops=1)
  Buffers: shared hit=2542
  ->  Sort  (cost=3805.45..3806.36 rows=366 width=459) (actual time=5.641..5.643 rows=10 loops=1)
        Sort Key: due_date
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=2542
        ->  Seq Scan on "Task"  (cost=0.05..3797.54 rows=366 width=459) (actual time=0.015..5.513 rows=381 loops=1)
              Filter: (("assigneeId" = 'org_bench_main_user_7'::text) AND ("projectId" = ANY ('{3c3a7be6-8351-4ebd-b920-f22dd3b4e138,f6ade75e-911f-48b5-9b35-41bd733e574a,9fca74f4-32d0-4304-9b01-b4993d0ac7b7,de7c38d9-deb0-4ead-a0ea-57c8ae205742,c2b898a7-ea8c-4af0-933d-b8b7e0cb4018,3c93fa94-bc20-4c9c-96c2-b87ad3012d2a,619753fc-8665-4c37-bd17-8d940ebabdec,7d5695b3-9948-404d-b107-d54840b0b5b3,8487e96a-0b48-491e-bd9f-8846a7b7097f,2edc8ff2-23d8-4eda-86b0-7b44a4173095,7474c282-45cb-4c82-81da-28719880dfdd,110006c1-0b63-47bd-a6d1-5958b55b8428,0ed21406-f9f3-4a6d-8883-28eabcf2ac46,f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed,2ed046ff-e5ed-4bd9-95bd-e84d8946db6e,4cef2a21-2aab-4d23-b258-81cddd13747a,53932cad-ea22-49c5-ab2d-040839e22c91,305929cc-bd6f-4f57-bb8d-2fccacc49dd5,bd11f5f2-d9c2-411f-998e-37ae5ea04d27,54210546-8f89-42ff-a54c-dbaa20f854d9}'::text[])) AND (status <> ('DONE'::cstring)::"TaskStatus"))
              Rows Removed by Filter: 49619
              Buffers: shared hit=2542
Planning Time: 0.232 ms
Execution Time: 5.701 ms
```

## summary: recently updated (top 10)

```sql
SELECT "public"."Task"."id", "public"."Task"."projectId", "public"."Task"."title", "public"."Task"."description", "public"."Task"."status"::text, "public"."Task"."type"::text, "public"."Task"."priority"::text, "public"."Task"."assigneeId", "public"."Task"."due_date", "public"."Task"."createdAt", "public"."Task"."updatedAt" FROM "public"."Task" WHERE "public"."Task"."projectId" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) ORDER BY "public"."Task"."updatedAt" DESC LIMIT $21 OFFSET $22
```

```
Limit  (cost=4938.64..4938.67 rows=10 width=459) (actual time=29.407..29.410 rows=10 loops=1)
  Buffers: shared hit=2542
  ->  Sort  (cost=4938.64..5051.08 rows=44977 width=459) (actual time=29.405..29.406 rows=10 loops=1)
        Sort Key: "updatedAt" DESC
        Sort Method: top-N heapsort  Memory: 29kB
        Buffers: shared hit=2542
        ->  Seq Scan on "Task"  (cost=0.05..3966.70 rows=44977 width=459) (actual time=0.018..17.837 rows=45000 loops=1)
              Filter: ("projectId" = ANY ('{3c3a7be6-8351-4ebd-b920-f22dd3b4e138,f6ade75e-911f-48b5-9b35-41bd733e574a,9fca74f4-32d0-4304-9b01-b4993d0ac7b7,de7c38d9-deb0-4ead-a0ea-57c8ae205742,c2b898a7-ea8c-4af0-933d-b8b7e0cb4018,3c93fa94-bc20-4c9c-96c2-b87ad3012d2a,619753fc-8665-4c37-bd17-8d940ebabdec,7d5695b3-9948-404d-b107-d54840b0b5b3,8487e96a-0b48-491e-bd9f-8846a7b7097f,2edc8ff2-23d8-4eda-86b0-7b44a4173095,7474c282-45cb-4c82-81da-28719880dfdd,110006c1-0b63-47bd-a6d1-5958b55b8428,0ed21406-f9f3-4a6d-8883-28eabcf2ac46,f2d15f3c-2c57-40cf-bf7d-0d8531fb9eed,2ed046ff-e5ed-4bd9-95bd-e84d8946db6e,4cef2a21-2aab-4d23-b258-81cddd13747a,53932cad-ea22-49c5-ab2d-040839e22c91,305929cc-bd6f-4f57-bb8d-2fccacc49dd5,bd11f5f2-d9c2-411f-998e-37ae5ea04d27,54210546-8f89-42ff-a54c-dbaa20f854d9}'::text[]))
              Rows Removed by Filter: 5000
              Buffers: shared hit=2542
Planning Time: 0.126 ms
Execution Time: 29.477 ms
```
