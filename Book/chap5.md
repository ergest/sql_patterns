# Chapter 6: Query Performance
In this chapter we're going to talk about query performance, aka how to make your queries run faster. Why do we care about making queries run faster? Faster queries get you results faster, of course, but they also consume fewer resources, making them cheaper on modern data warehouses.

This chapter isn't only about speed. You can make your queries run really fast with a few clever hacks, but that might make your code unreadable and unmaintainable. We need to strike a balance between the performance, accuracy and maintainability.

## Reducing Data
The most important pattern that improves query performance is reducing data as much as possible before you join it.

What does that mean?

So far we've learned that decomposing (aka breaking down) a query via CTEs is the best way to tackle complex queries. But what kinds of operations should your perform in the CTE? We've already seen aggregation and calculation of metrics that can be used later. One of the best uses for CTEs is filtering.

You might have noticed this little snipped in every CTE:
```sql
WHERE
	TRUE
	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
```

What we're doing here is filtering each table to just those 90 days in order to reduce the number of rows we have to deal with. We do this both to keep costs down and make the query faster. This is what I mean by reducing the dataset before joining.

In this case we actually only want to work with 90 days worth of data. if we needed all historical data, we couldn't reduce it beforehand and we'd have to work with the full table. Keep this principle in mind though. You never know when it might come up.

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