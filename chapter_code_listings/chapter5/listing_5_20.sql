--listing 5.19
SELECT REPLACE(REPLACE(TRIM(LOWER('String//}')), '/',''),'}','') = TRIM(LOWER(' string')) AS test;
