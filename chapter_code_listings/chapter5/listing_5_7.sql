--listing 5.7
WITH dates AS (
    SELECT '2021-12--01' AS dt
    UNION ALL 
    SELECT '2021-12--02' AS dt
    UNION ALL 
    SELECT '2021-12--03' AS dt
    UNION ALL 
    SELECT '2021-12--04' AS dt
    UNION ALL 
    SELECT '2021-12--05' AS dt
)
SELECT TRY_CAST(SUBSTRING(dt, 1, 4) || '-' || 
				SUBSTRING(dt, 6, 2) || '-' || 
				SUBSTRING(dt, 10, 2) AS DATE) AS date_field 
FROM dates;
