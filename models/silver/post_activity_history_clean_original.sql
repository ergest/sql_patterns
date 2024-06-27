SELECT
    id,
    post_id,
    post_history_type_id,
    revision_guid,
    user_id,
    CASE
	    WHEN post_history_type_id IN (1,2,3) THEN 'create'
        WHEN post_history_type_id IN (4,5,6) THEN 'edit'
        WHEN post_history_type_id IN (7,8,9) THEN 'rollback'
	END AS grouped_activity_type,
	CASE
        WHEN post_history_type_id = 1 THEN 'create_title'
        WHEN post_history_type_id = 2 THEN 'create_body'
        WHEN post_history_type_id = 3 THEN 'create_tags'
        WHEN post_history_type_id = 4 THEN 'edit_title'
        WHEN post_history_type_id = 5 THEN 'edit_body'
        WHEN post_history_type_id = 6 THEN 'edit_tags'
        WHEN post_history_type_id = 10 THEN 'post_closed'
        WHEN post_history_type_id = 11 THEN 'post_reopened'
        WHEN post_history_type_id = 12 THEN 'post_deleted'
        WHEN post_history_type_id = 13 THEN 'post_undeleted'
        WHEN post_history_type_id = 14 THEN 'post_locked'
        WHEN post_history_type_id = 15 THEN 'post_unlocked'
        WHEN post_history_type_id = 16 THEN 'community_owned'
        WHEN post_history_type_id = 17 THEN 'post_migrated'
        WHEN post_history_type_id = 18 THEN 'question_merged'
        WHEN post_history_type_id = 19 THEN 'question_protected'
        WHEN post_history_type_id = 20 THEN 'question_unprotected'
        WHEN post_history_type_id = 21 THEN 'post_disassociated'
        WHEN post_history_type_id = 22 THEN 'question_unmerged'
        WHEN post_history_type_id = 24 THEN 'suggested_edit_applied'
        WHEN post_history_type_id = 25 THEN 'post_tweeted'
        WHEN post_history_type_id = 31 THEN 'comment_discussion_moved_to_chat'
        WHEN post_history_type_id = 33 THEN 'post_notice_added'
        WHEN post_history_type_id = 34 THEN 'post_notice_removed'
        WHEN post_history_type_id = 35 THEN 'post_migrated'
        WHEN post_history_type_id = 36 THEN 'post_migrated'
        WHEN post_history_type_id = 37 THEN 'post_merge_source'
        WHEN post_history_type_id = 38 THEN 'post_merge_destination'
        WHEN post_history_type_id = 50 THEN 'bumped_by_community_user'
        WHEN post_history_type_id = 52 THEN 'question_became_hot_network'
        WHEN post_history_type_id = 53 THEN 'question_removed_from_hot_network'
        WHEN post_history_type_id = 66 THEN 'created_from_ask_wizard'
    END AS activity_type,
    COALESCE(creation_date, '1900-01-01') AS creation_date,
    COALESCE(text, 'unknown') AS text,
    COALESCE(comment, 'unknown') AS comment
FROM
    {{ ref('post_history') }}