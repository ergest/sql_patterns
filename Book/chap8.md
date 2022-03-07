# Chapter 8: Miscellaneous Patterns

## Window Functions
Duplicate rows are the biggest nuisance in the field of data. That's because as we saw in Chapter 2, when you join duplicate rows, your counts get multiplied. Unless you can fix the underlying data, dealing with duplicates is something you'll have to do often.

We've already seen a pattern for doing this through aggregation using `GROUP BY` so here I'll cover another pattern which often comes up in other situations as well. This pattern uses the `ROW_NUMER()` window function, which creates an index for each row and allows you to choose the lowest/highest value.

## Appending Data
You can combine the rows from multiple tables in order to make a longer table by simply appending the rows from one table by using the `UNION` operator.

For example we can combine two of the posts tables like this:
```sql
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
 ```

There are two types of unions, `UNION ALL` and `UNION` (distinct) 

`UNION ALL` will append two tables without checking if they have the same exact row. This might cause duplicates but it's really fast. If you know for sure your tables don't contain duplicates, this is the preferred way to append them. 

`UNION` (distinct) will append the tables but remove all duplicates from the final result thus guaranteeing unique rows for the final result set. This of course is slower because of the extra operations to remove duplicates. Use this only when you're not sure if the tables contain duplicates or you cannot remove duplicates beforehand.

Most SQL flavors only use `UNION` keyword for the distinct version, but BigQuery forces you to use `UNION DISTINCT` in order to make the query far more explicit

Appending rows to a table also has two requirements:
1. The number of the columns from all tables has to be the same
2. The data types of the columns from all the tables has to line up 

One of the most annoying things when appending two or more tables with a lot of columns is lining up all the columns in the right order. There's been many a time when I've had to use Excel to line up the columns. There's no shame in admitting that.

As a rule of thumb, whenever you're appending tables, it's a good idea to add a constant column to indicate the source table or some kind of type. This is helpful when appending say activity tables to create a long, time-series table and you want to identify each activity type in the final result set.

You'll notice in my query above I create a `post_type` column indicating where the data is coming from.

## Accidental Inner Join
Did you know that SQL will ignore a `LEFT JOIN` clause and perform an `INNER JOIN` instead if you make this one simple mistake? This is one of those SQL hidden secrets which sometimes gets asked as a trick question in interviews so strap in.

When doing a `LEFT JOIN` you're intending to show all the results on the table in the `FROM` clause but if you need to limit

Let's take a look at the example query from above:
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	bigquery-public-data.stackoverflow.post_history ph
	INNER JOIN bigquery-public-data.stackoverflow.users u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

This query will produce 58 rows. Now let's change the `INNER JOIN` to a `LEFT JOIN`and rerun the query:
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	bigquery-public-data.stackoverflow.post_history ph
	LEFT JOIN bigquery-public-data.stackoverflow.users u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

Now we get 72 rows!! If you scan the results, you'll notice several where both the `user_name` and the `user_id` are `NULL` which means they're unknown. These could be people who made changes to that post and then deleted their accounts. Notice how the `INNER JOIN` was filtering them out? That's what I mean by data reduction which we discussed previously.

Suppose we only want to see users with a reputation of higher than 50. That's seems pretty straightforward just add the condition to the where clause
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	bigquery-public-data.stackoverflow.post_history ph
	LEFT JOIN bigquery-public-data.stackoverflow.users u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
	AND u.reputation > 50
ORDER BY
	activity_date;
```

We only get 56 rows! What happened?

Adding filters on the where clause for tables that are left joined will ALWAYS perform an `INNER JOIN` except for one single condition where the left join is preserved. If we wanted to filter rows in the `users` table and still do a `LEFT JOIN`  we have to add the filter in the join condition like so:
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	bigquery-public-data.stackoverflow.post_history ph
	LEFT JOIN bigquery-public-data.stackoverflow.users u ON u.id = ph.user_id
	AND u.reputation > 50		
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

The ONLY time when putting a condition in the `WHERE` clause does NOT turn a `LEFT JOIN` into an `INNER JOIN` is when checking for `NULL`. This is very useful when you want to see the missing data on the table that's being left joined. Here's an example
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	bigquery-public-data.stackoverflow.post_history ph
	LEFT JOIN bigquery-public-data.stackoverflow.users u ON u.id = ph.user_id	
WHERE
	TRUE
	AND ph.post_id = 4
	AND u.id is NULL
ORDER BY
	activity_date;
```
Now we only get the 12 missing users

