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

Notice a couple of things. First of all our code is a lot more compact, easy to read, understand and maintain. Second we're using a `LEFT JOIN` as explained in [Chapter 5](chap5) pattern 3. Also notice how we  assume `NULL` with  `activity_type` and `grouped_activity_type` and `COALESCE()` the input coming from the `LEFT JOIN` in order to protect ourselves.

## Applying Modularity Patterns With DBT
While CTEs provide a great way to decompose a single query into readable and maintainable modules, they don't go far enough. If you wanted to reuse any of them you'd have to manually create views. And when views no longer cut it, due to performance issues, you'd have to materialize them into tables.

Dbt makes both of those options easier while also allowing you to create linkages across models forming a DAG as we saw in [Chapter 3](chap3). ![[Example-Dag-Dag5.drawio.png]]

Let's look at example. We'll take the query from the previous chapter and turn all the CTEs into models.

First let's tackle the `post_types` CTE. 
```sql
    SELECT
        id AS post_id,
        'question' AS post_type,
    FROM
        posts_questions
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        posts_answers
 )
```

The CTE only selects the `post_id` and `post_type` columns but I think this can be a very useful in the future so we create a more comprehensive model that unions all the columns in a single view. To save ourselves from writing boilerplate SQL and cover future cases where new columns are added to the base tables we use the `union_relations()` macro from `dbt-utils`:
```sql
--listing 7.2 all_post_types_combined
{{
  config(materialized = 'view')
}}

{{
    dbt_utils.union_relations(
	    relations=[ref('posts_answers_clean'), ref('posts_questions_clean')]
	)
}}
```

The macro will compile into the appropriate SQL before execution. If you want to see the code (which I won't list here) simply run `dbt compile -m all_post_types_combined` And if you want to see the beautfiul DAG created, just run `dbt docs generate && dbt docs serve`
![[dbt_all_post_types_dag.jpg]]

Ok let's keep going. Next let's take a look at the `post_activity` CTE. Since it's mostly a SELECT from the base table and a join with `users` we don't need a separate model for it. As far as defining the `activity_type` mapping we handled that already in the previous section above.

Next we have the `user_metrics` CTE.
```sql
user_post_metrics AS (
    SELECT
        user_id,
        user_name,
        TRY_CAST(activity_date AS DATE) AS activity_date,
        SUM(CASE WHEN activity_type = 'create' AND post_type = 'question' 
                THEN 1 ELSE 0 END) AS questions_created,
        SUM(CASE WHEN activity_type = 'create' AND post_type = 'answer' 
                THEN 1 ELSE 0 END) AS answers_created,
        SUM(CASE WHEN activity_type = 'edit' AND post_type = 'question'
                THEN 1 ELSE 0 END) AS questions_edited,
        SUM(CASE WHEN activity_type = 'edit' AND post_type = 'answer'
                THEN 1 ELSE 0 END) AS answers_edited,
        SUM(CASE WHEN activity_type = 'create'
                THEN 1 ELSE 0 END) AS posts_created,
        SUM(CASE WHEN activity_type = 'edit'
                THEN 1 ELSE 0 END)  AS posts_edited
    FROM 
        post_types pt
        JOIN post_activity pa ON pt.post_id = pa.post_id
    GROUP BY 1,2,3
```

So what can we do to change this? Take a look at the code below:

```sql
cte_all_posts_created_and_edited AS (
    SELECT
        pa.user_id,
        TRY_CAST(pa.creation_date AS DATE) AS activity_date,
        {{- SUMIF("pa.grouped_activity_type = 'create' 
			        AND pt.post_type = 'question'", 1) }} AS questions_created,
        {{- SUMIF("pa.grouped_activity_type = 'create'
					AND pt.post_type = 'answer'", 1) }} AS answers_created,
        {{- SUMIF("pa.grouped_activity_type = 'edit'
				   AND pt.post_type = 'question'", 1) }} AS questions_edited,
        {{- SUMIF("pa.grouped_activity_type = 'edit'
				   AND pt.post_type = 'answer'", 1) }} AS answers_edited,
        {{- SUMIF("pa.grouped_activity_type = 'create'", 1) }} AS posts_created,
        {{- SUMIF("pa.grouped_activity_type = 'create'", 1) }} AS posts_edited
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
```

We do a few very interesting things here. First notice all that boilerplate SQL with `SUM` and `CASE` statements. This where dbt really shines. We make a custom macro to hide the functionality behind. This is a VERY important pattern unique to dbt.
```sql
{% macro SUMIF(condition, column) %}
    SUM(CASE WHEN {{condition}} THEN {{column}} ELSE 0 END)
{%- endmacro %}
```

## Applying SRP With dbt
At first the macro seems superfluous. Why bother right? In this case it does seem like the macro is not adding any functionality, however by using a macro, we're applying the Single Responsibility Principle. SR allows us to contain the logic in a single file (the macro) so if we ever decide to change all we have to do is change one file.

This macro's logic might be simple, but I've written some very complex macros that have made my code incredibly easy to read, understand and maintain. It's a very good practice and one I unfortunately don't see used very often.

Let's see another example of this pattern. Here's the last part of the code from [Chapter 6](chap6) and we would like to use SRP to implement the `SAFE_DIVIDE()`