--listing 5.9
WITH weights AS (
    SELECT '32.5lb' AS wt
    UNION ALL 
    SELECT '45.2lb' AS wt
    UNION ALL 
    SELECT '53.1lb' AS wt
    UNION ALL 
    SELECT '77kg' AS wt
    UNION ALL 
    SELECT '68kg' AS wt
)
SELECT 
	TRY_CAST(CASE WHEN wt LIKE '%lb' THEN SUBSTRING(wt, 1, INSTR(wt, 'lb')-1)
				  WHEN wt LIKE '%kg' THEN SUBSTRING(wt, 1, INSTR(wt, 'kg')-1)
         END AS DECIMAL) AS weight,
	CASE WHEN wt LIKE '%lb' THEN 'LB'
		 WHEN wt LIKE '%kg' THEN 'KG'
	END AS unit
FROM weights;
