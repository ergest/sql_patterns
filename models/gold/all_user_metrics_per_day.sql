WITH cte_comments_by_user AS (
    SELECT
        user_id,
        TRY_CAST(creation_date AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        {{ ref('comments_clean') }}
    GROUP BY
        1,2
)
, cte_comments_on_user_post AS (
    SELECT
        pa.user_id,
        TRY_CAST(c.creation_date AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        {{ ref('comments_clean') }} c
        INNER JOIN {{ ref('post_activity_history_clean') }} pa
            ON pa.post_id = c.post_id
    WHERE
        pa.grouped_activity_type = 'create'
    GROUP BY
        1,2
)
, cte_votes_on_user_post AS (
      SELECT
        pa.user_id,
        TRY_CAST(v.creation_date AS DATE) AS activity_date,
        {{- sum_if("vote_type_id = 2", 1) }} AS total_upvotes,
        {{- sum_if("vote_type_id = 3", 1) }} AS total_downvotes
    FROM
        {{ ref('votes_clean') }} v
        INNER JOIN {{ ref('post_activity_history_clean') }} pa
            ON pa.post_id = v.post_id
    WHERE
        pa.grouped_activity_type = 'create'
    GROUP BY
        1,2
)
, cte_all_posts_created_and_edited AS (
    SELECT
        pa.user_id,
        TRY_CAST(pa.creation_date AS DATE) AS activity_date,
        {{- sum_if("pa.grouped_activity_type = 'create' AND pt.post_type = 'question'", 1) }} AS questions_created,
        {{- sum_if("pa.grouped_activity_type = 'create' AND pt.post_type = 'answer'", 1) }} AS answers_created,
        {{- sum_if("pa.grouped_activity_type = 'edit' AND pt.post_type = 'question'", 1) }} AS questions_edited,
        {{- sum_if("pa.grouped_activity_type = 'edit' AND pt.post_type = 'answer'", 1) }} AS answers_edited,
        {{- sum_if("pa.grouped_activity_type = 'create'", 1) }} AS posts_created,
        {{- sum_if("pa.grouped_activity_type = 'create'", 1) }} AS posts_edited
    FROM
        {{ ref('all_post_types_combined') }} pt
        INNER JOIN {{ ref('post_activity_history_clean') }} pa
            ON pt.post_id = pa.post_id
    WHERE
        true
        AND pa.grouped_activity_type in ('create', 'edit')
        AND pt.post_type in ('question', 'answer')
        AND pa.user_id > 0 --exclude automated processes
        AND pa.user_id IS NOT NULL --exclude deleted accounts
    GROUP BY 1,2
)
SELECT
    pce.user_id,
    u.user_name,
    pce.activity_date,
    pce.questions_created,
    pce.answers_created,
    pce.questions_edited,
    pce.answers_edited,
    pce.posts_created,
    pce.posts_edited,
    COALESCE(cbu.total_comments, 0) AS comments_by_user,
    COALESCE(cop.total_comments, 0) AS comments_on_post,
    COALESCE(vop.total_upvotes, 0)  AS total_upvotes,
    COALESCE(vop.total_downvotes, 0) AS total_downvotes
FROM
    cte_all_posts_created_and_edited pce
    JOIN {{ ref('users_clean') }} u
        ON pce.user_id = u.id
    LEFT JOIN cte_comments_by_user cbu
        ON pce.user_id = cbu.user_id
        AND pce.activity_date = cbu.activity_date
    LEFT JOIN cte_comments_on_user_post cop
        ON pce.user_id = cop.user_id
        AND pce.activity_date = cop.activity_date
    LEFT JOIN cte_votes_on_user_post vop
        ON pce.user_id = vop.user_id
        AND pce.activity_date = vop.activity_date
