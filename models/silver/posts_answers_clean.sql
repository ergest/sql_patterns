{{
  config(materialized = 'table')
}}

SELECT
    id as post_id,
    owner_user_id,
    parent_id,
    post_type_id,
    accepted_answer_id,
    last_editor_user_id,
    'answer' AS post_type,
    COALESCE(title, 'unknown') AS title,
    COALESCE(body, 'unknown') AS body,
    COALESCE(answer_count, 'unknown') AS answer_count,
    COALESCE(comment_count, 0) AS comment_count,
    COALESCE(community_owned_date, '1900-01-01') AS community_owned_date,
    COALESCE(creation_date, '1900-01-01') AS creation_date,
    COALESCE(favorite_count, 'unknown') AS favorite_count,
    COALESCE(last_activity_date, '1900-01-01') AS last_activity_date,
    COALESCE(last_edit_date, '1900-01-01') AS last_edit_date,
    COALESCE(last_editor_display_name, 'unknown') AS last_editor_display_name,
    COALESCE(owner_display_name, 'unknown') AS owner_display_name,
    COALESCE(score, 0) AS score,
    COALESCE(tags, 'unknown') AS tags,
    COALESCE(view_count, 'unknown') AS view_count
FROM
    {{ ref('posts_answers') }}
