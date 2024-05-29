# Chapter 7: DBT Patterns
In this chapter we're going to use all the patterns we've seen to simplify our final query from the project we just saw using dbt. It uses a combination of actual SQL code with Jinja templates to give you much more flexibility in how you develop SQL. 

Dbt makes it really simple to design modular data transformation workflows, which we'll see in a bit, while also offering you *macros* to make your code a lot more portable. What we'll do in this chapter is take the query we completed in [Chapter 6](chap6) and show you how to rewrite it with dbt. I won't go into too much depth on how dbt works, because I don't want to make this a dbt tutorial. You can learn more about it [here](https://docs.getdbt.com/docs/introduction)

## Applying Robustness Patterns
Dbt uses the concept of "models" for modularizing your code. All the models by default live in the `models` folder. In that folder there are two subfolders `raw` and `clean` The first one loads the Stackoverflow tables from parquet files as is without any modifications. We've used those exact tables throughout the book

But the beauty of dbt is that it makes it really easy to create our own custom models while applying the robustness patterns we learned in [Chapter 5](chap5). We can have our own foundational models rather than rely on raw data.

Have a look at this example in the `models/clean` subfolder:
```sql
--model post_history_clean original
{{
  config(materialized = 'table')
}}

SELECT
    id,
    post_id,
    post_history_type_id,
    revision_guid,
    user_id,
    CASE WHEN post_history_type_id IN (1,2,3) THEN 'create'
         WHEN post_history_type_id IN (4,5,6) THEN 'edit'
         WHEN post_history_type_id IN (7,8,9) THEN 'rollback'
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
```

Do you see how we protect ourselves from `NULLs` by using `COALESCE()` liberally? We also handle the mapping of the `post_history_type_id.` There are a lot more types we didn't see before because we didn't have to, but now we can put them all here so we only work with text later. Text descriptions make code more readable and maintainable vs some magic number.

This is fine but do you notice how many times we had to copy paste the same piece of code? Can we do better? With dbt we can. There's a concept in dbt called _seed_ files, which are perfect for this type of mapping. This is basically a CSV file with two columns `post_history_type_id` and `text_description` The file makes it a lot easier to add or update mapping in the future.

Now our code looks like this:
```sql
--model post_history_clean
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
```

Notice a couple of things. First of all our code is a lot more compact, easy to read, understand and maintain. Second we're using a `LEFT JOIN` as explained in [Chapter 5](chap5) pattern 3. Also notice how we  assume `NULL` `COALESCE()` the input coming from the `LEFT JOIN` knowing it might be `NULL` in the future
## Wrapper Patterns
If you look into the `models/