--listing 5.20
SELECT
    ph.id AS post_history_id,
    ph.post_id,
    ph.post_history_type_id,
    ph.revision_guid,
    ph.user_id,
    COALESCE(m.activity_type, 'unknown') AS activity_type,
    COALESCE(m.grouped_activity_type, 'unknown') AS grouped_activity_type,
    COALESCE(ph.creation_date, '1900-01-01') AS post_creation_date,
    COALESCE(ph.text, 'unknown') AS post_text,
    COALESCE(ph.comment, 'unknown') AS post_comment
FROM
    post_history ph
    LEFT JOIN post_history_type_mapping m
        ON ph.post_history_type_id = m.post_history_type_id
