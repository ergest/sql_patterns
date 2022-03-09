# Chapter 6: Query Performance

The query performance principle states that your queries should as fast as possible while still accurate. 

It’s not just about speed. Yes it’s important to have reports that execute in seconds, but these days performance is directly tied to cost, whether through compute resources spent to run the query or the overall amount of data scanned so performance considerations are directly tied to your bottom line.

As we continue building up our complex query, we now need to solve the second sub-problem, dealing with comments. If you recall from the ER diagram chapter, the `comments` table contains a log of all the comments on a post by a user on a given date so its granularity is also one row per user, per post, per date.

In order to calculate user level metrics from this table we'll need to split up the work into a couple of CTEs, one to get comments by a user on a given date and the other to get comments on a user's post on a given date.

Here's a snippet that explains the approach: (this won't run by itself btw because of the CTE reference)

```sql
, comments_by_user AS (
    SELECT
        user_id,
        CAST(DATE_TRUNC(creation_date, DAY) AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        bigquery-public-data.stackoverflow.comments
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
	GROUP BY
        1,2
)
, comments_on_user_post AS (
	SELECT
        pa.user_id,
        CAST(DATE_TRUNC(c.creation_date, DAY) AS DATE) AS activity_date,
        COUNT(*) as total_comments_on_post
    FROM
        bigquery-public-data.stackoverflow.comments c
        INNER JOIN post_activity pa ON pa.post_id = c.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
    	AND c.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND c.creation_date <= CAST('2021-09-30' as TIMESTAMP)
	GROUP BY
        1,2
)
```

Throughout the book we've been using a pattern for improving query performance that I'll highlight now, but you'll soon notice in all the other pieces of code.

In every CTE, I'm adding the condition
```
AND c.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
AND c.creation_date <= CAST('2021-09-30' as TIMESTAMP)
```

This condition filters data to only 3 months from the entire history and demonstrates one of the core principles of query performance:

### Reducing Data Pattern
By reducing the number of rows you're accessing upfront in a CTE, you ensure that the final result is smaller and the query runs faster.

For example the following two queries are technically equivalent in that you'll get the same exact result
```sql
WITH comments_by_user AS (
    SELECT
        user_id,
        CAST(DATE_TRUNC(creation_date, DAY) AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        bigquery-public-data.stackoverflow.comments
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
	GROUP BY
        1,2
)
SELECT *
FROM comments_by_user 
WHERE user_id = 16366214
```

```sql
WITH comments_by_user AS (
    SELECT
        user_id,
        CAST(DATE_TRUNC(creation_date, DAY) AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        bigquery-public-data.stackoverflow.comments
	GROUP BY
        1,2
)
SELECT *
FROM comments_by_user 
WHERE user_id = 16366214
```

However in the second query, if I were to join that CTE with another table or CTE in the query it would join with a much larger table, many more rows which would make the final query really slow.

### SELECT * Antipattern
It’s very tempting to always do `SELECT *` in your queries or CTEs, especially if you don’t know which columns you need later. While this may be ok in a traditional RDBMS, in fact many introduction courses suggest to use this to explore data, cloud warehouse platforms are different.

This means that each column you select increases the amount of data you scan and how much compute resources you use. This in turn directly affects the performance of your queries and your bottom line. Platforms like BigQuery charge based o the amount of data you scan, even if you limit the rows. So a `SELECT * LIMIT 10` will still scan the entire table!

Throughout this book you've seen that my code only selects the columns that I need and restrict the data inside a CTE before I use that CTE in a join. We will continue this pattern while we add the final element to our query, the votes.

You can see here that despite all the columns available in the `post_questions` and `post_answers` tables we only get the `post_id` here since the column `post_type` has a static value and doesn't affect the performance. 
```sql
,post_types AS (
    SELECT
		id AS post_id,
        'question' AS post_type,
    FROM
        bigquery-public-data.stackoverflow.posts_questions
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        bigquery-public-data.stackoverflow.posts_answers
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
 )
 ```
### Premature Ordering Antipattern
So far we've created CTEs for all the post activity and the comments. The only piece remaining is the upvotes and downvotes. The `votes` table is only attached to a post, meaning it only tracks the votes at the post level not the user level. In order to get this at the `user_id, date` level we'll have to join it with the `posts_activity` CTE like this:
```sql
, votes_on_user_post AS (
  	SELECT
        pa.user_id,
        CAST(DATE_TRUNC(v.creation_date, DAY) AS DATE) AS activity_date,
        SUM(CASE WHEN vote_type_id = 2 THEN 1 ELSE 0 END) AS total_upvotes,
        SUM(CASE WHEN vote_type_id = 3 THEN 1 ELSE 0 END) AS total_downvotes,
    FROM
        bigquery-public-data.stackoverflow.votes v
        INNER JOIN post_activity pa ON pa.post_id = v.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
    	AND v.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND v.creation_date <= CAST('2021-09-30' as TIMESTAMP)
	GROUP BY
        1,2
)
```

With this final section in place we can finally write the query that calculates all the metrics:
```

```

You can see we're finally ordering the results by total posts created. We could have been sorting data at any point in the query but it would have been unnecessary and a performance drain. So leave sorting at the very end if absolutely necessary or better yet leave it out and let the reporting tool handle it.

### Functions in WHERE Antipattern