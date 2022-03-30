# Chapter 6: Query Performance
In this chapter we're going to talk about query performance, aka how to make your queries run faster. Why do we care about making queries run faster? Faster queries get you results faster, while consuming fewer resources, making them cheaper on modern data warehouses.

This chapter isn't only about speed. You can make your queries run really fast with a few clever hacks, but that might make your code unreadable and unmaintainable. We need to strike a balance between the performance, accuracy and maintainability.

## Reducing Rows
The most important pattern that improves query performance is reducing data as much as possible before you join it.

What does that mean?

So far we've learned that decomposing (aka breaking down) a query via CTEs is the best way to tackle complex queries. But what kinds of operations should your perform in the CTE? We've already seen aggregation and calculation of metrics that can be used later. One of the best uses for CTEs is filtering.

You might have noticed this little snipped in every CTE:
```sql
WHERE
	TRUE
	AND creation_date >= '2021-06-01' 
	AND creation_date <= '2021-09-30'
```

What we're doing here is filtering each table to only 90 days so we can both to keep costs down and make the query faster. This is what I mean by reducing the dataset before joining.

In this case we actually only want to work with 90 days worth of data. if we needed all historical data, we couldn't reduce it beforehand and we'd have to work with the full table. 

Let's look at some implications of this pattern.

**Don't use functions in WHERE**
In case you didn't know, you can put anything in the where clause. You already know about filtering on dates, numbers and strings of course but you can also filter calculations, functions, `CASE` statements, etc.

Here's a rule of thumb when it comes to making queries faster. Always try to make the `wHERE` clause simple. Compare a column to another column or to a fixed value and avoid using functions.

When you use compare a column to a fixed value or to another column, the query optimizer can filter down to the relevant rows much faster. When you use a function or a complicated formula, the optimizer needs to scan the entire table to do the filtering. This is negligible for small tables but when dealing with millions of rows query performance will suffer.

Let's see some examples:

The `tags` column in both questions and answers is a collection of strings separated by `|` character as you see here:
```sql
SELECT 
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    bigquery-public-data.stackoverflow.posts_questions q
WHERE
    TRUE
    AND creation_date >= '2021-06-01' 
    AND creation_date <= '2021-09-30'
LIMIT 10
```

Here's the output:
```sql

post_id |creation_date          |tags                                      |
--------+-----------------------+------------------------------------------+
67781287|2021-05-31 20:00:59.663|python|selenium|screen-scraping|thesaurus |
67781291|2021-05-31 20:01:48.593|python                                    |
67781295|2021-05-31 20:02:38.043|html|css|bootstrap-4                      |
67781298|2021-05-31 20:03:01.413|xpages|lotus-domino                       |
67781300|2021-05-31 20:03:12.987|bash|awk|sed                              |
67781306|2021-05-31 20:03:54.117|c                                         |
67781310|2021-05-31 20:04:33.980|php|html|navbar                           |
67781313|2021-05-31 20:04:57.957|java|spring|dependencies                  |
67781314|2021-05-31 20:05:12.723|python|qml|kde                            |
67781315|2021-05-31 20:05:15.703|javascript|reactjs|redux|react-router|    |
```

The tags pertain to the list of topics or subjects that a post is about. One of the tricky things about storing tags like this is that you don't have to worry about the order in which they appear. There's no categorization system here. A tag can appear anywhere in the string.

How would you go about filtering all the posts that are about SQL? Since the tag `|sql|` can appear anywhere in the string, you'll need a way to search the entire string. One way to do that is to use the `INSTR()` function like this:
```sql
SELECT 
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    bigquery-public-data.stackoverflow.posts_questions q
WHERE
    TRUE
    AND creation_date >= '2021-06-01' 
    AND creation_date <= '2021-09-30'
    AND INSTR(tags, "|sql|") > 0
LIMIT 10
```

Here's the output:
```sql

post_id |creation_date          |tags                           |
--------+-----------------------+-------------------------------+
67941534|2021-06-11 13:55:08.693|mysql|sql|database|datatable   |
67810767|2021-06-02 14:40:44.110|mysql|sql|sqlite               |
67814136|2021-06-02 20:55:41.193|mysql|sql|where-clause         |
67849335|2021-06-05 07:58:09.493|php|mysql|sql|double|var-dump  |
68074104|2021-06-21 16:08:25.487|php|sql|postgresql|mdb2        |
67920305|2021-06-10 07:32:21.393|python|sql|pandas|pyodbc       |
68015950|2021-06-17 04:47:27.713|c#|sql|.net|forms|easy-modbus  |
68058413|2021-06-20 13:28:00.980|java|sql|spring|kotlin|jpa     |
68060567|2021-06-20 18:39:04.150|mysql|sql|ruby-on-rails|graphql|
68103046|2021-06-23 11:40:56.087|php|mysql|sql|stored-procedures|
```

This should be pretty simple to understand. We're searching for the sub-string `|sql|` anywhere in the `tags` column. The `INSTR()` searches for a sub-string within a string and returns the position of the character where it's found. Since we don't care about that, we only care that it's found our condition is > 0.

This is a very typical example of using functions in the `WHERE` clause. This particular query might be fast but in general this pattern is not advised. So what can you do instead?

Use the `LIKE` keyword to look for patterns. Many query optimizers perform much better with `LIKE` then with using a function:
```sql
SELECT 
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    bigquery-public-data.stackoverflow.posts_questions q
WHERE
    TRUE
    AND creation_date >= '2021-06-01' 
    AND creation_date <= '2021-09-30'
    AND tags LIKE "%|sql|%"
LIMIT 10
```

Here's the output:
```sql

post_id |creation_date          |tags                           |
--------+-----------------------+-------------------------------+
67941534|2021-06-11 13:55:08.693|mysql|sql|database|datatable   |
67810767|2021-06-02 14:40:44.110|mysql|sql|sqlite               |
67814136|2021-06-02 20:55:41.193|mysql|sql|where-clause         |
67849335|2021-06-05 07:58:09.493|php|mysql|sql|double|var-dump  |
68074104|2021-06-21 16:08:25.487|php|sql|postgresql|mdb2        |
67920305|2021-06-10 07:32:21.393|python|sql|pandas|pyodbc       |
68015950|2021-06-17 04:47:27.713|c#|sql|.net|forms|easy-modbus  |
68058413|2021-06-20 13:28:00.980|java|sql|spring|kotlin|jpa     |
68060567|2021-06-20 18:39:04.150|mysql|sql|ruby-on-rails|graphql|
68103046|2021-06-23 11:40:56.087|php|mysql|sql|stored-procedures|
```

## Reducing Columns
Almost every book or course will tell you to start exploring a table by doing:
```sql
SELECT *
FROM bigquery-public-data.stackoverflow.posts_questions
LIMIT 10
```

This may be ok in a traditional RDBMS, but with modern data warehouses things are different. Because they store data in columns vs rows `SELECT *` will scan the entire table and your query will be slower.

In addition to that, in BigQuery you get charged by how many bytes of a table you scan. Doing a `SELECT *` on a very large table will be just as expensive if you return 10 rows or 10 million rows.

By selecting only the columns you need you ensure that your query is as efficient as it needs to be.

Here's an example you've seen before. In the `post_activity` CTE we select only the `id` column which is the only one we need to join with `post_activity` on. The `post_type` is a static value which is negligible when it comes to performance.
```sql
-- code snippet will not run
,post_types AS (
    SELECT
		id AS post_id,
        'question' AS post_type,
    FROM
        bigquery-public-data.stackoverflow.posts_questions
    WHERE
        TRUE
    	AND creation_date >= '2021-06-01' 
    	AND creation_date <= '2021-09-30'
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        bigquery-public-data.stackoverflow.posts_answers
    WHERE
        TRUE
    	AND creation_date >= '2021-06-01' 
    	AND creation_date <= '2021-09-30'
 )
 ```

## Premature Ordering
As a rule of thumb you should leave ordering until the very end, if it is at all necessary. Sorting data is generally an expensive operation in databases so it should be reserved for when you really need it. Window functions for example sometimes necessitate ordering. We'll cover them in chapter 8.

If you know that your data will be used by a business intelligence tool like Looker or Tableau then you should leave the ordering up to the tool itself so the user can sort data any way they see fit.

For example, the following is unnecessary and slows down performance because the query is inside a CTE. You don't need to sort your data yet.
```sql
-- code snippet will not run
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
    	AND v.creation_date >= '2021-06-01' 
    	AND v.creation_date <= '2021-09-30'
	GROUP BY
        1,2
    ORDER BY
	    v.creation_date
)
```

## Bounded Time Windows
Many analytical queries need to go back a certain number of days/weeks/months in order to calculate trend-based metrics. These are known as "lookback windows." You specify a period of time to look back (e.g. 30 days ago, 90 days ago, a week ago, etc) and you aggregate data to today's date.

If you don't specify a bounded or sliding time window, your query performance will get worse over time as more data is considered.

What makes this problem hard to detect is that initially your query could be very fast at first. Since there isn't a lot of data in the table performance doesn't suffer. As data gets added to the table however your query will start to get slower.

Let's take the above example to illustrate. In this query I'm specifying a fixed time window, from Jun 1st to Sep 30th. No matter how big the table gets, my query performance will remain the same.
```sql
-- code snippet will not run
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
	AND v.creation_date >= '2021-06-01' 
	AND v.creation_date <= '2021-09-30'
GROUP BY
	1,2
ORDER BY
	v.creation_date
```

A more common pattern is the sliding time window where the period under consideration is always fixed but it's dynamically based on when it's being run.
```sql
-- code snippet will not run
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
	AND v.creation_date >= DATE_ADD(CURRENT_DATE(), INTERVAL -90 DAY)
GROUP BY
	1,2
ORDER BY
	v.creation_date
```

As you can see, the query is always looking at the last 90 days worth of data but the specific days it's looking into are not fixed. If you run it today, the results will be different from yesterday.

Let's now change this slightly and see what happens:
```sql
-- code snippet will not run
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
	AND v.creation_date >= CAST('2021-12-15' as TIMESTAMP) 
GROUP BY
	1,2
ORDER BY
	v.creation_date
```

This query is also looking at the last 90 days worth of data but unlike the query above, the lower boundary is fixed. This query's performance will get worse over time.

That wraps up query performance. There's a lot more to learn about improving query performance but that's not the purpose of this book. In the next chapter we'll cover how to make your queries robust against unexpected changes in the underlying data.
