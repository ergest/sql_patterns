{{
  config(materialized = 'table')
}}
SELECT *
FROM read_parquet('parquet_files/comments_*.parquet')