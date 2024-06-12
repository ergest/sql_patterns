--listing 5.8
WITH dates AS (
    SELECT '2021-12--01' AS dt
    UNION ALL 
    SELECT '2021-12--02' AS dt
    UNION ALL 
    SELECT '2021-12--03' AS dt
    UNION ALL 
    SELECT '12/04/2021' AS dt
    UNION ALL 
    SELECT '12/05/2021' AS dt
)
SELECT TRY_CAST(CASE WHEN dt LIKE '%-%--%'
	            THEN SUBSTRING(dt, 1, 4) || '-' ||
					 SUBSTRING(dt, 6, 2) || '-' ||
					 SUBSTRING(dt, 10, 2)
	            WHEN dt LIKE '%/%/%'
	            THEN SUBSTRING(dt, 7, 4) || '-' ||
					 SUBSTRING(dt, 1, 2) || '-' ||
					 SUBSTRING(dt, 4, 2)
	            END AS DATE) AS date_field 
FROM dates;