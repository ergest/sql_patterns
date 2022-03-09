# Chapter 5: Query Maintainability
In this chapter we're going to extend the pattern of decomposition into the realm of query maintainability. Breaking down large queries into small pieces doesn't only make them easier to read, write and understand, it also makes them easier to maintain.

## CTE Chaining
Notice how we were able to take a fairly complex problem and break it down into smaller, easier to write, test and understand queries. Each of the queries was in a separate CTE and those CTEs were then joined in a chain.

This pattern of chaining CTEs is the only way you can save yourself a lot of toil and grief when debugging your queries. If your database doesn't support CTEs, that's a shame. They make code so much cleaner.

One final thing I'll add here is that you cannot chain CTEs indefinitely. There's a limit imposed by the system because after a while even these queries start to get too complex. In these cases the solution is usually to materialize portions of the query into intermediary tables.


## DRY Pattern (Don't Repeat Yourself )
In the previous section we saw how we can decompose a large complex query into multiple smaller components which can be chained together to give us the final result. We said that an added benefit to doing this is that it makes the query more readable. In that same vein, the DRY principle ensures that your query is clean from unnecessary repetition.

The DRY principle states that if you find yourself copy-pasting the same chunk of code in multiple locations, it's probably a good idea to put that code in a single CTE and reference that CTE where it's needed.

To illustrate I'll rewrite the query from the previous chapter so that it still produces the same result but it clearly shows repeating code
```sql
WITH post_activity AS (
    SELECT
        ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'created'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edited' 
        END AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        INNER JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
        TRUE 
        AND ph.post_history_type_id BETWEEN 1 AND 6
        AND user_id > 0 --exclude automated processes
        AND user_id IS NOT NULL --exclude deleted accounts
        AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
        1,2,3,4,5
)
, questions AS (
     SELECT
        id AS post_id,
        'question' AS post_type,
        pa.user_id,
        pa.user_name,
        pa.activity_date,
        pa.activity_type
    FROM
        `bigquery-public-data.stackoverflow.posts_questions` q
        INNER JOIN post_activity pa ON q.id = pa.post_id
    WHERE
        TRUE
        AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
)
, answers AS (
     SELECT
        id AS post_id,
        'answer' AS post_type,
        pa.user_id,
        pa.user_name,
        pa.activity_date,
        pa.activity_type
    FROM
        `bigquery-public-data.stackoverflow.posts_answers` q
        INNER JOIN post_activity pa ON q.id = pa.post_id
    WHERE
        TRUE
        AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
)
```

This is definitely another valid solution to our query, if we then calculate the aggregates later on and combine them. The CTEs are small and single purpose, abiding by the modularity principle, however you'll see that most of the code repeats. 

The DRY principle says we should try and remove as much repeating code as possible, and since in our case the question and answer table have the same exact schema, that's a perfect candidate for appending rows.

### Appending Rows Pattern
In the previous section we combined the two posts tables using the `UNION ALL` operator to make a single `post_types` CTE like this:
```sql
post_types as (
    SELECT
		id AS post_id,
        'question' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_questions`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_answers`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
 )
 ```

Let's take a moment to see how this pattern works. Just like a `JOIN` adds columns to a result set the `UNION` operator appends rows to it by combining two or more tables length-wise. There are two types of unions, `UNION ALL` and `UNION` (distinct) 

`UNION ALL` will append two tables without checking if they have the same exact row. This might cause duplicates but it's really fast. If you know for sure your tables don't contain duplicates, as in our case this is the preferred way to append two tables. 

`UNION` (distinct) will append the tables but remove all duplicates from the final result thus guaranteeing unique rows for the final result set. This of course is slower because of the extra operations to remove duplicates. Use this only when you're not sure if the tables contain duplicates or you cannot remove duplicates beforehand.

Most SQL flavors only use `UNION` keyword for the distinct version, but BigQuery forces you to use `UNION DISTINCT` in order to make the query far more explicit

Appending rows to a table also has two requirements:
1. The number of the columns from all tables has to be the same
2. The data types of the columns from all the tables has to line up 

One of the most annoying things when appending two or more tables with a lot of columns is lining up all the columns in the right order. There's been many a time when I've had to use Excel to line up the columns. There's no shame in admitting that.

As a rule of thumb, whenever you're appending tables, it's a good idea to add a constant column to indicate the source table or some kind of type. This is helpful when appending say activity tables to create a long, time-series table and you want to identify each activity type in the final result set.

You'll notice in my query above I create a `post_type` column indicating where the data is coming from.

### Creating Views Pattern
There are many cases where a piece of code can be useful outside of the query you're writing because it encapsulates something in a neat little package. In cases like these it makes a lot of sense to make a view with that snippet of code. This view can also be materialized so that querying it is fast and efficient.

You won't know what that piece of code could be ahead of time but if you find yourself copying and pasting something in multiple files, that's a great opportunity to create a view. This goes back to the DRY principle but in this case applied across multiple files.

Creating a view is easy:
```
CREATE OR REPLACE VIEW <view_name> AS
	SELECT col1
	FROM table1
	WHERE col1 > x;
```

Once created you can run:
```
SELECT col1
FROM <view_name>
```
This view is now stored in the database but it doesn't take up any space (unless it's materialized) It only stores the query which is executed each time you select from the view or join the view in a query. 

*Note: In BigQuery views are considered like CTEs so they count towards the maximum level of nesting. That is if you call a view from inside a CTE, that's two levels of nesting and if you then join that CTE in another CTE that's three levels of nesting. BigQuery has a hard limitation on how deep nesting can go beyond which you can no longer run your query. At that point, perhaps the view is best materialized into a table.

