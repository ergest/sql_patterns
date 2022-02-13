Joining tables is one of the most basic functions in SQL since the databases are designed to minimize redundancy of information and the only to do that is to spread information out into multiple tables. This is called normalization. Joins then allow us to get all the information back in a single piece by combining these tables together.

We've been already looking at joins, and I assume you're familiar with them if you're reading this book. What I wanted to show in this chapter are certain patterns involving joins that always creep up and burn analysts and data scientists.

#### Granularity Multiplication
If any of tables has duplicates for the columns being joined on, the final result set will be multiplied by the number of duplicates.

For example in our case the `users` table has a grain of one row per user:
```
SELECT
	id,
	display_name,
	creation_date ,
	reputation,
	views
FROM `bigquery-public-data.stackoverflow.users`
WHERE id = 8974849;


id     |display_name|creation_date          |reputation|views|
-------+------------+-----------------------+----------+-----+
8974849|neutrino    |2017-11-20 18:16:46.653|       790|  107|
```

Whereas the `post_history` table has multiple rows for the same user:
```
SELECT
	id,
	creation_date,
	post_id,
	post_history_type_id,
	user_id 
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
WHERE
	TRUE
	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
	AND ph.user_id = 8974849;


id       |creation_date          |post_id |post_history_type_id|user_id|
---------+-----------------------+--------+--------------------+-------+
250199272|2021-07-14 00:54:58.127|68372251|                   2|8974849|
250199273|2021-07-14 00:54:58.127|68372251|                   1|8974849|
250199274|2021-07-14 00:54:58.127|68372251|                   3|8974849|
250263915|2021-07-15 00:01:07.497|68387743|                   2|8974849|
250263916|2021-07-15 00:01:07.497|68387743|                   1|8974849|
250263917|2021-07-15 00:01:07.497|68387743|                   3|8974849|
250316277|2021-07-15 16:32:44.163|68400451|                   2|8974849|
```

If we join them on `user_id` the granularity of the final result will be multiplied to have as many rows per user:
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date,
	post_history_type_id
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	INNER JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
	AND ph.user_id = 8974849;

post_id |user_id|user_name|activity_date          |post_history_type_id|
--------+-------+---------+-----------------------+--------------------+
68078326|8974849|neutrino |2021-06-22 02:03:45.830|                   2|
68078326|8974849|neutrino |2021-06-22 02:03:45.830|                   1|
68078326|8974849|neutrino |2021-06-22 02:03:45.830|                   3|
68273785|8974849|neutrino |2021-07-06 11:56:05.827|                   2|
68273785|8974849|neutrino |2021-07-06 11:56:05.827|                   1|
68273785|8974849|neutrino |2021-07-06 11:56:05.827|                   3|
68277148|8974849|neutrino |2021-07-06 16:40:53.003|                   2|
68277148|8974849|neutrino |2021-07-06 16:40:53.003|                   1|
68277148|8974849|neutrino |2021-07-06 16:40:53.003|                   3|
68273785|8974849|neutrino |2021-07-06 12:02:11.913|                   5|
```

So if the history table has 10 entries for the same user and the `users` table has 1, the final result will contain 10 x 1 entries for the same user. If for some reason the `users` contained 2 entries for the same user (messy real world data), we'd see 10 x 2 = 20 entries for that user in the final result.

This is extremely important when doing analysis because a single duplicate row will multiply all your results by a factor of n and all your numbers will be inflated.

#### Start with a LEFT JOIN
Whenever we use `INNER JOIN` the final result is always reduced down to just the matching rows from both tables. This means that if the history table has some strange `user_id` that doesn't exist in the `users` table, they will not show up in the final result. The same happens with the `users` that have no activity in `post_history`

For the purposes of our project, we only want the active users so an `INNER JOIN` is very appropriate here. If we wanted everyone, we'd have to user a `LEFT JOIN` So why am I saying you should start with a `LEFT JOIN`? Get burned too many times and you eventually learn your lesson.

The mantra I keep repeating here is "real world data is messy" There are missing rows, duplicate rows, incorrect types and so on. Unless you know your data well and it's being carefully monitored for these things, you should consider them in your joins.

#### Accidental Inner Join
Did you know that SQL will ignore a `LEFT JOIN` clause and perform an `INNER JOIN` instead if you make this one simple mistake? This is one of those SQL hidden secrets which sometimes gets asked as a trick question in interviews so strap in.

When doing a `LEFT JOIN` you're intending to show all the results on the table in the `FROM` clause but if you need to limit

Let's take a look at the example query from above:
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	INNER JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

This query will produce 58 rows. Now let's change the `INNER JOIN` to a `LEFT JOIN`and rerun the query:
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	LEFT JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

Now we get 72 rows!! If you scan the results, you'll notice several where both the `user_name` and the `user_id` are `NULL` which means they're unknown. These could be people who made changes to that post and then deleted their accounts. Notice how the `INNER JOIN` was filtering them out? That's what I mean by data reduction which we discussed previously.

Suppose we only want to see users with a reputation of higher than 50. That's seems pretty straightforward just add the condition to the where clause
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	LEFT JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
	AND u.reputation > 50
ORDER BY
	activity_date;
```

We only get 56 rows! What happened?

Adding filters on the where clause for tables that are left joined will ALWAYS perform an `INNER JOIN` except for one single condition where the left join is preserved. If we wanted to filter rows in the `users` table and still do a `LEFT JOIN`  we have to add the filter in the join condition like so:
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	LEFT JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id
	AND u.reputation > 50		
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

The ONLY time when putting a condition in the `WHERE` clause does NOT turn a `LEFT JOIN` into an `INNER JOIN` is when checking for `NULL`. This is very useful when you want to see the missing data on the table that's being left joined. Here's an example
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	LEFT JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id	
WHERE
	TRUE
	AND ph.post_id = 4
	AND u.id is NULL
ORDER BY
	activity_date;
```
Now we only get the 12 missing users