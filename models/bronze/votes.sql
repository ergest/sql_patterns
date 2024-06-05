{{
  config(materialized = 'table')
}}
SELECT *
FROM read_parquet('parquet_files/votes_*.parquet')