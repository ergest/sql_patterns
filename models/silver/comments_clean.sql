{{
  config(materialized = 'table')
}}

SELECT
    id,
    post_id,
    user_id,
    COALESCE(text, 'unknown') AS text,
    COALESCE(creation_date, '1900-01-01') AS creation_date,
    COALESCE(user_display_name, 'unknown') AS user_display_name,
    COALESCE(score, 0) AS score
FROM
    {{ ref('comments') }}
