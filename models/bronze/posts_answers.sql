{{
  config(materialized = 'table')
}}
SELECT *
FROM read_parquet('parquet_files/posts_answers_*.parquet')