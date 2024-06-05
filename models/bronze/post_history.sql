{{
  config(materialized = 'table')
}}
SELECT *
FROM read_parquet('parquet_files/post_history_*.parquet')