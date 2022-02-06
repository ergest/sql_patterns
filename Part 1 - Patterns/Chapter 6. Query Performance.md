The query performance principle states that your queries should as fast as possible while still accurate. 

It’s not just about speed. Yes it’s important to have reports that execute in seconds, but these days performance is directly tied to cost, whether through compute resources spent to run the query or the overall amount of data scanned so performance considerations are directly tied to your bottom line.

As we continue building up our complex query, we now need to solve the second sub-problem, dealing with comments. If you recall from the ER diagram chapter, the `comments` table contains a log of all the comments on a post by a user on a given date so its granularity is also one row per user, per post, per date.

In order to calculate user level metrics from this table we'll need to split up the work into a couple of CTEs, one to get comments by a user on a given date and the other to get comments on a user's post on a given date.

Here's a snippet that explains the approach: (this won't run by itself btw because of the CTE reference)

```
, comments_by_user AS (
    SELECT
        user_id,
        CAST(DATE_TRUNC(creation_date, DAY) AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        `bigquery-public-data.stackoverflow.comments`
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
        `bigquery-public-data.stackoverflow.comments` c
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