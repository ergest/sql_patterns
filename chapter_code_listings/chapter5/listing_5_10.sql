--listing 5.10
SELECT
    id,
    post_id,
    post_history_type_id,
    revision_guid,
    user_id,
    COALESCE(m.activity_type, 'unknown') AS activity_type,
    COALESCE(m.grouped_activity_type, 'unknown') AS grouped_activity_type,
    COALESCE(creation_date, '1900-01-01') AS creation_date,
    COALESCE(text, 'unknown') AS text,
    COALESCE(comment, 'unknown') AS comment
FROM
    {{ ref('post_history') }} ph
    LEFT JOIN {{ ref('post_history_type_mapping') }} m
        ON ph.post_history_type_id = m.post_history_type_id
