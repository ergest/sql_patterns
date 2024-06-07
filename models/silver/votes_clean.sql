SELECT
    id,
    post_id,
    vote_type_id,
    COALESCE(creation_date, '1900-01-01') AS creation_date
FROM
    {{ ref('votes') }}
