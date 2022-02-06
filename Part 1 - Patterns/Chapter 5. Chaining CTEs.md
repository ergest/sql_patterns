In order to solve the first sub-problem we have to break down the query into small, single-purpose CTEs that can be tested independently. As described in the previous chapter, the first one is about combining the post activity and the post types into a single CTE aggregated at the `user_id, date` level of granularity.

Since we want to apply the SRP to our CTEs, we can create one for each post activity like this:
```
WITH post_created AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        'posted' AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        LEFT JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
    	TRUE 
    	AND ph.post_history_type_id = 1
    	AND user_id > 0 --anything < 0 are automated processes
    	AND user_id IS NOT NULL
    	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
    	1,2,3,4
)
, post_edited AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        'edited' AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        LEFT JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
    	TRUE 
    	AND ph.post_history_type_id = 4
    	AND user_id > 0 --anything < 0 are automated processes
    	AND user_id IS NOT NULL
    	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
    	1,2,3,4

)
```

This is a perfect application of the SRP to CTEs. Each one has a very specific responsibility. But notice how the code for each CTE is 98% the same. This pattern violates the DRY principle.

**Don't Repeat Yourself (DRY)**
The DRY principle states that if you find yourself copy-pasting the same chunk of code in multiple locations, it's probably a good idea to put that code in a single CTE and reference that CTE where it's needed.

We can rewrite the above pattern by using a `CASE WHEN` statement to define the activity type like this:
```
WITH post_activity AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE ph.post_history_type_id
        	WHEN 1 THEN 'created'
        	WHEN 4 THEN 'edited' 
        END AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        INNER JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
    	TRUE 
    	AND ph.post_history_type_id IN (1,4)
    	AND user_id > 0 --exclude automated processes
    	AND user_id IS NOT NULL
    	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
    	1,2,3,4,5
)
SELECT *
FROM post_activity
WHERE user_id = 16366214
ORDER BY activity_date 

post_id |user_id |user_name  |activity_date          |activity_type|
--------+--------+-----------+-----------------------+-------------+
68226767|16366214|Tony Agosta|2021-07-02 10:18:42.410|created      |
68441160|16366214|Tony Agosta|2021-07-19 09:16:57.660|created      |
68469502|16366214|Tony Agosta|2021-07-21 08:29:22.773|created      |
68469502|16366214|Tony Agosta|2021-07-26 07:31:43.513|edited       |
68441160|16366214|Tony Agosta|2021-07-26 07:32:07.387|edited       |
```

By the way
```
CASE field_name
    WHEN value1 THEN 'label1'
    WHEN value2 THEN 'label2'
	WHEN value3 THEN 'label3'
END as column
```
is equivalent to
```
CASE 
	WHEN field_name = value1 THEN 'label1'
    WHEN field_name = value2 THEN 'label2'
    WHEN field_name = value3 THEN 'label3'
END as column
```

The astute reader would have noticed the aggregation pattern to reduce granularity. At this point we still don't know if the user posted a question or an answer but we can get that by chaining this CTE with one that has the post types.

Now that we have the `post_activity` CTE, we need to join it with the questions and answers and then aggregate the activity. 

There are a several ways we can do that.
```
WITH post_activity AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE ph.post_history_type_id
        	WHEN 1 THEN 'created'
        	WHEN 4 THEN 'edited' 
        END AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        INNER JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
    	TRUE 
    	AND ph.post_history_type_id IN (1,4)
    	AND user_id > 0 --exclude automated processes
    	AND user_id IS NOT NULL
    	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
    	1,2,3,4,5
)
,post_types as (
    SELECT
        ph.user_id,
        ph.user_name,
        activity_date,
        activity_type,
        'question' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_questions` p
        INNER JOIN post_activity ph on p.id = ph.post_id
    WHERE
        TRUE
    	AND p.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND p.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    UNION ALL
    SELECT
        ph.user_id,
        ph.user_name,
        activity_date,
        activity_type,
        'answer' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_answers` p
        INNER JOIN post_activity ph on p.id = ph.post_id
    WHERE
        TRUE
    	AND p.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND p.creation_date <= CAST('2021-09-30' as TIMESTAMP)
 )
SELECT *
FROM post_types 
WHERE user_id = 16366214
ORDER BY activity_date

user_id |user_name  |activity_date          |activity_type|post_type|
--------+-----------+-----------------------+-------------+---------+
16366214|Tony Agosta|2021-07-02 10:18:42.410|created      |question |
16366214|Tony Agosta|2021-07-19 09:16:57.660|created      |question |
16366214|Tony Agosta|2021-07-21 08:29:22.773|created      |question |
16366214|Tony Agosta|2021-07-26 07:31:43.513|edited       |question |
16366214|Tony Agosta|2021-07-26 07:32:07.387|edited       |question |
```

Since the schema of both `post_questions` and `post_answers` is identical, we combine them into a single CTE and then we join with `post_activity`. This is a textbook example of **CTE chaining.**

We're not done yet. The granularity of the table 

